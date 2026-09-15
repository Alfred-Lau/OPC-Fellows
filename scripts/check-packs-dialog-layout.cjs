/**
 * 复现「工具包弹窗套雇成员双列栅格、勾选框叠在文字上方」。
 * Electron 可用时走离屏窗口；否则用本机 Chrome dump-dom 读夹具写好的度量。
 */
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const fixture = path.join(__dirname, 'packs-dialog-fixture.html')

function failedFrom(metrics) {
  return (
    metrics.dialogWidth > 500 ||
    metrics.formHeight > 420 ||
    metrics.panelWidth < 360 ||
    metrics.bodyDisplay !== 'block' ||
    metrics.packDirection !== 'row' ||
    metrics.planDirection !== 'row' ||
    !metrics.checkboxLeftOfText ||
    !metrics.sameRow ||
    !metrics.planSameRow ||
    metrics.planWrapsNarrow
  )
}

function finish(metrics) {
  const failed = failedFrom(metrics)
  process.stdout.write(`${JSON.stringify({ ...metrics, failed }, null, 2)}\n`)
  process.exit(failed ? 1 : 0)
}

async function viaElectron() {
  let electron
  try {
    electron = require('electron')
  } catch {
    return false
  }
  if (typeof electron !== 'string') {
    const { app, BrowserWindow } = electron
    await app.whenReady()
    const win = new BrowserWindow({
      width: 1280,
      height: 860,
      show: false,
      webPreferences: { offscreen: true },
    })
    await win.loadFile(fixture)
    await win.webContents.executeJavaScript('document.fonts.ready')
    const metrics = await win.webContents.executeJavaScript(`(() => {
      const dialog = document.getElementById('configure-agent')
      if (!dialog.open) dialog.showModal()
      const raw = document.documentElement.dataset.packMetrics
      return raw ? JSON.parse(raw) : null
    })()`)
    finish(metrics)
  }
  const ran = spawnSync(electron, [__filename], { stdio: 'inherit', env: process.env })
  process.exit(ran.status ?? 1)
}

function viaChrome() {
  const chrome = ['google-chrome', 'chromium-browser', 'chromium'].find((bin) => {
    const check = spawnSync('which', [bin], { encoding: 'utf8' })
    return check.status === 0
  })
  if (!chrome) {
    throw new Error('need electron or chrome to measure packs dialog')
  }
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'packs-dialog-'))
  const ran = spawnSync(
    chrome,
    [
      '--headless',
      '--disable-gpu',
      '--no-sandbox',
      `--user-data-dir=${userData}`,
      '--dump-dom',
      `file://${fixture}`,
    ],
    { encoding: 'utf8', timeout: 20000 },
  )
  const html = `${ran.stdout ?? ''}${ran.stderr ?? ''}`
  const match = html.match(/data-pack-metrics="([^"]+)"/)
  if (!match) {
    throw new Error(`chrome did not emit pack metrics\n${html.slice(-800)}`)
  }
  const decoded = match[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&')
  finish(JSON.parse(decoded))
}

if (process.versions.electron) {
  viaElectron()
} else {
  viaElectron()
    .then((handled) => {
      if (handled === false) {
        viaChrome()
      }
    })
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.stack : error}\n`)
      process.exit(1)
    })
}
