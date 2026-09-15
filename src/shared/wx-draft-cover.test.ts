import assert from 'node:assert/strict'
import test from 'node:test'
import {
  WX_COVER_WIDE_MIN,
  centerCropBox,
  coverCropList,
  coverNeedsUpscale,
} from './wx-draft-cover.ts'

function cropRatio(width: number, height: number, crop: { x1: string; y1: string; x2: string; y2: string }): number {
  const w = (Number(crop.x2) - Number(crop.x1)) * width
  const h = (Number(crop.y2) - Number(crop.y1)) * height
  return w / h
}

test('900×383 大封面用整图，小封面取中间方块', () => {
  const [wide, square] = coverCropList(900, 383)
  assert.equal(wide.ratio, '2.35_1')
  assert.equal(wide.x1, '0.0000')
  assert.equal(wide.y1, '0.0000')
  assert.equal(wide.x2, '1.0000')
  assert.equal(wide.y2, '1.0000')
  assert.equal(square.ratio, '1_1')
  assert.ok(Math.abs(cropRatio(900, 383, square) - 1) < 0.02)
  assert.ok(Number(square.x1) > 0.2)
  assert.ok(Number(square.x2) < 0.8)
})

test('方图不能整图当 2.35:1，要从中间抽横条', () => {
  const [wide, square] = coverCropList(1024, 1024)
  assert.ok(Math.abs(cropRatio(1024, 1024, wide) - 2.35) < 0.03)
  assert.equal(square.x1, '0.0000')
  assert.equal(square.y1, '0.0000')
  assert.equal(square.x2, '1.0000')
  assert.equal(square.y2, '1.0000')
  assert.equal(coverNeedsUpscale(1024, 1024), false)
})

test('512 方图裁完大封面不够 900×383，要先放大', () => {
  const wide = centerCropBox(512, 512, 2.35)
  assert.ok(wide.height < WX_COVER_WIDE_MIN.height)
  assert.equal(coverNeedsUpscale(512, 512), true)
  assert.equal(coverNeedsUpscale(900, 383), false)
})
