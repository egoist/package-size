'use strict'
const os = require('os')
const path = require('path')
const fs = require('fs-extra')
const merge = require('webpack-merge')
const webpack = require('webpack')
const MemoryFS = require('memory-fs')
const parse = require('parse-package-name')
const find = require('lodash.find')
const chalk = require('chalk')
const co = require('co')
const execa = require('execa')
const gzipSize = require('gzip-size')
const debug = require('debug')('package-size')
const shouldTransform = require('webpack-node-modules')()
const cache = require('./cache')

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
    devtool: false,
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
      modules: [path.join(__dirname, '../node_modules')]
    },
    performance: {
      hints: false
    },
    externals: [],
    node: {
      fs: 'empty',
      net: 'empty',
      tls: 'empty',
      dns: 'mock'
    },
    plugins: [
      opts.debug && {
        apply(compiler) {
          compiler.hooks.done.tap('stats', stats => {
            const res = stats.toString({
              colors: true,
              chunks: false,
              children: false,
              modules: false,
              version: false,
              hash: false
            })
            console.log(`\n  ${chalk.bold.blue.inverse(` Bundled ${name} `)}\n`)
            console.log(res.replace(/^\s*/mg, '  ') + '\n')
          })
        }
      }
    ].filter(Boolean)
  }

  const packageInfo = {} // {name:<contents of package.json>}

  if (isCwd) {
    config.resolve.modules.unshift(path.join(process.cwd(), 'node_modules'))
    const pkg = yield readPkg(process.cwd())
    config.externals = config.externals.concat(
      pkg.peerDependencies ? Object.keys(pkg.peerDependencies) : []
    )

    packageInfo[pkg.name] = pkg // Save package info for caching
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
          packageInfo[pkg.name] = pkg // Save package info for caching

          config.externals = config.externals.concat(
            pkg.peerDependencies ? Object.keys(pkg.peerDependencies) : []
          )
        })
      })
    )
  }

  // Create a deterministic cache key, by taking the version specifiers
  // for each package and sorting them
  const cacheKey = Object.keys(packageInfo)
    .map(name => `${name}:${packageInfo[name].version}`)
    .sort()
    .join(',')
    .replace(/\./g, '-')

    // The cache key replaces the '.'s with '-' so DotProp in `conf` won't
  // store the build sizes as nested objects.

  // If the key is present in the cache, return the values without re-running
  // the webpack build.
  if (!opts.debug && cache.has(cacheKey) && opts.cache !== false) {
    return cache.get(cacheKey)
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
    mode: 'development',
    output: {
      filename: 'dev.js'
    }
  })

  const prodConfig = merge(config, {
    mode: 'production',
    output: {
      filename: 'prod.js'
    }
  })

  debug('webpack version', require('webpack/package').version)

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

  const info = {
    name,
    versionedName: Object.keys(packageInfo)
      .map(name => `${name}@${packageInfo[name].version}`)
      .join(','),
    size: asset.size - 2753, // minus webpack runtime size
    minified: find(prodAssets, v => {
      return decodeURIComponent(v.name) === `prod.js`
    }).size - 537,
    gzipped: prodGzipSize - 297
  }

  // Cache the package size information.
  cache.set(cacheKey, info)

  return info
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
