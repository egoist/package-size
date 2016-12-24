import test from 'ava'
import getSizes from './lib'

test('main', async t => {
  try {
    const data = await getSizes(['vue@2.0.0'])
    t.deepEqual(data, [
      ['vue@2.0.0', '191 kB', '75.6 kB', '28.1 kB']
    ])
  } catch (err) {
    t.fail(err.message)
  }
})
