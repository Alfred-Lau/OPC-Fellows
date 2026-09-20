import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { clip, collectFeatures, generateSocialCopy } from './social-copy.ts'
import { cloneProduct, EXAMPLE_PRODUCT, getProducts, setProducts } from './products.ts'

const demo = cloneProduct(EXAMPLE_PRODUCT)
const previousProducts = getProducts()

before(() => {
  setProducts([demo])
})

after(() => {
  setProducts(previousProducts)
})

test('产品目录生成六平台文案', () => {
  const features = collectFeatures()
  assert.equal(features[0]?.product.id, 'demo')
  const drafts = generateSocialCopy(features)
  assert.equal(drafts.length, 6)
  const x = drafts.find((item) => item.platform === 'x')
  const xhs = drafts.find((item) => item.platform === 'xiaohongshu')
  const yt = drafts.find((item) => item.platform === 'youtube')
  assert.ok(x)
  assert.ok(xhs)
  assert.ok(yt)
  assert.ok(Array.from(x.body).length <= 280)
  assert.ok(Array.from(xhs.title).length <= 20)
  assert.ok(Array.from(yt.title).length <= 100)
  assert.ok(x.body.includes('https://example.com/'))
  assert.ok(xhs.body.includes('一人公司'))
  assert.ok(yt.format.includes('Shorts'))
})

test('空目录不编弹药', () => {
  setProducts([])
  assert.deepEqual(collectFeatures(), [])
  assert.deepEqual(generateSocialCopy(collectFeatures()), [])
  setProducts([demo])
})

test('clip 截断到上限', () => {
  assert.equal(clip('abcd', 3), 'ab…')
  assert.equal(clip('ab', 3), 'ab')
})

test('toolkit 线仍用工具包口吻，research 线仍用研究口吻', () => {
  const research = generateSocialCopy(collectFeatures()).find((item) => item.platform === 'youtube')
  assert.match(research?.body ?? '', /keep research and shipping in one place/)
  setProducts([{ ...cloneProduct(EXAMPLE_PRODUCT), line: 'toolkit' }])
  const toolkit = generateSocialCopy(collectFeatures()).find((item) => item.platform === 'youtube')
  assert.match(toolkit?.body ?? '', /run the OPC toolkit/)
  setProducts([demo])
})
