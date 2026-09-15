import assert from 'node:assert/strict'
import test from 'node:test'
import {
  RAIL_WIDTH_DEFAULT,
  RAIL_WIDTH_MAX,
  RAIL_WIDTH_MIN,
  clampRailWidth,
  parseRailWidth,
} from './rail-width.ts'

test('侧栏宽度夹在最小与最大之间', () => {
  assert.equal(clampRailWidth(120), RAIL_WIDTH_MIN)
  assert.equal(clampRailWidth(800), RAIL_WIDTH_MAX)
  assert.equal(clampRailWidth(240), 240)
})

test('窗口变窄时最大宽度不超过视口的 45%', () => {
  assert.equal(clampRailWidth(400, 600), 270)
})

test('坏值落到默认宽度', () => {
  assert.equal(clampRailWidth(Number.NaN), RAIL_WIDTH_DEFAULT)
  assert.equal(parseRailWidth(null), undefined)
  assert.equal(parseRailWidth('abc'), undefined)
  assert.equal(parseRailWidth('256'), 256)
})
