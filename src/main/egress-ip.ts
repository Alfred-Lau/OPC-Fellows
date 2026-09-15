/** 查本机出口 IP;失败一律返回 null,绝不抛错(只用于错误提示,不能拖累主流程)。 */

const EGRESS_IP_URLS = ['https://ifconfig.me/ip', 'https://api.ipify.org'] as const
const CACHE_TTL_MS = 5 * 60 * 1000
const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/

type CacheEntry = { ip: string; expiresAt: number }

let cached: CacheEntry | null = null

function looksLikeIp(value: string): boolean {
  return IPV4_RE.test(value) || value.includes(':')
}

async function fetchFrom(url: string, timeoutMs: number): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
    const text = (await res.text()).trim()
    if (!looksLikeIp(text)) {
      return null
    }
    return text
  } catch {
    return null
  }
}

export async function fetchEgressIp(timeoutMs = 3000): Promise<string | null> {
  if (cached && cached.expiresAt > Date.now()) {
    return cached.ip
  }
  for (const url of EGRESS_IP_URLS) {
    const ip = await fetchFrom(url, timeoutMs)
    if (ip) {
      cached = { ip, expiresAt: Date.now() + CACHE_TTL_MS }
      return ip
    }
  }
  return null
}
