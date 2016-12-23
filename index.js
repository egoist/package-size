'use strict'
const os = require('os')
const fs = require('fs')
const path = require('path')
const webpack = require('webpack-egoist')
const home = require('user-home')
const install = require('yarn-install')
const ora = require('ora')
const chalk = require('chalk')
const MemoryFS = require('memory-fs')
const table = require('text-table')
const prettyBytes = require('pretty-bytes')
const merge = require('webpack-merge')
const Gzip = require('compression-webpack-plugin')
const getWidth = require('string-width')
const find = require('lodash.find')

function ensureCachePath() {
  const dir = path.join(home, '.package-size-cache')
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir)
    const data = {
      name: 'package-size-cache',
      private: true,
      license: 'MIT'
    }
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(data), 'utf8')
  }
  return dir
}

function getDevConfig(config) {
  return merge(config, {
    plugins: [
      new webpack.DefinePlugin({
        'process.env.NODE_ENV': JSON.stringify('development')
      })
    ]
  })
}

function getProdConfig(config) {
  return merge(config, {
    plugins: [
      new webpack.DefinePlugin({
        'process.env.NODE_ENV': JSON.stringify('production')
      }),
      new Gzip(),
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
}

function handleError(stats) {
  if (stats.hasErrors() || stats.hasWarnings()) {
    console.log(stats.toString('errors-only'))
    process.exit(1)
  }
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

module.exports = function (packages, options) {
  const spinner = ora('Prepare...').start()
  const cacheDir = ensureCachePath()

  let toInstall = []
  packages.forEach(name => {
    if (name.indexOf(',') === -1) {
      toInstall.push(name)
    } else {
      toInstall = toInstall.concat(name.split(','))
    }
  })

  spinner.text = 'Bundling...'
  install(toInstall, {cwd: cacheDir, stdio: 'ignore'})

  const exclude = options.es6 ? [] : [/node_modules/]

  const config = {
    entry: packages.reduce((current, next) => {
      current[next] = next.indexOf(',') === -1 ? next : next.split(',')
      return current
    }, {}),
    resolve: {
      modules: [
        path.join(cacheDir, 'node_modules')
      ]
    },
    performance: {
      hints: false
    },
    resolveLoader: {
      modules: [
        path.join(__dirname, 'node_modules'),
        path.join(__dirname, '../')
      ]
    },
    module: {
      rules: [
        {
          test: /\.js$/,
          loader: 'buble-loader',
          exclude
        }
      ]
    },
    output: {
      path: path.join(os.tmpdir(), 'package-size-dist'),
      filename: '[name].js'
    }
  }

  Promise.all([
    runWebpack(getDevConfig(config)),
    runWebpack(getProdConfig(config))
  ]).then(([devStats, prodStats]) => {
    spinner.stop()
    handleError(prodStats)
    const devAssets = devStats.toJson().assets
    const prodAssets = prodStats.toJson().assets

    let results = devAssets.map(asset => {
      const name = asset.chunkNames[0]
      return [
        chalk.yellow(name), // package name
        prettyBytes(asset.size), // size
        prettyBytes(find(prodAssets, {name: `${name}.js`}).size), // minified
        prettyBytes(find(prodAssets, {name: `${name}.js.gz`}).size) // minified + gzipped
      ]
    })

    results = [
      ['package', 'size', 'minified', 'minified + gzipped'].map(v => chalk.bold(v))
    ].concat(results)

    console.log()
    const statTable = table(results, {
      stringLength: getWidth
    }).replace(/^/gm, '  ')
    console.log(statTable)
    console.log()
  }).catch(err => {
    console.log(err.stack)
    process.exit(1)
  })
}
