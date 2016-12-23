#!/usr/bin/env node
'use strict'
const cac = require('cac')
const update = require('update-notifier')
const main = require('./')
const pkg = require('./package.json')

const cli = cac()

cli.command('*', pkg.description, main)

cli.option('es6', 'Compile the input package down to ES5')

cli.parse()

update({pkg: cli.pkg}).notify()
