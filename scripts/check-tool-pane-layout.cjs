/**
 * 复现「工具侧栏在默认 480 / 最小 320 被挤碎」：
 * 时间戳拆行、中文拆字、主栏竖排。
 */
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const MAX_STAMP_HEIGHT = 28
const WIDTHS = [480, 320]

function scanOccupationCss() {
  const dir = path.join(__dirname, '../src/renderer/src')
  const problems = []
  for (const name of fs.readdirSync(dir).filter((file) => file.endsWith('.css'))) {
    const text = fs.readFileSync(path.join(dir, name), 'utf8')
    if (/overflow-wrap:\s*anywhere/.test(text)) {
      problems.push(`${name}: overflow-wrap: anywhere`)
    }
  }
  return problems
}

app.whenReady().then(async () => {
  const cssProblems = scanOccupationCss()
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    show: false,
    webPreferences: { offscreen: true },
  })
  await win.loadFile(path.join(__dirname, 'tool-pane-layout-fixture.html'))
  await win.webContents.executeJavaScript('document.fonts.ready')

  const byWidth = {}
  for (const width of WIDTHS) {
    byWidth[width] = await win.webContents.executeJavaScript(`(async () => {
      document.documentElement.style.setProperty('--tool-width', '${width}px')
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      const pane = document.querySelector('.tool-pane')
      const rail = document.querySelector('.tool-rail')
      const stage = document.querySelector('.workspace-stage')
      const stamp = document.querySelector('#view-social-ammo .tick-head .tick-count')
      const calWeek = document.getElementById('cal-week')
      const skillGrid = document.getElementById('skill-grid')
      const paneBox = pane.getBoundingClientRect()
      const railBox = rail.getBoundingClientRect()
      const stageBox = stage.getBoundingClientRect()
      const overflow = (el) => el.scrollWidth > el.clientWidth + 1
      return {
        paneWidth: Math.round(paneBox.width),
        railLeft: Math.round(railBox.left),
        stageLeft: Math.round(stageBox.left),
        railWidth: Math.round(railBox.width),
        railHeight: Math.round(railBox.height),
        stampHeight: Math.round(stamp.getBoundingClientRect().height),
        stampNowrap: getComputedStyle(stamp).whiteSpace === 'nowrap',
        calWeekColumns: getComputedStyle(calWeek).gridTemplateColumns.split(' ').filter(Boolean).length,
        skillOverflow: overflow(skillGrid),
      }
    })()`)
  }

  const collapsedWidth = await win.webContents.executeJavaScript(`(() => {
    document.body.dataset.toolCollapsed = 'true'
    const pane = document.querySelector('.tool-pane')
    return Math.round(pane.getBoundingClientRect().width)
  })()`)

  const failures = [...cssProblems]
  for (const width of WIDTHS) {
    const metrics = byWidth[width]
    if (Math.abs(metrics.paneWidth - width) > 2) {
      failures.push(`${width}: paneWidth=${metrics.paneWidth}`)
    }
    if (!metrics.stampNowrap || metrics.stampHeight > MAX_STAMP_HEIGHT) {
      failures.push(`${width}: stamp wrapped height=${metrics.stampHeight}`)
    }
    if (metrics.calWeekColumns !== 1) {
      failures.push(`${width}: cal-week columns=${metrics.calWeekColumns}`)
    }
    if (metrics.skillOverflow) {
      failures.push(`${width}: skill-grid overflow`)
    }
    if (metrics.railLeft >= metrics.stageLeft) {
      failures.push(`${width}: rail not on the left`)
    }
    if (metrics.railHeight <= metrics.railWidth) {
      failures.push(`${width}: rail not vertical`)
    }
  }

  if (collapsedWidth !== 0) {
    failures.push(`collapsedWidth=${collapsedWidth}`)
  }

  const failed = failures.length > 0
  process.stdout.write(`${JSON.stringify({ cssProblems, byWidth, collapsedWidth, failures }, null, 2)}\n`)
  app.exit(failed ? 1 : 0)
})
