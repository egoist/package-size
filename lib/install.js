const execa = require('execa')

module.exports = function(deps, registry, opts) {
  return execa.stdout('npm', ['install', '--save', '--registry', registry].concat(deps), opts)
}
