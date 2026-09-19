import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dest = join(root, 'build', 'dsh-host')
const moduleUrl = pathToFileURL(join(root, 'src/kernel/shared/dsh-host-layout.ts')).href
const { stageDshHost } = await import(moduleUrl)

stageDshHost({ dest, sourceRoot: root })
console.log(`staged dsh-host → ${dest}`)
