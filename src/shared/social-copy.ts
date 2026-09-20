import { getProducts, type OpcProduct } from './products.ts'
import type { SocialDraftInput, SocialPlatformId } from './social.ts'

export interface ProductFeature {
  product: OpcProduct
  title: string
  source: 'catalog'
  at: string | null
  url: string
}

export const DEFAULT_SOCIAL_SIGNATURE = ''

const MAX_FEATURES = 2

let socialSignature = DEFAULT_SOCIAL_SIGNATURE

export function getSocialSignature(): string {
  return socialSignature
}

export function setSocialSignature(value: string): void {
  const next = value.trim()
  socialSignature = next || DEFAULT_SOCIAL_SIGNATURE
}

export function collectFeatures(products = getProducts()): ProductFeature[] {
  return products.slice(0, MAX_FEATURES).map((product) => ({
    product,
    title: product.pitch,
    source: 'catalog',
    at: null,
    url: product.url,
  }))
}

export function generateSocialCopy(features: ProductFeature[]): SocialDraftInput[] {
  return features.flatMap((feature) => platformsFor(feature))
}

export function fingerprintFor(productId: string, featureTitle: string, platform: SocialPlatformId): string {
  return `social:${productId}:${slug(featureTitle)}:${platform}`
}

function platformsFor(feature: ProductFeature): SocialDraftInput[] {
  return [
    copyX(feature),
    copyYouTube(feature),
    copyLinkedIn(feature),
    copyXiaohongshu(feature),
    copyChannels(feature),
    copyDouyin(feature),
  ]
}

function copyX(feature: ProductFeature): SocialDraftInput {
  const product = feature.product
  const hook = clip(
    `${product.nameEn}: ${englishHook(feature)} ${product.url}`,
    280,
  )
  return draft(feature, 'x', '短帖 280 + Premium 长帖/Articles', '', hook, [
    `Hook (first line, keep under 280 if posting free-tier).`,
    `Premium long post (≤25,000):`,
    `1. The OPC problem this ships against.`,
    `2. What ${product.nameEn} actually does: ${product.pitchEn}`,
    `3. What changed: ${englishHook(feature)}`,
    `4. Try it: ${product.url}`,
    `Optional: X Article with H2s + 1 screenshot. Video ≤2:20 free / longer on Premium.`,
  ].join('\n'), product.tagsEn, `Screenshot of ${product.nameEn} doing the new thing. 16:9, one UI moment, no wall of text.`)
}

function copyYouTube(feature: ProductFeature): SocialDraftInput {
  const product = feature.product
  const title = clip(`${product.nameEn}: ${englishHook(feature)}`, 100)
  const body = [
    `Hook (0–3s, on-screen text): Stop switching 6 tabs to ${verbFor(product)}.`,
    `Demo (15–45s, 9:16): open ${product.url}, click the new path, show the result.`,
    `CTA: Follow for the next OPC shipping note. Link in description.`,
  ].join('\n')
  return draft(
    feature,
    'youtube',
    'Shorts ≤3 分钟竖屏',
    title,
    body,
    [
      `${product.nameEn} — ${product.pitchEn}`,
      '',
      `What shipped: ${englishHook(feature)}`,
      `Product: ${product.url}`,
      ...(getSocialSignature() ? [`Line: ${getSocialSignature()}`] : []),
      '',
      'Chapters (if you stretch to 60–180s):',
      '0:00 Hook',
      '0:08 Problem',
      '0:20 Demo',
      '0:50 Try it',
    ].join('\n'),
    ['Shorts', ...product.tagsEn.slice(0, 3)],
    '9:16 1080×1920, face or cursor, captions burned in. Keep ≤60s unless the demo needs the 3-minute Shorts cap.',
  )
}

function copyLinkedIn(feature: ProductFeature): SocialDraftInput {
  const product = feature.product
  const hook = `I run an OPC. ${englishHook(feature)}`
  const body = [
    hook,
    '',
    `${product.nameEn} is the piece I use for this: ${product.pitchEn}`,
    '',
    'What I keep learning:',
    `• Ship the loop, not the landing page.`,
    `• Distribution is part of the product — X, YouTube, LinkedIn, then 小红书 / 视频号 / 抖音.`,
    `• ${product.url}`,
    '',
    'If you are also a one-person company, what is the one metric you actually look at on Monday?',
  ].join('\n')
  return draft(
    feature,
    'linkedin',
    '信息流帖（前 210 字钩子）+ PDF 轮播',
    '',
    clip(body, 3000),
    [
      'Carousel (PDF, 5 slides):',
      `1. ${englishHook(feature)}`,
      `2. The OPC constraint.`,
      `3. What ${product.nameEn} does.`,
      '4. Before / after of the workflow.',
      `5. Link: ${product.url}`,
    ].join('\n'),
    product.tagsEn.slice(0, 5),
    'Square 1080×1080 product still, or 5-page PDF. First 210 characters must stand alone before “see more”.',
  )
}

function copyXiaohongshu(feature: ProductFeature): SocialDraftInput {
  const product = feature.product
  const title = clip(`${product.name}新能力`, 20)
  const body = [
    `我是一人公司，这条记 ${product.name}。`,
    '',
    chineseHook(feature),
    '',
    product.pitch,
    '',
    '适合谁：自己做产品、要发多平台、又不想开一套运营团队的人。',
    '怎么用：打开站点，按这次更新的路径点一遍，把结果截图留下来。',
    '',
    `站点：${product.url}`,
    '',
    '（若正文由 AI 辅助生成，发布时按小红书 2026 规范做 AI 声明；不要在正文里塞微信/二维码导流。）',
  ].join('\n')
  return draft(
    feature,
    'xiaohongshu',
    '图文笔记 标题20 / 正文1000',
    title,
    clip(body, 1000),
    [
      '九宫格：',
      `1. 封面大字：${title}`,
      `2–4. 产品界面三步`,
      '5. 更新前后对比',
      '6. 一人公司工作流',
      '7–8. 适用场景',
      '9. 站点名（不要二维码）',
    ].join('\n'),
    [...product.tagsZh, '一人公司', '独立开发', 'AI工具'].slice(0, 10),
    '封面 3:4。标题前 16 字含产品名。标签不超过 10 个。',
  )
}

function copyChannels(feature: ProductFeature): SocialDraftInput {
  const product = feature.product
  const title = clip(`${product.name}刚更新`, 16)
  const body = [
    `【0–3s】${chineseHook(feature)}`,
    `【3–20s】打开 ${product.name}，点这次新能力，停在结果页。`,
    `【20–40s】一句：我是一人公司，${product.pitch}`,
    '【收尾】关注我，下一支讲怎么同步发到小红书和抖音。',
  ].join('\n')
  return draft(
    feature,
    'channels',
    '竖屏口播 15–60 秒',
    title,
    body,
    `简介：${product.pitch}\n话题：#一人公司 #AI工具 #${product.name}`,
    [...product.tagsZh, '一人公司'].slice(0, 5),
    '竖屏 9:16，封面大字不超过 12 字。口播自然，不要念稿感。可挂公众号/小程序，避免生硬外链。',
  )
}

function copyDouyin(feature: ProductFeature): SocialDraftInput {
  const product = feature.product
  const title = clip(`${product.name}｜${chineseHook(feature)}`, 60)
  const body = [
    `黄金 3 秒：${chineseHook(feature)}`,
    `演示：${product.name} 打开 → 新能力 → 结果。`,
    `人话：${product.pitch}`,
    '结尾：收藏这条，周一发社媒前先看一遍。',
    '',
    `标题：${title}`,
  ].join('\n')
  return draft(
    feature,
    'douyin',
    '短视频黄金3秒 + 标题60字',
    title,
    body,
    [
      `备选长图文（≥300 字，上限 4000）：`,
      `我把 ${product.name} 这次更新拆成可跟做的三步。`,
      product.pitch,
      chineseHook(feature),
      '第一步：打开站点。第二步：走新路径。第三步：截图复盘。',
      `地址 ${product.url}（正文避免诱导站外私域）。`,
    ].join('\n'),
    [...product.tagsZh, '一人公司', '独立开发者'].slice(0, 5),
    '9:16，字幕大，前 3 秒必须有变化。话题标签不超过 5 个。完播优先于讲完所有功能。',
  )
}

function draft(
  feature: ProductFeature,
  platform: SocialPlatformId,
  format: string,
  title: string,
  body: string,
  outline: string,
  tags: string[],
  mediaBrief: string,
): SocialDraftInput {
  return {
    fingerprint: fingerprintFor(feature.product.id, feature.title, platform),
    platform,
    productId: feature.product.id,
    productName: feature.product.name,
    productUrl: feature.url,
    featureTitle: feature.title,
    format,
    title,
    body,
    outline,
    tags,
    mediaBrief,
  }
}

function englishHook(feature: ProductFeature): string {
  switch (feature.source) {
    case 'catalog':
      return feature.product.pitchEn
    default: {
      const exhaustive: never = feature.source
      return exhaustive
    }
  }
}

function chineseHook(feature: ProductFeature): string {
  switch (feature.source) {
    case 'catalog':
      return feature.product.pitch
    default: {
      const exhaustive: never = feature.source
      return exhaustive
    }
  }
}

function verbFor(product: OpcProduct): string {
  switch (product.line) {
    case 'toolkit':
      return 'run the OPC toolkit'
    case 'research':
      return 'keep research and shipping in one place'
    default: {
      const exhaustive: never = product.line
      return exhaustive
    }
  }
}

export function slug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'update'
}

export function clip(value: string, max: number): string {
  const chars = Array.from(value.trim())
  if (chars.length <= max) {
    return chars.join('')
  }
  return `${chars.slice(0, Math.max(0, max - 1)).join('')}…`
}

