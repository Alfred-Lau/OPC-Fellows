/** 微信图文大封面建议 ≥900×383（2.35:1），小封面 ≥200×200（1:1）。 */
export const WX_COVER_WIDE_RATIO = 2.35
export const WX_COVER_WIDE_MIN = { width: 900, height: 383 } as const
export const WX_COVER_SQUARE_MIN = 200

export type CoverCrop = {
  ratio: '2.35_1' | '1_1'
  x1: string
  y1: string
  x2: string
  y2: string
}

export type CoverBox = {
  x: number
  y: number
  width: number
  height: number
}

/** 从原图居中裁出目标宽高比，用整像素，避免裁完比例对不上。 */
export function centerCropBox(width: number, height: number, ratio: number): CoverBox {
  if (width < 1 || height < 1 || ratio <= 0) {
    return { x: 0, y: 0, width: Math.max(1, width), height: Math.max(1, height) }
  }
  if (width / height > ratio) {
    const cropW = Math.max(1, Math.round(height * ratio))
    return { x: Math.round((width - cropW) / 2), y: 0, width: cropW, height }
  }
  const cropH = Math.max(1, Math.round(width / ratio))
  return { x: 0, y: Math.round((height - cropH) / 2), width, height: cropH }
}

function pct(value: number): string {
  return Math.min(1, Math.max(0, value)).toFixed(4)
}

function boxToCrop(ratio: CoverCrop['ratio'], box: CoverBox, width: number, height: number): CoverCrop {
  return {
    ratio,
    x1: pct(box.x / width),
    y1: pct(box.y / height),
    x2: pct((box.x + box.width) / width),
    y2: pct((box.y + box.height) / height),
  }
}

/** 图文 news 只要 2.35:1 和 1:1；整图填两种比例会被微信拒。 */
export function coverCropList(width: number, height: number): CoverCrop[] {
  return [
    boxToCrop('2.35_1', centerCropBox(width, height, WX_COVER_WIDE_RATIO), width, height),
    boxToCrop('1_1', centerCropBox(width, height, 1), width, height),
  ]
}

export function coverNeedsUpscale(width: number, height: number): boolean {
  const wide = centerCropBox(width, height, WX_COVER_WIDE_RATIO)
  const square = centerCropBox(width, height, 1)
  return (
    wide.width < WX_COVER_WIDE_MIN.width ||
    wide.height < WX_COVER_WIDE_MIN.height ||
    square.width < WX_COVER_SQUARE_MIN ||
    square.height < WX_COVER_SQUARE_MIN
  )
}
