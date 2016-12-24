#!/usr/bin/env node
'use strict'
const cac = require('cac')
const update = require('update-notifier')
const chalk = require('chalk')
const ora = require('ora')
const pkg = require('./package.json')

const cli = cac()

cli.command('*', pkg.description, (input, flags) => {
  const spinner = ora({text: 'Bundling...', spinner: 'arrow3'}).start()
  return require('./lib')(input, flags)
  .then(data => {
    spinner.stop()
    require('./lib/print')(data)
  })
  .catch(err => {
    spinner.text = 'failed'
    spinner.fail()
    if (err.name === 'WebpackOptionsValidationError') {
      console.log(err.message)
    } else {
      console.log(err.stack)
    }
    process.exit(1)
  })
})

cli.option('es6', 'Compile the input package down to ES5')
cli.option('cwd', 'Bundle package in current working directory')
cli.option('externals', 'Exclude packages from bundled file')

cli.example(`${chalk.yellow('package-size')} react,react-dom`)
cli.example(`${chalk.yellow('package-size')} styled-jsx/style --externals react`)
cli.example(`${chalk.yellow('package-size')} ./dist/my-bundle.js --cwd`)
cli.example(`${chalk.yellow('package-size')} vue@1 angular@1 react@0.14`)

cli.parse()

update({pkg: cli.pkg}).notify()
