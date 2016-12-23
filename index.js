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
const pSeries = require('p-series')

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

function stripVersion(v) {
  return v.replace(/@[\s\S]+$/, '')
}

function parsePackageName(name) {
  const matchVersion = /@([\s\S]+)$/
  const matchPath = /(\/[\s\S]+)$/
  const matchedVersion = name.match(matchVersion)
  name = name.replace(matchVersion, '')
  const matchedPath = name.match(matchPath)
  name = name.replace(matchPath, '')
  return {
    name,
    path: (matchedPath && matchedPath[1]) || '',
    version: (matchedVersion && matchedVersion[1]) || ''
  }
}

module.exports = function (packages, options) {
  const spinner = ora()
  const cacheDir = ensureCachePath()

  const verbose = options.verbose

  // install packages if not going to bundle in cwd
  if (options.cwd) {
    spinner.text = 'Bundle...'
    spinner.start()
  } else {
    spinner.text = 'Prepare...'
    spinner.start()

    let toInstall = []
    packages.forEach(name => {
      if (name.indexOf(',') === -1) {
        const info = parsePackageName(name)
        toInstall.push(info.name + (info.version ? `@${info.version}` : ''))
      } else {
        toInstall = toInstall.concat(name.split(',').map(v => {
          const info = parsePackageName(name)
          return info.name + (info.version ? `@${info.version}` : '')
        }))
      }
    })
    const cmd = install(toInstall, {cwd: cacheDir, stdio: 'pipe', showCommand: verbose})
    if (cmd.status !== 0) {
      spinner.stop()
      console.log(cmd.stderr.toString())
      process.exit(cmd.status)
    }
  }

  const exclude = options.es6 ? [] : [/node_modules/]

  const config = {
    entry: packages.reduce((current, next) => {
      if (next.indexOf(',') === -1) {
        const info = parsePackageName(next)
        current[next] = info.name + info.path
      } else {
        current[next] = next.split(',').map(name => {
          const info = parsePackageName(name)
          return info.name + info.path
        })
      }
      return current
    }, {}),
    resolve: {
      modules: [
        options.cwd ?
          path.join(process.cwd(), 'node_modules') :
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

  spinner.text = 'Bundle...'

  return pSeries([
    () => runWebpack(getDevConfig(config)),
    () => runWebpack(getProdConfig(config))
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
        prettyBytes(find(prodAssets, v => {
          return decodeURIComponent(v.name) === `${name}.js`
        }).size), // minified
        prettyBytes(find(prodAssets, v => {
          return decodeURIComponent(v.name) === `${name}.js.gz`
        }).size) // minified + gzipped
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
  })
}
