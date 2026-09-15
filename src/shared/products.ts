export type ProductLine = 'bitou' | 'solokit'

/**
 * 站点 /api/stats 的接入状态。只有 'live' 会被真正请求，
 * 其余两种直接跳过：'pending' 是站点还没实现这个接口，
 * 'unavailable' 是域名尚未部署或解析不到。
 */
export type StatsStatus = 'live' | 'pending' | 'unavailable'

export interface OpcProduct {
  id: string
  line: ProductLine
  name: string
  nameEn: string
  url: string
  /** Base origin for GET /api/stats (authenticated). Omit for products with no stats endpoint. */
  statsOrigin?: string
  /** 默认 'pending'：配了 origin 但站点侧未实现，不发请求。 */
  statsStatus?: StatsStatus
  pitch: string
  pitchEn: string
  aliases: string[]
  tagsZh: string[]
  tagsEn: string[]
}

/**
 * 开源默认目录是空的。真实产品线请在「工作情况」里自己加，
 * 或参考 examples/catalog.example.json。
 */
export const OPC_PRODUCTS: OpcProduct[] = []

/** 测试和文档用的虚构站点，不进启动默认值。 */
export const EXAMPLE_PRODUCT: OpcProduct = {
  id: 'demo',
  line: 'bitou',
  name: '示例产品',
  nameEn: 'Demo Product',
  url: 'https://example.com/',
  statsOrigin: 'https://example.com',
  statsStatus: 'pending',
  pitch: '用来演示工作台如何关联站点，不是真实产品。',
  pitchEn: 'A fictional site that shows how the catalog attaches to the workbench.',
  aliases: ['demo', 'example'],
  tagsZh: ['示例', '一人公司'],
  tagsEn: ['Demo', 'OPC', 'IndieHacker'],
}

export function cloneProduct(product: OpcProduct): OpcProduct {
  return {
    ...product,
    aliases: [...product.aliases],
    tagsZh: [...product.tagsZh],
    tagsEn: [...product.tagsEn],
  }
}

export function statsStatusOf(product: OpcProduct): StatsStatus {
  return product.statsStatus ?? 'pending'
}

/** 运行时产品目录。没改过配置时就是空清单。 */
let activeProducts: OpcProduct[] = []

export function getProducts(): OpcProduct[] {
  return activeProducts
}

export function setProducts(products: OpcProduct[]): void {
  activeProducts = products
}

export function matchProduct(name: string, products: readonly OpcProduct[] = getProducts()): OpcProduct | null {
  const key = name.trim().toLowerCase()
  if (!key) {
    return null
  }
  return (
    products.find((product) => product.id === key || product.aliases.some((alias) => alias === key)) ??
    products.find((product) => key.includes(product.id) || product.aliases.some((alias) => key.includes(alias))) ??
    null
  )
}
