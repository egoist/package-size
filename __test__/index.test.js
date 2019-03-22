const getSizes = require('../lib')

jest.setTimeout(10000)

test('main', async () => {
  const { size, ...data } = await getSizes('vue@2.0.0')
  expect(data).toMatchSnapshot()
  expect(size > 189000 && size < 190000).toBe(true)
})
