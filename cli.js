#!/usr/bin/env node
'use strict'
const cac = require('cac')
const update = require('update-notifier')
const chalk = require('chalk')
const createTable = require('text-table')
const getWidth = require('string-width')
const prettyBytes = require('pretty-bytes')
const logUpdate = require('log-update')
const ora = require('ora')
const pkg = require('./package.json')

const cli = cac()

cli.command('*', pkg.description, (input, flags) => {
  if (input.length === 0) return cli.showHelp()

  const spinner = ora({ spinner: 'simpleDotsScrolling' })

  const stats = input.map(name => ({
    name,
    size: -1,
    minified: -1,
    gzipped: -1
  }))

  const render = () => {
    let result = [].concat(stats)

    if (flags.sort) {
      result = result
        .sort((a, b) => {
          return a.gzipped > b.gzipped
        })
    }

    const frame = spinner.frame()

    result = result.map(item => {
      const prettify = v => v > 0 ?
        prettyBytes(v) : frame

      return [
        '  ' + chalk.yellow(item.name),
        prettify(item.size),
        prettify(item.minified),
        prettify(item.gzipped)
      ]
    })

    result.unshift(['  package', 'size', 'minified', 'minified+gzipped'].map(v => chalk.bold(v)))

    const table = `\n${createTable(result, { stringLength: getWidth })}\n`

    logUpdate(table)
  }

  const build = require('./lib')

  this.timer = setInterval(render, 100)

  Promise.all(input.map((name, index) => {
    return build(name, flags).then(stat => {
      stats[index] = stat
      render()
    })
  })).then(() => clearInterval(this.timer)).catch(err => {
    clearInterval(this.timer)
    logUpdate('')
    handlerError(err)
  })
})

cli.option('es6', 'Compile the input package down to ES5')
cli.option('cwd', 'Bundle package in current working directory')
cli.option('externals', 'Exclude packages from bundled file')
cli.option('sort', 'Sort packages from small to big bundle size')

cli.example(`${chalk.yellow('package-size')} react,react-dom`)
cli.example(`${chalk.yellow('package-size')} styled-jsx/style --externals react`)
cli.example(`${chalk.yellow('package-size')} ./dist/my-bundle.js`)
cli.example(`${chalk.yellow('package-size')} local-package --cwd`)
cli.example(`${chalk.yellow('package-size')} vue@1 angular@1 react@0.14`)

cli.parse()

function handlerError(err) {
  if (err.name === 'WebpackOptionsValidationError') {
    stderr(err.message)
  } else if (err.message.indexOf('in prod.js from UglifyJs') > -1) {
    stderr(`${err.message.trim()}\n\nThis package might contain ES6+ code, try using \`--es6\` option\n\nIf it's still happening, maybe this package is using some syntax that buble doesn't support.`)
  } else {
    stderr(err.stack)
  }

  process.exit(1)
}

function stderr(msg) {
  console.log(`${chalk.bgRed.black(' ERROR ')} Compiled with errors!`)
  console.log('\n' + msg)
  console.log()
}

update({ pkg: cli.pkg }).notify()
