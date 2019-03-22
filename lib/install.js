const execa = require('execa')

module.exports = function(deps, registry, opts) {
  const args = ['install', '--save'].concat(deps)
  if (registry) {
    args.push('--registry', registry)
  }
  return execa.stdout('npm', args, opts)
}
