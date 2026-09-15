import { cloneProduct, OPC_PRODUCTS, setProducts, type OpcProduct, type ProductLine, type StatsStatus } from '../../shared/products.ts'
import { DEFAULT_SOCIAL_SIGNATURE, setSocialSignature } from '../../shared/social-copy.ts'
import { OPC_PROJECT_TAG, setProjectTag } from '../../shared/tags.ts'

export interface WorkbenchCatalog {
  defaultProjectTag: string
  socialSignature: string
  products: OpcProduct[]
}

export function defaultCatalog(): WorkbenchCatalog {
  return {
    defaultProjectTag: OPC_PROJECT_TAG,
    socialSignature: DEFAULT_SOCIAL_SIGNATURE,
    products: OPC_PRODUCTS.map(cloneProduct),
  }
}

/** 把任意输入收成合法目录。产品缺 id / name / url 的丢掉。允许空清单。 */
export function normalizeCatalog(value: unknown): WorkbenchCatalog {
  const fallback = defaultCatalog()
  if (!value || typeof value !== 'object') {
    return fallback
  }
  const raw = value as Partial<WorkbenchCatalog>
  const products = Array.isArray(raw.products)
    ? raw.products.flatMap((item) => normalizeProduct(item) ?? [])
    : fallback.products
  return {
    defaultProjectTag: text(raw.defaultProjectTag, fallback.defaultProjectTag),
    socialSignature: typeof raw.socialSignature === 'string' ? raw.socialSignature.trim() : fallback.socialSignature,
    products,
  }
}

export function applyCatalog(catalog: WorkbenchCatalog): void {
  setProjectTag(catalog.defaultProjectTag)
  setSocialSignature(catalog.socialSignature)
  setProducts(catalog.products)
}

function normalizeProduct(value: unknown): OpcProduct | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const raw = value as Partial<OpcProduct>
  if (typeof raw.id !== 'string' || !raw.id.trim()) {
    return null
  }
  if (typeof raw.name !== 'string' || !raw.name.trim()) {
    return null
  }
  if (typeof raw.url !== 'string' || !raw.url.trim()) {
    return null
  }
  const line: ProductLine = raw.line === 'solokit' ? 'solokit' : 'bitou'
  const statsStatus: StatsStatus | undefined =
    raw.statsStatus === 'live' || raw.statsStatus === 'pending' || raw.statsStatus === 'unavailable'
      ? raw.statsStatus
      : undefined
  return {
    id: raw.id.trim(),
    line,
    name: raw.name.trim(),
    nameEn: text(raw.nameEn, raw.name.trim()),
    url: raw.url.trim(),
    ...(typeof raw.statsOrigin === 'string' && raw.statsOrigin.trim() ? { statsOrigin: raw.statsOrigin.trim() } : {}),
    ...(statsStatus ? { statsStatus } : {}),
    pitch: text(raw.pitch, ''),
    pitchEn: text(raw.pitchEn, ''),
    aliases: strings(raw.aliases),
    tagsZh: strings(raw.tagsZh),
    tagsEn: strings(raw.tagsEn),
  }
}

function text(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map((item) => item.trim()) : []
}
