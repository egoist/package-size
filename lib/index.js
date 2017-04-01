'use strict'
const os = require('os')
const fs = require('fs')
const path = require('path')
const merge = require('webpack-merge')
const install = require('yarn-install')
const webpack = require('webpack')
const MemoryFS = require('memory-fs')
const parse = require('parse-package-name')
const CompressionPlugin = require('compression-webpack-plugin')
const find = require('lodash.find')

module.exports = function (name, opts = {}) {
  const outDir = ensureCachePath()
  const parsed = name.split(',').map(parse)

  const isCwd = opts.cwd || (name.charAt(0) === '.')

  const config = {
    entry: parsed.map(pkg => pkg.path ? path.join(pkg.name, pkg.path) : pkg.name),
    output: {
      path: outDir,
      filename: 'main.js'
    },
    resolve: {
      modules: []
    },
    performance: {
      hints: false
    },
    module: {
      rules: [{
        test: /\.jsx?$/,
        loader: require.resolve('buble-loader'),
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
    config.resolve.modules.push(path.join(process.cwd(), 'node_modules'))
  } else {
    config.resolve.modules.push(path.join(outDir, 'node_modules'))
    install(parsed.map(pkg => pkg.version ? `${pkg.name}@${pkg.version}` : pkg.name), {cwd: outDir, stdio: 'ignore'})
  }

  if (opts.externals) {
    const externals = Array.isArray(opts.externals) ? opts.externals : [opts.externals]
    config.externals = externals.map(v => typeof v === 'string' ? new RegExp(`^${v}$`) : v)
  }

  const devConfig = merge(config, {
    plugins: [
      new webpack.DefinePlugin({
        'process.env.NODE_ENV': JSON.stringify('development')
      })
    ]
  })

  const prodConfig = merge(config, {
    plugins: [
      new webpack.DefinePlugin({
        'process.env.NODE_ENV': JSON.stringify('production')
      }),
      new CompressionPlugin(),
      new webpack.LoaderOptionsPlugin({
        minimize: true
      }),
      new webpack.optimize.UglifyJsPlugin({
        sourceMap: false,
        compressor: {
          warnings: false
        },
        output: {
          comments: false
        }
      })
    ]
  })

  return Promise.all([
    runWebpack(devConfig),
    runWebpack(prodConfig)
  ]).then(([devStats, prodStats]) => {
    const devAssets = devStats.toJson().assets
    const prodAssets = prodStats.toJson().assets
    const asset = devAssets[0]

    return [
      name,
      asset.size, // Size
      find(prodAssets, v => {
        return decodeURIComponent(v.name) === `main.js`
      }).size, // Minified
      find(prodAssets, v => {
        return decodeURIComponent(v.name) === `main.js.gz`
      }).size // Minified + gzipped
    ]
  })
}

function rs() {
  return Math.random().toString(36).substring(7)
}

function ensureCachePath() {
  const name = `package-size-${rs()}`
  const dir = path.join(os.tmpdir(), name)
  fs.mkdirSync(dir)
  const data = {
    name,
    private: true,
    license: 'MIT'
  }
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(data), 'utf8')
  return dir
}

function runWebpack(config) {
  return new Promise((resolve, reject) => {
    const compiler = webpack(config)
    compiler.outputFileSystem = new MemoryFS()
    compiler.run((err, stats) => {
      if (err) return reject(err)
      resolve(stats)
    })
  })
}
