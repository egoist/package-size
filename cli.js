#!/usr/bin/env node
'use strict'
const cac = require('cac')
const update = require('update-notifier')
const main = require('./')
const pkg = require('./package.json')

const cli = cac()

cli.command('*', pkg.description, (input, flags) => {
  return main(input, flags).catch(err => {
    console.log(err.stack)
    process.exit(1)
  })
})

cli.option('es6', 'Compile the input package down to ES5')
cli.option('cwd', 'Bundle package in current working directory')

cli.parse()

update({pkg: cli.pkg}).notify()
