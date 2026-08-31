/**
 * Run every real slash command through the harness with default options and print
 * a compact verdict table. A quick "test everything" pass: it surfaces late/double
 * acks, unresolved defers, and crashes across the whole command set at once.
 *
 *   npx tsx test-harness/sweep.ts        (from the monorepo root)
 */
import { runCommand } from './run-command'

const COMMANDS = [
  '8ball', 'acronym', 'acronyms', 'analytics', 'ask', 'battle-conditions', 'bots',
  'chart', 'checklist', 'cph', 'creator', 'define', 'define-message', 'earnings',
  'enemy-stats', 'giveaway', 'guardian', 'lab', 'meow', 'module', 'ping', 'reload',
  'remind', 'server', 'settings', 'shard-splitter', 'stone', 'thorns', 'tools', 'user',
  'workshop',
]

const toExport = (c: string) => `${c.replace(/-([a-z])/g, (_, x) => x.toUpperCase())}Command`

async function main() {
  const rows: string[] = []
  for (const cmd of COMMANDS) {
    let verdict: string
    try {
      const r = await runCommand(cmd, toExport(cmd), {})
      if (r.error) verdict = `ERR   ${r.error.slice(0, 90)}`
      else if (r.violations.length) verdict = `VIOL  ${r.violations.map(v => v.rule).join(',')}`
      else verdict = `OK    ${r.responses.length} resp` + (r.responses.some(x => x.files.length) ? ' +chart' : '')
    } catch (e) {
      verdict = `THROW ${(e instanceof Error ? e.message : String(e)).slice(0, 90)}`
    }
    rows.push(`${cmd.padEnd(20)} ${verdict}`)
    // eslint-disable-next-line no-console
    console.error(`done ${cmd}`) // progress marker to stderr
  }
  // eslint-disable-next-line no-console
  console.log('\n===== HARNESS SWEEP =====\n' + rows.join('\n') + '\n')
}

main().catch(e => { console.error(e); process.exit(1) })
