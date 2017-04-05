'use strict'
const os = require('os')
const path = require('path')
const fs = require('fs-promise')
const merge = require('webpack-merge')
const webpack = require('webpack')
const MemoryFS = require('memory-fs')
const parse = require('parse-package-name')
const CompressionPlugin = require('compression-webpack-plugin')
const find = require('lodash.find')
const rimraf = require('rimraf')
const co = require('co')
const execa = require('execa')

const ensureCachePath = co.wrap(function * () {
  const name = `package-size-${rs()}`
  const dir = path.join(os.tmpdir(), name)
  yield fs.ensureDir(dir)
  const data = {
    name,
    private: true,
    license: 'MIT'
  }
  yield fs.writeFile(path.join(dir, 'package.json'), JSON.stringify(data), 'utf8')
  return dir
})

const MODULE_DIR = /(.*([/\\]node_modules|\.\.)[/\\](@[^/\\]+[/\\])?[^/\\]+)([/\\].*)?$/g

module.exports = co.wrap(function * (name, opts = {}) {
  const outDir = yield ensureCachePath()
  const parsed = name.split(',').map(parse)

  const isCwd = opts.cwd || (name.charAt(0) === '.')

  const config = {
    entry: parsed.map(pkg => pkg.path ? path.join(pkg.name, pkg.path) : pkg.name),
    output: {
      path: outDir
    },
    resolve: {
      mainFields: ['browser'].concat(opts.es6 ? ['module', 'main'] : ['main', 'module']),
      modules: [
        path.join(__dirname, '../node_modules')
      ]
    },
    performance: {
      hints: false
    },
    module: {
      rules: [{
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
          return opts.es6 && parsed.some(pkg => {
            const re = new RegExp(`node_modules[\\/\\\\]${pkg.name}`)
            return re.test(filepath)
          })
        }
      }]
    }
  }

  if (isCwd) {
    config.resolve.modules.unshift(path.join(process.cwd(), 'node_modules'))
  } else {
    config.resolve.modules.unshift(path.join(outDir, 'node_modules'))
    yield install(parsed.map(pkg => pkg.version ? `${pkg.name}@${pkg.version}` : pkg.name), { cwd: outDir })
  }

  if (opts.externals) {
    const externals = Array.isArray(opts.externals) ? opts.externals : [opts.externals]
    config.externals = externals.map(v => typeof v === 'string' ? new RegExp(`^${v}$`) : v)
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
      }),
      /* eslint-enable camelcase */
      new CompressionPlugin()
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

  yield rm(outDir)
  const devAssets = devStats.toJson().assets
  const prodAssets = prodStats.toJson().assets
  const asset = devAssets[0]

  return {
    name,
    size: asset.size,
    minified: find(prodAssets, v => {
      return decodeURIComponent(v.name) === `prod.js`
    }).size,
    gzipped: find(prodAssets, v => {
      return decodeURIComponent(v.name) === `prod.js.gz`
    }).size
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
      return yarn ? execa.stdout('yarn', ['add'].concat(deps), opts) : execa.stdout('npm', ['install', '--save'].concat(deps), opts)
    })
}

function rm(dir) {
  return new Promise((resolve, reject) => {
    rimraf(dir, err => {
      if (err) return reject(err)
      resolve()
    })
  })
}
