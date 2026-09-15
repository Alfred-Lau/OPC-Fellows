import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { resolveDshBin, vendoredDshBin } from './host.ts'

function withoutOverride(run: () => void): void {
  const previous = process.env.OWNWORKBUDDY_DSH
  delete process.env.OWNWORKBUDDY_DSH
  try {
    run()
  } finally {
    if (previous === undefined) {
      delete process.env.OWNWORKBUDDY_DSH
    } else {
      process.env.OWNWORKBUDDY_DSH = previous
    }
  }
}

test('打包资源里有 vendor 时优先用 extraResources 的 dsh', () => {
  withoutOverride(() => {
    const resources = mkdtempSync(join(tmpdir(), 'opc-dsh-'))
    const bin = vendoredDshBin(resources)
    mkdirSync(join(bin, '..'), { recursive: true })
    writeFileSync(bin, '#!/usr/bin/env node\n')
    assert.equal(
      resolveDshBin({
        resourcesPath: resources,
        resolveModule: () => {
          throw new Error('asar 里不该再 require.resolve dsh')
        },
      }),
      bin,
    )
  })
})

test('没有 vendor 时回落到模块解析，asar 缺失则给出可读错误', () => {
  withoutOverride(() => {
    const resources = mkdtempSync(join(tmpdir(), 'opc-empty-'))
    const fallback = join(resources, 'from-node-modules', 'bin.js')
    mkdirSync(join(fallback, '..'), { recursive: true })
    writeFileSync(fallback, '')
    assert.equal(
      resolveDshBin({
        resourcesPath: resources,
        resolveModule: (specifier) => {
          if (specifier === '@deepseek-ai/dsh/lib/bin.js') {
            return fallback
          }
          throw new Error(`unexpected ${specifier}`)
        },
      }),
      fallback,
    )
    assert.throws(
      () =>
        resolveDshBin({
          resourcesPath: resources,
          resolveModule: () => {
            throw new Error("Cannot find module '@deepseek-ai/dsh/package.json'")
          },
        }),
      /extraResources\/dsh/,
    )
  })
})
