const execa = require('execa')

module.exports = function(deps, opts) {
  let yarn = true
  return execa('yarn', ['--version'])
    .catch(err => {
      if (err.code === 'ENOENT') {
        yarn = false
        return
      }
      throw err
    })
    .then(() => {
      return yarn
        ? execa.stdout('yarn', ['add'].concat(deps), opts)
        : execa.stdout('npm', ['install', '--save'].concat(deps), opts)
    })
}
