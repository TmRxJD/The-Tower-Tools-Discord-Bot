import { test } from 'node:test'
import assert from 'node:assert/strict'
import { requireRunner, assertDeployedRevision, assertNoNewErrors } from './runner-policy.mjs'

const sha = 'a'.repeat(40)
function fixture() {
  const env = { GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'push', GITHUB_REF: 'refs/heads/main', GITHUB_RUN_ID: '1', RUNNER_NAME: 'runner', GITHUB_SHA: sha, GITHUB_REPOSITORY: 'owner/bot' }
  const calls = []
  const answers = { remote: 'https://github.com/owner/bot.git', branch: 'main', status: '', pull: '', 'rev-parse': sha, 'ls-remote': `${sha}\trefs/heads/main` }
  return { env, calls, answers, git: args => { calls.push(args); return answers[args[0]] } }
}
test('accepts only clean exact pushed revision after runner pull', () => {
  const f = fixture()
  assert.equal(requireRunner({ ...f, synchronize: true }), sha)
  assert.deepEqual(f.calls.find(args => args[0] === 'pull'), ['pull', '--ff-only', 'origin', 'main'])
  assert.ok(f.calls.findIndex(args => args[0] === 'status') < f.calls.findIndex(args => args[0] === 'pull'))
})
for (const [key, value] of [['GITHUB_ACTIONS', 'false'], ['GITHUB_EVENT_NAME', 'repository_dispatch'], ['GITHUB_REF', 'refs/heads/dev'], ['GITHUB_RUN_ID', ''], ['RUNNER_NAME', ''], ['GITHUB_SHA', 'bad']]) {
  test(`rejects invalid runner context ${key}`, () => {
    const f = fixture(); f.env[key] = value
    assert.throws(() => requireRunner(f)); assert.deepEqual(f.calls, [])
  })
}
for (const [key, value] of [['remote', 'https://github.com/other/bot'], ['branch', 'dev'], ['status', '?? local-data'], ['status', ' M tracked'], ['rev-parse', 'b'.repeat(40)], ['ls-remote', 'b'.repeat(40)]]) {
  test(`rejects wrong repository/revision or dirty checkout ${key} ${value}`, () => {
    const f = fixture(); f.answers[key] = value
    assert.throws(() => requireRunner(f))
  })
}
test('never pulls over local work', () => {
  const f = fixture(); f.answers.status = ' M source.ts'
  assert.throws(() => requireRunner({ ...f, synchronize: true }))
  assert.ok(!f.calls.some(args => args[0] === 'pull'))
})
test('accepts fresh process with pushed revision and fresh Discord readiness', () => {
  const now = Date.now()
  assert.doesNotThrow(() => assertDeployedRevision({ pid: 2, pm2_env: { status: 'online', DEPLOYED_GIT_SHA: sha, pm_uptime: now } },
    { sha, previousPid: 1, startedAt: now - 1000 }, sha, { pid: 2, utc: new Date(now).toISOString(), discord: { ready: true } }))
})
for (const kind of ['wrong-sha', 'old-pid', 'old-start', 'offline', 'wrong-readiness-pid', 'not-ready', 'stale-readiness']) {
  test(`rejects deployed evidence ${kind}`, () => {
    const now = Date.now()
    const service = { pid: 2, pm2_env: { status: 'online', DEPLOYED_GIT_SHA: sha, pm_uptime: now } }
    const receipt = { sha, previousPid: 1, startedAt: now - 1000 }
    const readiness = { pid: 2, utc: new Date(now).toISOString(), discord: { ready: true } }
    if (kind === 'wrong-sha') service.pm2_env.DEPLOYED_GIT_SHA = 'b'.repeat(40)
    if (kind === 'old-pid') service.pid = 1
    if (kind === 'old-start') service.pm2_env.pm_uptime = now - 2000
    if (kind === 'offline') service.pm2_env.status = 'stopped'
    if (kind === 'wrong-readiness-pid') readiness.pid = 1
    if (kind === 'not-ready') readiness.discord.ready = false
    if (kind === 'stale-readiness') readiness.utc = new Date(now - 100_000).toISOString()
    assert.throws(() => assertDeployedRevision(service, receipt, sha, readiness))
  })
}
test('accepts empty stderr and the exact non-error model dtype advisory, retaining errors', () => {
  const advisory = 'dtype not specified for "model". Using the default dtype (fp32) for this device (cpu).'
  assert.doesNotThrow(() => assertNoNewErrors(''))
  assert.doesNotThrow(() => assertNoNewErrors(advisory + '\n'))
  assert.throws(() => assertNoNewErrors(advisory + '\nError: model load failed'))
  assert.throws(() => assertNoNewErrors('Unhandled rejection'))
})
