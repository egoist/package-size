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
const gzipSize = require('gzip-size')
const yarnGlobal = require('yarn-global')
const debug = require('debug')('package-size')
const cache = require('./cache')
const install = require('./install')

const statOptions = {
  colors: true,
  chunks: false,
  children: false,
  modules: false,
  hash: false,
  timings: false,
  builtAt: false
}

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
  const registry = opts.registry

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
            const res = stats.toString(statOptions)
            console.log(`\n  ${chalk.bold.blue.inverse(` Bundled ${name} `)}\n`)
            console.log(res.replace(/^\s*/gm, '  ') + '\n')
          })
        }
      }
    ].filter(Boolean)
  }

  const packageInfo = {} // {name:<contents of package.json>}

  if (yarnGlobal.inDirectory(__dirname)) {
    config.resolve.modules.push(path.join(yarnGlobal.getDirectory()))
  }

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
      registry,
      { cwd: outDir }
    )
    yield Promise.all(
      parsed.map(p => {
        return readPkg(path.join(outDir, 'node_modules', p.name)).then(pkg => {
          packageInfo[pkg.name] = pkg // Save package info for caching

          config.externals = config.externals.concat(
            pkg.peerDependencies
              ? Object.keys(pkg.peerDependencies).filter(name => {
                  // Don't include packages in the `externals` if they are also in `entry`
                  return parsed.every(parsedPkg => parsedPkg.name !== name)
                })
              : []
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
  if (
    !opts.analyze &&
    !opts.debug &&
    cache.has(cacheKey) &&
    opts.cache !== false &&
    process.env.NODE_ENV !== 'test'
  ) {
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

  debug('webpack version', require('webpack/package').version)

  const prodConfig = merge(config, {
    mode: 'production',
    output: {
      filename: 'prod.js'
    },
    optimization: {
      minimize: true,
      minimizer: [
        {
          apply(compiler) {
            // eslint-disable-next-line import/no-extraneous-dependencies
            const Terser = require('terser-webpack-plugin')
            new Terser({
              cache: true,
              parallel: true,
              sourceMap: false,
              terserOptions: {
                output: {
                  comments: false
                },
                mangle: true
              }
            }).apply(compiler)
          }
        }
      ]
    }
  })

  if (opts.analyze) {
    const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer')

    prodConfig.plugins.push(new BundleAnalyzerPlugin())
    console.log('Please wait..')
    const stats = yield runWebpack(prodConfig)
    console.log(stats.toString(statOptions))
  }

  const devConfig = merge(config, {
    mode: 'development',
    output: {
      filename: 'dev.js'
    }
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

  const info = {
    name,
    versionedName: parsed
      .map(
        pkg =>
          `${pkg.name}${pkg.path ? `/${pkg.path}` : ''}@${packageInfo[pkg.name].version}`
      )
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
