import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

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
  if (!readiness || readiness.pid !== service.pid || readiness.discord?.ready !== true
    || !Number.isFinite(Date.parse(readiness.utc)) || Date.now() - Date.parse(readiness.utc) > 90_000
    || Date.parse(readiness.utc) < receipt.startedAt) throw new Error('Discord readiness does not belong to the fresh deployed process.')
}

/** A pre-existing invalid destination stays visible and pending; it is not a process failure. */
export function collectKnownBattleDestinations(text) {
  const destinations = new Set()
  for (const event of text.slice(-65_536).split(/(?=^\[\d{4}-)/m)) {
    if (!/^\[[^\]]+\] \[WARN\] Battle conditions delivery target unavailable /.test(event)) continue
    const guild = event.match(/guildId: '(\d{17,20})'/)?.[1]
    const channel = event.match(/channelId: '(\d{17,20})'/)?.[1]
    if (guild && channel && event.includes("reason: 'guild-unavailable'")) {
      destinations.add(createHash('sha256').update(`${guild}:${channel}`).digest('hex').slice(0, 16))
    }
    try {
      const details = JSON.parse(event.slice(event.indexOf('target unavailable ') + 'target unavailable '.length).trim())
      if (isInvalidGuildWarning(details)) destinations.add(details.destination)
    } catch { /* The legacy structured warning is handled above. */ }
  }
  return [...destinations].slice(-32)
}

function isInvalidGuildWarning(details) {
  return /^[a-f0-9]{16}$/.test(details?.destination ?? '') && /^[a-f0-9]{16}$/.test(details?.record ?? '')
    && Object.keys(details).every(key => ['destination', 'record', 'rank', 'pid', 'reason', 'stage', 'classification', 'code', 'status', 'outcome'].includes(key))
    && details.reason === 'guild-unavailable' && details.stage === 'guild-fetch'
    && details.classification === 'invalid-destination' && details.code === 10004 && details.status === 404
    && details.outcome === 'pending-retained' && Number.isInteger(details.pid) && details.pid > 0
    && ['legends', 'champ', 'plat', 'gold', 'silver', 'mythic'].includes(details.rank)
}

export function assertNoNewErrors(text, knownBattleDestinations = []) {
  // Transformers emits this advisory on stderr even on successful model load.
  // Keep it in the log; allow only the exact known non-error line.
  const advisory = 'dtype not specified for "model". Using the default dtype (fp32) for this device (cpu).'
  const retainedWarnings = []
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trim() === advisory) continue
    const match = line.match(/^\[[^\]]+\] \[WARN\] Battle conditions delivery target unavailable (\{.*\})$/)
    if (match) {
      try {
        const details = JSON.parse(match[1])
        if (isInvalidGuildWarning(details) && knownBattleDestinations.includes(details.destination)) {
          retainedWarnings.push({ destination: details.destination, code: details.code, outcome: details.outcome })
          continue
        }
      } catch { /* Unexpected or malformed stderr remains a deployment failure. */ }
    }
    throw new Error('New unexpected stderr since activation; inspect service logs before accepting deployment.')
  }
  return retainedWarnings
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  requireRunner({ synchronize: process.argv[2] === 'sync' })
}
