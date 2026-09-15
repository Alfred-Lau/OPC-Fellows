/**
 * 主理人编码纪律。流程改编自 mattpocock/skills 的工程实践
 *（先对齐、红绿测试、两轴审查、有复现再修），用本产品口令重写，不搬原文。
 * https://github.com/mattpocock/skills
 */

export const CODING_SKILL_IDS = [
  'grill-change',
  'ship-change',
  'tdd',
  'code-review',
  'diagnose-bug',
] as const

export const HOST_EXECUTION_SKILL_IDS = [
  'research-brief',
  'verify-loop',
  ...CODING_SKILL_IDS,
] as const

const CODING_FAST_PATH =
  /改代码|落地实现|先写测试|红绿重构|审查改动|代码审查|对照规格审查|排查|诊断这个|修这个|改这一处|改这个函数|动手改|test-driven|\btdd\b|\bdebug\b/i

const GRILL_PATH = /问清楚|先对齐|先问清楚/

export function isCodingFastPath(text: string): boolean {
  return CODING_FAST_PATH.test(text.trim())
}

export function skipsPlanGate(text: string): boolean {
  return isCodingFastPath(text) || GRILL_PATH.test(text.trim())
}

export function hasWorkspaceWriteTools(tools: readonly { name: string }[]): boolean {
  return tools.some(
    (tool) => tool.name === 'fs_write' || tool.name === 'apply_patch' || tool.name === 'bash',
  )
}

export function codingSystemHint(hasWorkspace: boolean): string {
  if (!hasWorkspace) {
    return ''
  }
  return [
    '编码时按工程纪律办事（改编自 mattpocock/skills，不是技能商店）：',
    '1. 大改先问清楚再动手；小改（改一处、修这个）可以直接写。',
    '2. 先读 CONTEXT.md / AGENTS.md / 仓库简报，用项目自己的词，不要另造一套说法。',
    '3. 能测的改动走红绿：先在双方确认的接缝写一条会失败的测试，再写刚好让它通过的代码。一次一条垂直切片。测试验行为，不测私有实现。',
    '4. 用 apply_patch 做最小改动，禁止整文件瞎覆写，禁止编不存在的 API。',
    '5. 改完跑仓库已有的测试 / 类型检查；没跑就不要说已经修好。',
    '6. 收工按两轴看：规范（是否符合仓库写法）和规格（是否做了用户要的事）。两轴分开说，不要用其中一条掩盖另一条。',
    '7. 排查必须先有一条能复现症状的命令，再假设原因。',
  ].join('\n')
}
