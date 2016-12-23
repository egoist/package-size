#!/usr/bin/env node
'use strict'
const cac = require('cac')
const main = require('./')
const pkg = require('./package.json')

const cli = cac()

cli.command('*', pkg.description, main)

cli.parse()
