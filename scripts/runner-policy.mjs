import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Accident-prevention policy, not an authentication or administrator boundary.
export function requireRunner({ env = process.env, git = args => execFileSync('git', args, { encoding: 'utf8' }).trim(), synchronize = false } = {}) {
  if (env.GITHUB_ACTIONS !== 'true' || env.GITHUB_EVENT_NAME !== 'push' || env.GITHUB_REF !== 'refs/heads/main'
      || !env.GITHUB_RUN_ID || !env.RUNNER_NAME || !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA ?? '')) {
    throw new Error('Deployment requires a GitHub Actions push to main; push reviewed changes and let the runner deploy.')
  }
  const remote = git(['remote', 'get-url', 'origin']).replace(/\.git$/, '').toLowerCase()
  if (remote !== `https://github.com/${env.GITHUB_REPOSITORY}`.toLowerCase()) throw new Error('Runner repository does not match origin.')
  if (git(['branch', '--show-current']) !== 'main') throw new Error('Production checkout must be on main.')
  if (git(['status', '--porcelain', '--untracked-files=all'])) throw new Error('Production checkout has local changes; preserve and reconcile them before deployment.')
  if (synchronize) git(['pull', '--ff-only', 'origin', 'main'])
  const head = git(['rev-parse', 'HEAD'])
  const live = git(['ls-remote', 'origin', 'refs/heads/main']).split(/\s+/)[0]
  if (head !== env.GITHUB_SHA || live !== env.GITHUB_SHA) throw new Error('Checkout, pushed main and triggering SHA must match; stale jobs cannot deploy.')
  return head
}

export function assertDeployedRevision(service, receipt, expectedSha, readiness) {
  if (!service || service.pm2_env?.status !== 'online') throw new Error('Deployed process is not online.')
  if (receipt.sha !== expectedSha || service.pm2_env.DEPLOYED_GIT_SHA !== expectedSha) throw new Error('Running process revision does not match pushed SHA.')
  if (service.pid === receipt.previousPid || service.pm2_env.pm_uptime < receipt.startedAt) throw new Error('Deployment did not create a fresh process.')
  if (readiness && (readiness.pid !== service.pid || readiness.discord?.ready !== true
    || !Number.isFinite(Date.parse(readiness.utc)) || Date.now() - Date.parse(readiness.utc) > 90_000
    || Date.parse(readiness.utc) < receipt.startedAt)) throw new Error('Discord readiness does not belong to the fresh deployed process.')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  requireRunner({ synchronize: process.argv[2] === 'sync' })
}
