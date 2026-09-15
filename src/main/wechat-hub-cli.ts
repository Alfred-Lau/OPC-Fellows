import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { dialog } from 'electron'
import { ensureDesktopPath, resolveBinary } from './cli-path'
import {
  coverageFromLaunch,
  radarDbPath,
  redactHome,
  resolveHubLaunch,
  resolveReaderBin,
  type WechatCoverage,
  type WechatHubLaunch,
} from '../shared/wechat-hub'
import { wechatHubSettings } from './wechat-hub-store'

export interface HubCommandResult {
  ok: boolean
  stdout: string
  stderr: string
  error: string | null
}

export function probeWechatCoverage(settings = wechatHubSettings()): {
  coverage: WechatCoverage
  launch: WechatHubLaunch
} {
  const home = homedir()
  const launch = resolveHubLaunch(settings, home, process.env, existsSync)
  const readerBin = resolveReaderBin(home, process.env, existsSync) ?? resolveBinary('rion-wechat-cli')
  const dbPath = radarDbPath(home)
  const coverage = coverageFromLaunch({
    launch,
    readerBin,
    radarDb: existsSync(dbPath),
    radarDbPath: dbPath,
    dbStatus: '',
  })
  return { coverage, launch }
}

export function runHubCommand(args: string[], timeout = 60_000): Promise<HubCommandResult> {
  const home = homedir()
  const { launch } = probeWechatCoverage()
  if (launch.kind === 'missing') {
    return Promise.resolve({
      ok: false,
      stdout: '',
      stderr: '',
      error: '还没有找到本机微信情报库引擎。到「本机接入」里指定安装目录，或先按仓库说明在这台电脑上安装。',
    })
  }

  const python = resolveBinary('python3') ?? 'python3'
  const command = launch.kind === 'script' ? 'bash' : python
  const argv = launch.kind === 'script' ? [launch.command, ...args] : [...launch.argsPrefix, ...args]
  const env = {
    ...process.env,
    PATH: ensureDesktopPath(),
    ...(launch.hubHome ? { WECHAT_HUB_HOME: launch.hubHome } : {}),
  }

  return new Promise((resolve) => {
    execFile(
      command,
      argv,
      {
        timeout,
        encoding: 'utf8',
        maxBuffer: 4 * 1024 * 1024,
        cwd: launch.hubHome ?? undefined,
        env,
      },
      (error, stdout, stderr) => {
        const output = String(stdout ?? '')
        const errText = String(stderr ?? '')
        if (error) {
          const message = redactHome(
            errText.trim() || error.message || '本地命令执行失败',
            home,
          )
          resolve({
            ok: false,
            stdout: redactHome(output, home),
            stderr: redactHome(errText, home),
            error: message,
          })
          return
        }
        resolve({
          ok: true,
          stdout: output,
          stderr: errText,
          error: null,
        })
      },
    )
  })
}

export async function pickHubHome(): Promise<string | null> {
  const picked = await dialog.showOpenDialog({
    title: '选择 WeChat Intelligence Hub 项目目录',
    properties: ['openDirectory'],
  })
  const folder = picked.filePaths[0]
  if (!folder) {
    return null
  }
  if (!existsSync(`${folder}/wechat_intelligence_hub.py`) && !existsSync(`${folder}/projects/wechat-intelligence-hub/wechat_intelligence_hub.py`)) {
    return folder
  }
  if (existsSync(`${folder}/projects/wechat-intelligence-hub/wechat_intelligence_hub.py`)) {
    return `${folder}/projects/wechat-intelligence-hub`
  }
  return folder
}
