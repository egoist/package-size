#!/usr/bin/env node

'use strict'
const cac = require('cac')
const fs = require('fs-extra')
const update = require('update-notifier')
const chalk = require('chalk')
const createTable = require('text-table')
const getWidth = require('string-width')
const bytes = require('bytes')
const logUpdate = require('log-update')
const ora = require('ora')
const cache = require('./lib/cache')
const pkg = require('./package.json')

const cli = cac()

cli.command('clear-cache', 'Clear the package size cache.').action(() => {
  cache.clear()
  console.log('Done!')
})

cli
  .command('[...packages]', pkg.description)
  .action((input, flags) => {
    if (input.length === 0) return cli.outputHelp()

    if (flags.debug) {
      process.env.DEBUG = 'package-size'
    }

    if (flags.analyze) {
      return require('./lib')(input.join(','), flags)
    }

    const spinner = ora({ spinner: 'simpleDotsScrolling' })

    const stats = input.map(name => ({
      name,
      size: -1,
      minified: -1,
      gzipped: -1
    }))

    let finalTable

    const render = () => {
      let result = [].concat(stats)

      if (flags.sort) {
        result = result.sort((a, b) => {
          return a.gzipped > b.gzipped
        })
      }

      const frame = spinner.frame()

      result = result.map(item => {
        const prettify = v => (v > 0 ? bytes(v, { unitSeparator: ' ' }) : frame)

        return [
          `  ${chalk.yellow(item.versionedName || item.name)}`,
          prettify(item.size),
          prettify(item.minified),
          prettify(item.gzipped)
        ]
      })

      result.unshift(
        ['  package', 'size', 'minified', 'gzipped'].map(v => chalk.bold(v))
      )

      const table = `\n${createTable(result, { stringLength: getWidth })}\n`

      if (!flags.debug) {
        logUpdate(table)
      }

      finalTable = table
    }

    const build = require('./lib')

    this.timer = setInterval(render, 100)

    Promise.all(
      input.map((name, index) => {
        return build(name, flags).then(stat => {
          stats[index] = stat
          render()
        })
      })
    )
      .then(() => clearInterval(this.timer))
      .then(() => {
        if (flags.debug) {
          console.log(finalTable)
        }
        if (flags.output) {
          const outputFile = typeof flags.output === 'string'
            ? flags.output
            : 'package-size-output.json'
          return fs
            .writeFile(outputFile, JSON.stringify(stats, null, 2), 'utf8')
            .then(() => {
              console.log(
                `> Results have been saved to ${outputFile} in JSON format.`
              )
            })
        }
      })
      .catch(err => {
        clearInterval(this.timer)
        handlerError(err)
      })
  })
  .option('--debug', 'Show debug output')
  .option('--cwd', 'Bundle package in current working directory')
  .option('--externals <externals>', 'Exclude packages from bundled file')
  .option('--sort', 'Sort packages from small to big bundle size')
  .option('--no-cache', 'Disable module size caching')
  .option('--output', 'Save results to file system in JSON format')
  .option('--analyze', 'Analyze bundled files')
  .example(`  package-size react,react-dom`)
  .example(`  package-size styled-jsx/style --externals react`)
  .example(`  package-size ./dist/my-bundle.js`)
  .example(`  package-size local-package --cwd`)
  .example(`  package-size vue@1 angular@1 react@0.14`)

cli.version(pkg.version)
cli.help()

cli.parse()

function handlerError(err) {
  logUpdate('')

  if (err.name === 'WebpackOptionsValidationError') {
    stderr(err.message)
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

update({ pkg }).notify()
