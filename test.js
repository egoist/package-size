import test from 'ava'
import getSizes from './lib'

test('main', async t => {
  const data = await getSizes('vue@2.0.0')
  t.deepEqual(data, {
    name: 'vue@2.0.0',
    size: 189570,
    minified: 74576,
    gzipped: 27267,
    versionedName: 'vue@2.0.0'
  })
})
