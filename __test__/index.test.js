const getSizes = require('../lib')

test('main', () => {
  return getSizes(['vue@2.0.0'])
    .then(data => {
      expect(data).toEqual([
        ['vue@2.0.0', '191 kB', '75.6 kB', '28.1 kB']
      ])
    })
})
