#!/usr/bin/env node
'use strict'
const cac = require('cac')
const update = require('update-notifier')
const chalk = require('chalk')
const ora = require('ora')
const createTable = require('text-table')
const getWidth = require('string-width')
const prettyBytes = require('pretty-bytes')
const pkg = require('./package.json')

const cli = cac()

cli.command('*', pkg.description, (input, flags) => {
  const spinner = ora('Processing...')

  let result = []

  const render = () => {
    if (flags.sort) {
      result = result
        .sort((a, b) => {
          return a.gzipped > b.gzipped
        })
    }

    result = result.map(item => {
      return [
        '  ' + chalk.yellow(item.name),
        prettyBytes(item.size),
        prettyBytes(item.minified),
        prettyBytes(item.gzipped)
      ]
    })

    result.unshift(['  package', 'size', 'minified', 'minified+gzipped'].map(v => chalk.bold(v)))

    console.log()
    console.log(createTable(result, { stringLength: getWidth }))
    console.log()
  }

  spinner.start()

  const build = require('./lib')

  Promise.all(input.map(name => {
    return build(name, flags)
  })).then(stats => {
    result = stats
    spinner.stop()
    render()
  }).catch(err => {
    spinner.stop()
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
  } else if (err.message.indexOf('from UglifyJs') > -1 && err.message.indexOf('Unexpected token') > -1) {
    stderr('The package contains ES6+ code, please use `--es6` option')
  } else {
    stderr(err.stack)
  }

  process.exit(1)
}

function stderr(msg) {
  console.log()
  console.log(`${chalk.bgRed.black(' ERROR ')} Compiled with errors!`)
  console.log('\n' + msg)
  console.log()
}

update({ pkg: cli.pkg }).notify()
