const { app, BrowserWindow } = require('electron')
const path = require('node:path')

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    show: false,
    webPreferences: { offscreen: true },
  })
  await win.loadFile(path.join(__dirname, 'calendar-layout-fixture.html'))
  await win.webContents.executeJavaScript('document.fonts.ready')

  const metrics = await win.webContents.executeJavaScript(`(() => {
    const week = document.getElementById('week')
    const weekStyle = getComputedStyle(week)
    const cols = [...week.querySelectorAll('.cal-week-col')]
    const monthGrid = document.getElementById('month-grid')
    return {
      weekColumns: weekStyle.gridTemplateColumns.split(' ').filter(Boolean).length,
      weekColCount: cols.length,
      monthCells: monthGrid.children.length,
    }
  })()`)

  const failed = metrics.weekColumns !== 7 || metrics.weekColCount !== 7 || metrics.monthCells !== 42
  process.stdout.write(`${JSON.stringify({ ...metrics, failed }, null, 2)}\n`)
  app.exit(failed ? 1 : 0)
})
