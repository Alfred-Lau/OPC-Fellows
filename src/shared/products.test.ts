import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_PRODUCT_LINE, EXAMPLE_PRODUCT, normalizeProductLine } from './products.ts'

test('缺省和未知产品线落到中性 research，不写公司名', () => {
  assert.equal(DEFAULT_PRODUCT_LINE, 'research')
  assert.equal(EXAMPLE_PRODUCT.line, 'research')
  assert.equal(normalizeProductLine(undefined), 'research')
  assert.equal(normalizeProductLine(''), 'research')
  assert.equal(normalizeProductLine('nope'), 'research')
})

test('旧 catalog 别名仍能读，映射到同一条中性线', () => {
  assert.equal(normalizeProductLine('bitou'), 'research')
  assert.equal(normalizeProductLine('solokit'), 'toolkit')
  assert.equal(normalizeProductLine('research'), 'research')
  assert.equal(normalizeProductLine('toolkit'), 'toolkit')
})
