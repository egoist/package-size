'use strict'
const chalk = require('chalk')
const table = require('text-table')
const getWidth = require('string-width')

module.exports = function (results) {
  results = [
    ['package', 'size', 'minified', 'minified + gzipped'].map(v => chalk.bold(v))
  ].concat(results.map(items => {
    items[0] = chalk.yellow(items[0])
    return items
  }))

  console.log()
  const statTable = table(results, {
    stringLength: getWidth
  }).replace(/^/gm, '  ')
  console.log(statTable)
  console.log()
}
