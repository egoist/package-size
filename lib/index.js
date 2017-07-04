'use strict'
const os = require('os')
const path = require('path')
const fs = require('fs-extra')
const merge = require('webpack-merge')
const webpack = require('webpack')
const MemoryFS = require('memory-fs')
const parse = require('parse-package-name')
const find = require('lodash.find')
const co = require('co')
const execa = require('execa')
const gzipSize = require('gzip-size')
const shouldTransform = require('webpack-node-modules')()

const ensureCachePath = co.wrap(function*() {
  const name = `package-size-${rs()}`
  const dir = path.join(os.tmpdir(), name)
  yield fs.ensureDir(dir)
  const data = {
    name,
    private: true,
    license: 'MIT'
  }
  yield fs.writeFile(
    path.join(dir, 'package.json'),
    JSON.stringify(data),
    'utf8'
  )
  return dir
})

module.exports = co.wrap(function*(name, opts = {}) {
  const outDir = yield ensureCachePath()
  const parsed = name.split(',').map(parse)

  // When you run `package-size ./dist/index.js,react`
  // Or `package-size react-dom,react --cwd`
  // All packages will be fetched from cwd.
  const isFile = name.charAt(0) === '.'
  const isCwd = opts.cwd || isFile

  const config = {
    entry: parsed.map(pkg => {
      if (pkg.name === '.' || pkg.path) {
        return pkg.name + '/' + pkg.path
      }
      return pkg.name
    }),
    output: {
      path: outDir
    },
    resolve: {
      mainFields: ['browser'].concat(
        opts.es6 ? ['module', 'main'] : ['main', 'module']
      ),
      modules: [path.join(__dirname, '../node_modules')]
    },
    performance: {
      hints: false
    },
    externals: [],
    module: {
      rules: [
        {
          test: /\.jsx?$/,
          loader: require.resolve('buble-loader'),
          options: {
            transforms: {
              dangerousForOf: true,
              modules: false,
              dangerousTaggedTemplateString: true
            }
          },
          include(filepath) {
            const isDependency = parsed.some(pkg => {
              const re = new RegExp(`node_modules[\\/\\\\]${pkg.name}`)
              return re.test(filepath)
            })
            return (
              shouldTransform(filepath) || (opts.es6 && (isDependency || isCwd))
            )
          }
        }
      ]
    },
    node: {
      fs: 'empty',
      net: 'empty',
      tls: 'empty',
      dns: 'mock'
    }
  }

  if (isCwd) {
    config.resolve.modules.unshift(path.join(process.cwd(), 'node_modules'))
    const pkg = yield readPkg(process.cwd())
    config.externals = config.externals.concat(
      pkg.peerDependencies ? Object.keys(pkg.peerDependencies) : []
    )
  } else {
    config.resolve.modules.unshift(path.join(outDir, 'node_modules'))
    yield install(
      parsed.map(
        pkg => (pkg.version ? `${pkg.name}@${pkg.version}` : pkg.name)
      ),
      { cwd: outDir }
    )
    yield Promise.all(
      parsed.map(p => {
        return readPkg(path.join(outDir, 'node_modules', p.name)).then(pkg => {
          config.externals = config.externals.concat(
            pkg.peerDependencies ? Object.keys(pkg.peerDependencies) : []
          )
        })
      })
    )
  }

  if (opts.externals) {
    const externals = Array.isArray(opts.externals)
      ? opts.externals
      : [opts.externals]
    config.externals = config.externals.concat(
      externals.map(v => (typeof v === 'string' ? new RegExp(`^${v}$`) : v))
    )
  }

  const devConfig = merge(config, {
    output: {
      filename: 'dev.js'
    },
    plugins: [
      new webpack.DefinePlugin({
        'process.env.NODE_ENV': JSON.stringify('development')
      })
    ]
  })

  const prodConfig = merge(config, {
    output: {
      filename: 'prod.js'
    },
    plugins: [
      new webpack.DefinePlugin({
        'process.env.NODE_ENV': JSON.stringify('production')
      }),
      new webpack.LoaderOptionsPlugin({
        minimize: true,
        debug: false
      }),
      /* eslint-disable camelcase */
      new webpack.optimize.UglifyJsPlugin({
        sourceMap: false,
        beautify: false,
        mangle: {
          screw_ie8: true
        },
        compress: {
          screw_ie8: true
        },
        compressor: {
          warnings: false
        },
        output: {
          comments: false
        }
      })
      /* eslint-enable camelcase */
    ]
  })

  const [devStats, prodStats] = yield Promise.all([
    runWebpack(devConfig),
    runWebpack(prodConfig)
  ])

  if (devStats.hasErrors()) {
    throw new Error(devStats.toString('errors-only'))
  }
  if (prodStats.hasErrors()) {
    throw new Error(prodStats.toString('errors-only'))
  }

  yield fs.remove(outDir)
  const devAssets = devStats.toJson().assets
  const prodAssets = prodStats.toJson().assets
  const asset = devAssets[0]

  const { outputOptions } = prodStats.compilation
  const { outputFileSystem } = prodStats.compilation.compiler
  const prodOutputFilePath = path.join(
    outputOptions.path,
    outputOptions.filename
  )
  const prodGzipSize = yield promisify(gzipSize)(
    outputFileSystem.readFileSync(prodOutputFilePath, 'utf8')
  )

  return {
    name,
    size: asset.size - 2753, // minus webpack runtime size
    minified: find(prodAssets, v => {
      return decodeURIComponent(v.name) === `prod.js`
    }).size - 537,
    gzipped: prodGzipSize - 297
  }
})

function rs() {
  return Math.random().toString(36).substring(7)
}

function runWebpack(config) {
  return new Promise((resolve, reject) => {
    const compiler = webpack(config)
    const mfs = new MemoryFS()
    compiler.outputFileSystem = mfs
    compiler.run((err, stats) => {
      if (err) return reject(err)
      resolve(stats)
    })
  })
}

function install(deps, opts) {
  let yarn = true
  return execa('yarn', ['--version'])
    .catch(err => {
      if (err.code === 'ENOENT') {
        yarn = false
        return
      }
      throw err
    })
    .then(() => {
      return yarn
        ? execa.stdout('yarn', ['add'].concat(deps), opts)
        : execa.stdout('npm', ['install', '--save'].concat(deps), opts)
    })
}

function readPkg(dir) {
  return fs
    .readFile(path.join(dir, 'package.json'), 'utf8')
    .then(JSON.parse)
    .catch(() => ({})) // eslint-disable-line handle-callback-err
}

function promisify(fn) {
  return (...args) =>
    new Promise((resolve, reject) => {
      fn(...args, (err, result) => {
        if (err) return reject(err)
        resolve(result)
      })
    })
}
