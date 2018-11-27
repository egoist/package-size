const execa = require('execa')

module.exports = function(deps, opts) {
  return execa.stdout('npm', ['install', '--save'].concat(deps), opts)
}
