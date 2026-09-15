import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyResolvedImageSrcs,
  asSearchRelativePath,
  buildImageSearchRoots,
  findLocalCover,
  isCoverFileName,
  isLocalImageSrc,
  isRemoteImageSrc,
  localImageCandidates,
  missingCoverMessage,
  missingLocalImageMessage,
  resolveAllBodyImages,
  resolveBodyImageSrc,
  rewriteMarkdownImageSrcs,
} from './wx-draft-images.ts'

const articleMd = '/Users/me/notes/post.md'
const articleDir = '/Users/me/notes'
const localJpg = '/Users/me/notes/images/文中插图1_观测差异vs因果效应.jpg'
const siteSrc = '/images/文中插图1_观测差异vs因果效应.jpg'

function files(...paths: string[]): (path: string) => boolean {
  const set = new Set(paths)
  return (path) => set.has(path)
}

test('远程 http(s) 不当作本地图', () => {
  assert.equal(isRemoteImageSrc('https://mmbiz.qpic.cn/x.png'), true)
  assert.equal(isRemoteImageSrc('HTTP://a.example/x.jpg'), true)
  assert.equal(isLocalImageSrc('https://a.example/x.jpg'), false)
  assert.equal(isLocalImageSrc(siteSrc), true)
  assert.equal(isLocalImageSrc('images/a.jpg'), true)
  assert.equal(isLocalImageSrc('data:image/png;base64,xx'), false)
})

test('站点根路径 /images/… 不能按磁盘绝对路径解析', () => {
  assert.equal(asSearchRelativePath(siteSrc), 'images/文中插图1_观测差异vs因果效应.jpg')
  assert.equal(asSearchRelativePath('images/a.jpg'), 'images/a.jpg')
  assert.equal(asSearchRelativePath('./images/a.jpg'), 'images/a.jpg')
  assert.equal(asSearchRelativePath('C:\\\\abs\\\\a.jpg'), null)
  const candidates = localImageCandidates(siteSrc, [articleDir])
  assert.equal(candidates.includes(siteSrc), true)
  assert.equal(candidates.includes(localJpg), true)
  assert.ok(candidates.includes(`${articleDir}/文中插图1_观测差异vs因果效应.jpg`))
})

test('搜索根：正文目录、images/、用户文件夹', () => {
  const roots = buildImageSearchRoots({
    markdownPath: articleMd,
    assetRoots: ['/Users/me/drops'],
    assetFiles: ['/Users/me/pics/cover.jpg'],
  })
  assert.ok(roots.includes(articleDir))
  assert.ok(roots.includes(`${articleDir}/images`))
  assert.ok(roots.includes(`${articleDir}/img`))
  assert.ok(roots.includes(`${articleDir}/assets`))
  assert.ok(roots.includes('/Users/me/images'))
  assert.ok(roots.includes('/Users/me/drops'))
  assert.ok(roots.includes('/Users/me/drops/images'))
  assert.ok(roots.includes('/Users/me/pics'))
})

test('按 .md 同级 images/ 解析用户复现路径', () => {
  const resolved = resolveBodyImageSrc(siteSrc, { markdownPath: articleMd }, files(localJpg))
  assert.deepEqual(resolved, { kind: 'local', path: localJpg })
})

test('相对路径、file://、真实存在的绝对路径', () => {
  assert.deepEqual(
    resolveBodyImageSrc('images/a.jpg', { markdownPath: articleMd }, files(`${articleDir}/images/a.jpg`)),
    { kind: 'local', path: `${articleDir}/images/a.jpg` },
  )
  assert.deepEqual(
    resolveBodyImageSrc('file:///Users/me/notes/images/a.jpg', {}, files('/Users/me/notes/images/a.jpg')),
    { kind: 'local', path: '/Users/me/notes/images/a.jpg' },
  )
  assert.deepEqual(
    resolveBodyImageSrc(localJpg, {}, files(localJpg)),
    { kind: 'local', path: localJpg },
  )
  assert.deepEqual(resolveBodyImageSrc('https://cdn.example/a.jpg', {}), {
    kind: 'remote',
    path: 'https://cdn.example/a.jpg',
  })
})

test('拖入/点选的单张图按文件名匹配', () => {
  const dropped = '/Users/me/Desktop/文中插图1_观测差异vs因果效应.jpg'
  const resolved = resolveBodyImageSrc(siteSrc, { assetFiles: [dropped] }, files(dropped))
  assert.deepEqual(resolved, { kind: 'local', path: dropped })
})

test('找不到文件时中文报错点名，禁止静默跳过', () => {
  assert.throws(
    () => resolveBodyImageSrc(siteSrc, {}),
    (error: unknown) => {
      assert.ok(error instanceof Error)
      assert.match(error.message, /找不到本地图片/)
      assert.match(error.message, /文中插图1_观测差异vs因果效应\.jpg/)
      assert.match(error.message, /读取本地 \.md/)
      return true
    },
  )
  assert.throws(
    () => resolveBodyImageSrc(siteSrc, { markdownPath: articleMd }, files()),
    (error: unknown) => {
      assert.ok(error instanceof Error)
      assert.match(error.message, /已在正文目录与配图文件夹中查找/)
      assert.match(error.message, /文中插图1_观测差异vs因果效应\.jpg/)
      return true
    },
  )
  assert.match(missingLocalImageMessage(siteSrc, {}), /选择\/拖入配图文件夹/)
})

test('data URI 直接失败', () => {
  assert.throws(
    () => resolveBodyImageSrc('data:image/png;base64,xx', {}),
    /不支持 data URI/,
  )
})

test('resolveAllBodyImages + applyResolvedImageSrcs 回写 src', () => {
  const images = [
    { token: 'wximg1', src: siteSrc },
    { token: 'wximg2', src: 'https://cdn.example/b.png' },
  ]
  const resolved = resolveAllBodyImages(images, { markdownPath: articleMd }, files(localJpg))
  assert.deepEqual(resolved, [
    { token: 'wximg1', src: localJpg, originalSrc: siteSrc },
    { token: 'wximg2', src: 'https://cdn.example/b.png', originalSrc: 'https://cdn.example/b.png' },
  ])
  const replacements = new Map(resolved.map((item) => [item.originalSrc, item.src]))
  assert.deepEqual(applyResolvedImageSrcs(images, replacements), [
    { token: 'wximg1', src: localJpg },
    { token: 'wximg2', src: 'https://cdn.example/b.png' },
  ])
})

test('rewriteMarkdownImageSrcs 把本地路径换成上传后的 URL', () => {
  const markdown = [
    '![观测差异vs因果效应对比图](/images/文中插图1_观测差异vs因果效应.jpg)',
    '',
    '![另一张](/images/文中插图1_观测差异vs因果效应.jpg "忽略")',
    '',
    '![远程](https://cdn.example/keep.png)',
  ].join('\n')
  const uploaded = 'https://mmbiz.qpic.cn/uploaded.jpg'
  const next = rewriteMarkdownImageSrcs(markdown, new Map([[siteSrc, uploaded]]))
  assert.equal(
    next,
    [
      `![观测差异vs因果效应对比图](${uploaded})`,
      '',
      `![另一张](${uploaded} "忽略")`,
      '',
      '![远程](https://cdn.example/keep.png)',
    ].join('\n'),
  )
  assert.equal(next.includes(siteSrc), false)
})

test('缺图时 resolveAllBodyImages 不跳过任何一张', () => {
  assert.throws(
    () =>
      resolveAllBodyImages(
        [
          { token: 'wximg1', src: siteSrc },
          { token: 'wximg2', src: 'images/missing.jpg' },
        ],
        { markdownPath: articleMd },
        files(localJpg),
      ),
    /找不到本地图片「images\/missing\.jpg」/,
  )
})

test('封面只认封面/cover 文件名，不把正文插图当封面', () => {
  assert.equal(isCoverFileName('封面.jpg'), true)
  assert.equal(isCoverFileName('cover.PNG'), true)
  assert.equal(isCoverFileName('封面-因果推断.png'), true)
  assert.equal(isCoverFileName('文中插图1_观测差异vs因果效应.jpg'), false)
  const listed = (dir: string): string[] =>
    dir.endsWith('images') ? ['文中插图1_观测差异vs因果效应.jpg', '封面.jpg'] : []
  assert.equal(
    findLocalCover({ markdownPath: articleMd }, files(`${articleDir}/images/封面.jpg`, localJpg), listed),
    `${articleDir}/images/封面.jpg`,
  )
  assert.equal(findLocalCover({ markdownPath: articleMd }, files(localJpg), listed), undefined)
  assert.match(missingCoverMessage(), /手工/)
})

test('同级 images/cover.jpg 即使不列目录也能直接命中', () => {
  const cover = `${articleDir}/images/cover.jpg`
  assert.equal(findLocalCover({ markdownPath: articleMd }, files(cover, localJpg), () => []), cover)
})
