import test from 'ava'
import getSizes from './lib'

test('main', async t => {
  const data = await getSizes('vue@2.0.0')
  t.deepEqual(data, {
    name: 'vue@2.0.0',
    size: 188881,
    minified: 74884,
    gzipped: 27715
  })
})
