import assert from 'node:assert/strict'
import test from 'node:test'
import { composeDshTurn } from './dsh-rpc.ts'
import {
  composeLocalApiTask,
  formatAgentTaskJob,
  LOCAL_API_SYSTEM,
  localApiTaskSessionId,
} from './dsh-task.ts'

test('Local API 作业会话跟中栏同一套 id 规则', () => {
  assert.equal(localApiTaskSessionId('abc'), 'opc:local-api:abc')
  assert.equal(localApiTaskSessionId('job/1 x'), 'opc:local-api:job_1_x')
})

test('任务正文拼上本机助手人设；profile 不进 prompt', () => {
  const text = composeLocalApiTask('列出目录')
  assert.equal(text, composeDshTurn(LOCAL_API_SYSTEM, '列出目录'))
  assert.equal(text.includes('headless'), false)
  assert.equal(text.includes('profile'), false)
})

test('成功作业把助手正文写成 stdout', () => {
  assert.deepEqual(formatAgentTaskJob({ text: '完成了' }), {
    stdout: '完成了\n',
    stderr: '',
    exitCode: 0,
    status: 'done',
  })
  assert.deepEqual(formatAgentTaskJob({ text: '已有换行\n' }), {
    stdout: '已有换行\n',
    stderr: '',
    exitCode: 0,
    status: 'done',
  })
})

test('失败作业只写 stderr，exitCode 非 0', () => {
  assert.deepEqual(formatAgentTaskJob({ error: '未找到 DeepSeek API Key。' }), {
    stdout: '',
    stderr: '未找到 DeepSeek API Key。\n',
    exitCode: 1,
    status: 'error',
  })
})
