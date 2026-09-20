import assert from 'node:assert/strict'
import test from 'node:test'
import { cloneProduct, EXAMPLE_PRODUCT, getProducts } from '../../shared/products.ts'
import { OPC_PROJECT_TAG, getProjectTag, setProjectTag } from '../../shared/tags.ts'
import { applyCatalog, defaultCatalog, normalizeCatalog } from './catalog.ts'
import { getSocialSignature, setSocialSignature } from '../../shared/social-copy.ts'

test('空输入退回空白目录，不带个人站点', () => {
  const catalog = normalizeCatalog(null)
  assert.equal(catalog.defaultProjectTag, OPC_PROJECT_TAG)
  assert.equal(catalog.socialSignature, '')
  assert.deepEqual(catalog.products, [])
})

test('空产品清单原样留下，不回填内置数据', () => {
  const catalog = normalizeCatalog({
    defaultProjectTag: '我的项目',
    socialSignature: '',
    products: [],
  })
  assert.equal(catalog.defaultProjectTag, '我的项目')
  assert.equal(catalog.socialSignature, '')
  assert.deepEqual(catalog.products, [])
})

test('缺字段的产品丢掉，合法的留下', () => {
  const catalog = normalizeCatalog({
    defaultProjectTag: ' 我的项目 ',
    socialSignature: 'me.example',
    products: [
      { id: 'one', name: '壹', url: 'https://one.example' },
      { id: '', name: '无 id', url: 'https://x.example' },
      { name: '无 id 字段', url: 'https://y.example' },
    ],
  })
  assert.equal(catalog.defaultProjectTag, '我的项目')
  assert.equal(catalog.socialSignature, 'me.example')
  assert.equal(catalog.products.length, 1)
  assert.equal(catalog.products[0]?.id, 'one')
  assert.equal(catalog.products[0]?.line, 'research')
})

test('旧 catalog 的公司名产品线收成中性 id，行为不变', () => {
  const catalog = normalizeCatalog({
    products: [
      { id: 'old-research', name: '旧研究', url: 'https://a.example', line: 'bitou' },
      { id: 'old-toolkit', name: '旧工具', url: 'https://b.example', line: 'solokit' },
      { id: 'kept', name: '已中性', url: 'https://c.example', line: 'toolkit' },
    ],
  })
  assert.equal(catalog.products[0]?.line, 'research')
  assert.equal(catalog.products[1]?.line, 'toolkit')
  assert.equal(catalog.products[2]?.line, 'toolkit')
})

test('applyCatalog 改运行时标签和产品目录', () => {
  const previousTag = getProjectTag()
  const previousSignature = getSocialSignature()
  const previousProducts = getProducts()
  applyCatalog({
    defaultProjectTag: '试验',
    socialSignature: 'lab.example',
    products: [{ ...cloneProduct(EXAMPLE_PRODUCT), id: 'lab', name: '试验站', url: 'https://lab.example' }],
  })
  assert.equal(getProjectTag(), '试验')
  assert.equal(getSocialSignature(), 'lab.example')
  assert.equal(getProducts()[0]?.id, 'lab')
  setProjectTag(previousTag)
  setSocialSignature(previousSignature)
  applyCatalog({ ...defaultCatalog(), products: previousProducts })
})
