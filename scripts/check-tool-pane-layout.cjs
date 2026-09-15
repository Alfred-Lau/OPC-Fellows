/**
 * 复现「工具侧栏在默认 480 / 最小 320 被挤碎」：
 * 目录折成胶囊汤、时间戳拆行、中文拆字、主栏竖排。
 */
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const MIN_MAIN_WIDTH = 200
const MAX_STAT_HEIGHT = 56
const MAX_STAMP_HEIGHT = 28
const MAX_ATTR_HEIGHT = 40
const WIDTHS = [480, 320]

function scanOccupationCss() {
  const dir = path.join(__dirname, '../src/renderer/src')
  const problems = []
  for (const name of fs.readdirSync(dir).filter((file) => file.endsWith('.css'))) {
    const text = fs.readFileSync(path.join(dir, name), 'utf8')
    if (/overflow-wrap:\s*anywhere/.test(text)) {
      problems.push(`${name}: overflow-wrap: anywhere`)
    }
    if (/\.monitor-nav[^{]*\{[^}]*flex-wrap:\s*wrap;/.test(text)) {
      problems.push(`${name}: .monitor-nav flex-wrap: wrap`)
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
      const layout = document.querySelector('.monitor-layout')
      const main = document.querySelector('.monitor-main')
      const nav = document.querySelector('.monitor-nav')
      const stamp = document.querySelector('#view-monitor .tick-head .tick-count')
      const counts = document.querySelector('.attr-counts')
      const calWeek = document.getElementById('cal-week')
      const skillGrid = document.getElementById('skill-grid')
      const wxGrid = document.getElementById('wx-form-grid')
      const payBar = document.getElementById('pay-bar')
      const payTrack = payBar.querySelector('.track')
      const notesHead = document.getElementById('notes-head')
      const noteFilter = notesHead.querySelector('.note-filter')
      const postRow = document.getElementById('accounts-post-row')
      const stats = [...document.querySelectorAll('.traffic-stat')]
      const navItems = [...nav.querySelectorAll('.monitor-nav-item')]
      const navTops = [...new Set(navItems.map((el) => el.offsetTop))]
      const layoutStyle = getComputedStyle(layout)
      const paneBox = pane.getBoundingClientRect()
      const railBox = rail.getBoundingClientRect()
      const stageBox = stage.getBoundingClientRect()
      const overflow = (el) => el.scrollWidth > el.clientWidth + 1
      return {
        paneWidth: Math.round(paneBox.width),
        mainWidth: Math.round(main.getBoundingClientRect().width),
        railLeft: Math.round(railBox.left),
        stageLeft: Math.round(stageBox.left),
        railWidth: Math.round(railBox.width),
        railHeight: Math.round(railBox.height),
        layoutColumns: layoutStyle.gridTemplateColumns,
        navWrapped: navTops.length > 1,
        navScrollable: nav.scrollWidth > nav.clientWidth + 1,
        stampHeight: Math.round(stamp.getBoundingClientRect().height),
        stampNowrap: getComputedStyle(stamp).whiteSpace === 'nowrap',
        attrWordBreak: getComputedStyle(counts).wordBreak,
        attrHeight: Math.round(counts.getBoundingClientRect().height),
        calWeekColumns: getComputedStyle(calWeek).gridTemplateColumns.split(' ').filter(Boolean).length,
        skillOverflow: overflow(skillGrid),
        wxGridOverflow: overflow(wxGrid),
        payTrackRatio: payTrack.getBoundingClientRect().width / Math.max(1, payBar.getBoundingClientRect().width),
        noteHeadOverflow: overflow(notesHead),
        postRowColumns: getComputedStyle(postRow).gridTemplateColumns.split(' ').filter(Boolean).length,
        stats: stats.map((el) => ({
          text: el.innerText.replace(/\\s+/g, ' '),
          width: el.clientWidth,
          scrollWidth: el.scrollWidth,
          height: el.clientHeight,
        })),
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
    const wrapped = metrics.stats.filter((stat) => stat.height > MAX_STAT_HEIGHT || stat.scrollWidth > stat.width + 1)
    if (Math.abs(metrics.paneWidth - width) > 2) {
      failures.push(`${width}: paneWidth=${metrics.paneWidth}`)
    }
    if (metrics.mainWidth < MIN_MAIN_WIDTH) {
      failures.push(`${width}: mainWidth=${metrics.mainWidth}`)
    }
    if (metrics.mainWidth > metrics.paneWidth - metrics.railWidth + 2) {
      failures.push(`${width}: mainWidth ${metrics.mainWidth} exceeds pane ${metrics.paneWidth}`)
    }
    if (metrics.layoutColumns.includes('208px')) {
      failures.push(`${width}: layout still has 208px side column`)
    }
    if (metrics.navWrapped) {
      failures.push(`${width}: monitor-nav wrapped`)
    }
    if (!metrics.stampNowrap || metrics.stampHeight > MAX_STAMP_HEIGHT) {
      failures.push(`${width}: stamp wrapped height=${metrics.stampHeight}`)
    }
    if (metrics.attrWordBreak !== 'keep-all') {
      failures.push(`${width}: attr-counts word-break=${metrics.attrWordBreak}`)
    }
    if (metrics.attrHeight > MAX_ATTR_HEIGHT) {
      failures.push(`${width}: attr-counts height=${metrics.attrHeight}`)
    }
    if (metrics.calWeekColumns !== 1) {
      failures.push(`${width}: cal-week columns=${metrics.calWeekColumns}`)
    }
    if (metrics.skillOverflow) {
      failures.push(`${width}: skill-grid overflow`)
    }
    if (metrics.wxGridOverflow) {
      failures.push(`${width}: wx-form-grid overflow`)
    }
    if (metrics.payTrackRatio < 0.7) {
      failures.push(`${width}: pay-bar track ratio=${metrics.payTrackRatio}`)
    }
    if (metrics.noteHeadOverflow) {
      failures.push(`${width}: notes head overflow`)
    }
    if (metrics.postRowColumns !== 1) {
      failures.push(`${width}: post-row columns=${metrics.postRowColumns}`)
    }
    if (wrapped.length > 0) {
      failures.push(`${width}: stats wrapped ${JSON.stringify(wrapped)}`)
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

  const wide = byWidth[480]
  const failed = failures.length > 0
  process.stdout.write(
    `${JSON.stringify({ cssProblems, byWidth, collapsedWidth, failures, navScrollableAt480: wide.navScrollable }, null, 2)}\n`,
  )
  app.exit(failed ? 1 : 0)
})
