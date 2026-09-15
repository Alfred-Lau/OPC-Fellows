/**
 * 复现今日简报「多行标题挤在一起 / 字号偏大 / 颜色不和谐 / 多列卡片」。
 * 在真实 CSS 层叠下量 .dash-row .title 的计算样式，对用户原话做断言。
 */
const { app, BrowserWindow } = require('electron')
const path = require('node:path')

const MIN_LINE_HEIGHT_RATIO = 1.4
const MAX_TITLE_FONT_PX = 14

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    show: false,
    webPreferences: { offscreen: true },
  })
  await win.loadFile(path.join(__dirname, 'home-board-typography-fixture.html'))
  await win.webContents.executeJavaScript('document.fonts.ready')

  const metrics = await win.webContents.executeJavaScript(`(() => {
    const root = getComputedStyle(document.documentElement)
    const tokens = {
      fg: root.getPropertyValue('--fg').trim(),
      muted: root.getPropertyValue('--muted').trim(),
      mute: root.getPropertyValue('--mute').trim(),
      cream: root.getPropertyValue('--cream').trim(),
      brass: root.getPropertyValue('--brass').trim(),
      surface: root.getPropertyValue('--surface').trim(),
    }

    function hexToRgb(input) {
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 1
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#000'
      ctx.fillStyle = input
      const computed = ctx.fillStyle
      if (computed.startsWith('#')) {
        const hex = computed.slice(1)
        const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex
        return {
          r: parseInt(full.slice(0, 2), 16),
          g: parseInt(full.slice(2, 4), 16),
          b: parseInt(full.slice(4, 6), 16),
        }
      }
      const m = computed.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/)
      return m ? { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) } : { r: 0, g: 0, b: 0 }
    }

    function luminance({ r, g, b }) {
      const lin = [r, g, b].map((v) => {
        const c = v / 255
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
      })
      return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]
    }

    function contrast(a, b) {
      const l1 = luminance(hexToRgb(a))
      const l2 = luminance(hexToRgb(b))
      const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1]
      return Number(((hi + 0.05) / (lo + 0.05)).toFixed(2))
    }

    function measure(el) {
      const style = getComputedStyle(el)
      const fontSize = parseFloat(style.fontSize)
      const lineHeight =
        style.lineHeight === 'normal' ? fontSize * 1.2 : parseFloat(style.lineHeight)
      const range = document.createRange()
      range.selectNodeContents(el)
      const rects = [...range.getClientRects()]
      return {
        text: el.textContent.trim(),
        fontSize,
        lineHeight,
        lineHeightRatio: Number((lineHeight / fontSize).toFixed(3)),
        fontWeight: style.fontWeight,
        color: style.color,
        letterSpacing: style.letterSpacing,
        whiteSpace: style.whiteSpace,
        height: Math.round(el.getBoundingClientRect().height),
        width: Math.round(el.getBoundingClientRect().width),
        lineCount: Math.max(rects.length, 1),
      }
    }

    const wrap = document.querySelector('[data-case="wrap-due"] .title')
    const single = document.querySelector('[data-case="single-due"] .title')
    const isolated = document.querySelector('[data-case="isolated"] .title')
    const wrapBtn = document.querySelector('[data-case="wrap-due"]')
    const caption = document.querySelector('.home-kicker')
    const meta = document.querySelector('[data-case="wrap-due"] .meta')
    const tag = document.querySelector('[data-case="wrap-due"] .tag-chip')
    const wrapTodo = document.querySelector('[data-case="wrap-todo"] .title')
    const board = document.querySelector('.home-board')
    const recent = document.querySelector('.home-recent')
    const boardStyle = getComputedStyle(board)
    const columns = boardStyle.gridTemplateColumns
      .split(' ')
      .filter((value) => value && value !== 'none')

    const wrapTitle = measure(wrap)
    const isolatedTitle = measure(isolated)
    const wrapTodoTitle = measure(wrapTodo)
    const btnStyle = getComputedStyle(wrapBtn)

    return {
      board: {
        display: boardStyle.display,
        columns: boardStyle.gridTemplateColumns,
        columnCount: columns.length || 1,
        recentDisplay: recent ? getComputedStyle(recent).display : '',
      },
      tokens,
      wrapTitle,
      wrapTodoTitle,
      isolatedTitle,
      singleTitle: measure(single),
      button: {
        font: btnStyle.font,
        fontSize: parseFloat(btnStyle.fontSize),
        lineHeight: btnStyle.lineHeight,
        fontWeight: btnStyle.fontWeight,
        color: btnStyle.color,
      },
      caption: { ...measure(caption), color: getComputedStyle(caption).color },
      meta: { ...measure(meta), color: getComputedStyle(meta).color },
      tag: { ...measure(tag), color: getComputedStyle(tag).color },
      contrast: {
        titleOnSurface: contrast(getComputedStyle(wrap).color, tokens.surface),
        metaOnSurface: contrast(getComputedStyle(meta).color, tokens.surface),
        captionOnSurface: contrast(getComputedStyle(caption).color, tokens.surface),
        titleVsMeta: contrast(getComputedStyle(wrap).color, getComputedStyle(meta).color),
      },
    }
  })()`)

  const wrapRatio = metrics.wrapTitle.lineHeightRatio
  const isolatedRatio = metrics.isolatedTitle.lineHeightRatio
  const cramped =
    wrapRatio < MIN_LINE_HEIGHT_RATIO || isolatedRatio < MIN_LINE_HEIGHT_RATIO
  const oversized = metrics.wrapTitle.fontSize > MAX_TITLE_FONT_PX
  const titleIsFullFg =
    metrics.wrapTitle.color === 'rgb(241, 241, 239)' || metrics.wrapTitle.color === metrics.tokens.fg
  const heavyTitle = Number(metrics.wrapTitle.fontWeight) >= 500
  const loudTitle = titleIsFullFg || heavyTitle
  const threeAcross = metrics.board.columnCount > 2
  const notStacked = metrics.board.display !== 'flex'
  const failed = cramped || oversized || loudTitle || threeAcross || notStacked

  process.stdout.write(
    `${JSON.stringify(
      {
        ...metrics,
        verdict: {
          cramped,
          oversized,
          loudTitle,
          threeAcross,
          notStacked,
          minLineHeightRatio: MIN_LINE_HEIGHT_RATIO,
          maxTitleFontPx: MAX_TITLE_FONT_PX,
        },
      },
      null,
      2,
    )}\n`,
  )
  app.exit(failed ? 1 : 0)
})
