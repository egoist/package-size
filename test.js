import test from 'ava'
import getSizes from './lib'

test('main', async t => {
  try {
    const data = await getSizes('vue@2.0.0')
    t.deepEqual(data, {
      name: 'vue@2.0.0',
      size: 191628,
      minified: 75432,
      gzipped: 27970
    })
  } catch (err) {
    t.fail(err.message)
  }
})
