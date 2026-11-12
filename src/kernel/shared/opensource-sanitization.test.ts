import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..')

const PUBLIC_TEXT_FILES = [
  'README.md',
  'README.zh-CN.md',
  'CONTRIBUTING.md',
  'CONTRIBUTING.en.md',
  'CITATION.cff',
  'package.json',
  'docs/cover.html',
  'docs/i18n-plan.md',
  'docs/agent-workspace-design.md',
  'docs/module-architecture-design.md',
  'docs/adr/0005-dsh-as-composition-host.md',
  '.github/FUNDING.yml',
  '.github/SUPPORT.md',
  'scripts/host-badge-fixture.html',
  'scripts/rail-activity-fixture.html',
  'scripts/notarize-mac.sh',
]

/** 公开文案不得指向运营者产品线或个人站点。安装身份别名不在此列。 */
const FORBIDDEN_IN_PUBLIC = [
  'https://www.solokit.run',
  'https://pen.bitou.tech',
  'opc-fellows.solokit.run',
  'SoloKit · bitou.tech',
  '榆关',
  '硬核老 K',
  '妈妈和Jimmy',
  '/Users/yu/',
  '@solokit/',
  '开源另起',
]

const SKIP_DIR_NAMES = new Set(['.git', 'node_modules', 'out', 'dist', 'resources', 'build'])

const TEXT_EXTENSIONS = new Set([
  '.md',
  '.ts',
  '.js',
  '.mjs',
  '.cjs',
  '.yml',
  '.yaml',
  '.json',
  '.html',
  '.cff',
  '.sh',
  '.txt',
])

function walkTextFiles(dir: string, into: string[]): void {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIR_NAMES.has(name)) continue
    const full = join(dir, name)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      walkTextFiles(full, into)
      continue
    }
    if (TEXT_EXTENSIONS.has(extname(name))) into.push(full)
  }
}

test('公开文档不带运营者产品线或个人站点', () => {
  for (const rel of PUBLIC_TEXT_FILES) {
    const text = readFileSync(join(repoRoot, rel), 'utf8')
    for (const needle of FORBIDDEN_IN_PUBLIC) {
      assert.doesNotMatch(
        text,
        new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
        `${rel} 不应出现 ${needle}`,
      )
    }
  }
})

test('封面与资助页不以个人品牌做默认署名', () => {
  const cover = readFileSync(join(repoRoot, 'docs/cover.html'), 'utf8')
  const funding = readFileSync(join(repoRoot, '.github/FUNDING.yml'), 'utf8')
  const citation = readFileSync(join(repoRoot, 'CITATION.cff'), 'utf8')
  const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as {
    author?: string
  }
  assert.match(cover, /Local-first · MIT/)
  assert.doesNotMatch(cover, /SoloKit/)
  assert.doesNotMatch(funding, /solokit\.run|bitou\.tech/)
  assert.doesNotMatch(citation, /solokit\.run|pen\.bitou\.tech/)
  assert.equal(pkg.author, 'OPC-Fellows contributors')
})

test('测试夹具不用运营者本机路径', () => {
  const files: string[] = []
  walkTextFiles(join(repoRoot, 'src'), files)
  walkTextFiles(join(repoRoot, 'scripts'), files)
  for (const file of files) {
    const rel = relative(repoRoot, file)
    if (rel.endsWith('opensource-sanitization.test.ts')) continue
    const text = readFileSync(file, 'utf8')
    assert.doesNotMatch(text, /\/Users\/yu\//, `${rel} 不应出现 /Users/yu/`)
    assert.doesNotMatch(text, /硬核老 K/, `${rel} 不应出现个人显示名`)
  }
})
