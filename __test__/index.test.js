const getSizes = require('../lib')

jest.setTimeout(10000)

test('main', async () => {
  const data = await getSizes('vue@2.0.0')
  expect(data).toMatchSnapshot()
})
