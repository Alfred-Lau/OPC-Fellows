export function mount(root, api) {
  const title = document.createElement('h2')
  title.textContent = '你好，这是第三方模块'
  const hint = document.createElement('p')
  hint.className = 'hint'
  hint.textContent = '主进程入口注册了 hello:ping。点按钮走统一 invoke，不必改 preload。'
  const status = document.createElement('p')
  status.className = 'hint'
  const button = document.createElement('button')
  button.type = 'button'
  button.textContent = 'Ping 主进程'
  button.addEventListener('click', () => {
    void api.workbench.invoke('hello:ping').then((result) => {
      status.textContent = JSON.stringify(result)
    }).catch((error) => {
      status.textContent = error instanceof Error ? error.message : String(error)
    })
  })
  root.append(title, hint, button, status)
  return () => root.replaceChildren()
}
