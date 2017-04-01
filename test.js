import test from 'ava'
import getSizes from './lib'

test('main', async t => {
  try {
    const data = await getSizes('vue@2.0.0')
    t.deepEqual(data, ['vue@2.0.0', 191628, 75432, 27970])
  } catch (err) {
    t.fail(err.message)
  }
})
