/**
 * 第三方模块的视图宿主。内置模块仍走各自的 activate，
 * 仓库装上来的模块导出 mount(root, api)，离开页面时回收。
 */

const host = required('#view-hosted', HTMLElement)
const dynamicImport = new Function('specifier', 'return import(specifier)') as (
  specifier: string,
) => Promise<{ mount?: MountFn; default?: MountFn }>

type MountFn = (root: HTMLElement, api: Window['ownworkbuddy']) => unknown

let current: { id: string; unmount: () => void } | null = null

function required<T extends typeof HTMLElement>(selector: string, ctor: T): InstanceType<T> {
  const node = document.querySelector(selector)
  if (!(node instanceof ctor)) {
    throw new Error(`missing ${selector}`)
  }
  return node as InstanceType<T>
}

export async function activateHosted(id: string): Promise<void> {
  if (current?.id === id) {
    host.classList.add('is-open')
    return
  }
  unmountHosted()
  host.classList.add('is-open')
  host.replaceChildren()
  const hint = document.createElement('p')
  hint.className = 'hint'
  hint.textContent = '正在加载模块…'
  host.append(hint)

  try {
    const spec = await window.ownworkbuddy.workbench.ui(id)
    if (!spec?.url) {
      hint.textContent = '这个模块没有界面，只在后台运行。'
      current = { id, unmount: () => host.replaceChildren() }
      return
    }
    const loaded = await dynamicImport(`${spec.url}?t=${Date.now()}`)
    const mount = loaded.mount ?? loaded.default
    if (typeof mount !== 'function') {
      hint.textContent = '模块界面入口没有导出 mount。'
      return
    }
    host.replaceChildren()
    const dispose = await mount(host, window.ownworkbuddy)
    current = {
      id,
      unmount: typeof dispose === 'function' ? () => void dispose() : () => host.replaceChildren(),
    }
  } catch (error) {
    host.replaceChildren()
    const failed = document.createElement('p')
    failed.className = 'hint'
    failed.textContent = `模块界面加载失败：${error instanceof Error ? error.message : String(error)}`
    host.append(failed)
    current = { id, unmount: () => host.replaceChildren() }
  }
}

export function unmountHosted(): void {
  host.classList.remove('is-open')
  if (!current) {
    return
  }
  try {
    current.unmount()
  } catch {
    host.replaceChildren()
  }
  current = null
}
