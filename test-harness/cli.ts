/**
 * Drive a bot command offline and report what it would reply + whether its
 * interaction flow is well-formed.
 *
 *   npx tsx test-harness/cli.ts enemy-stats --tier 5 --wave 1000
 *
 * Multi-step flows (buttons / selects / modals) are scripted with --steps, a JSON
 * array of interaction steps pushed through the command's component collector:
 *
 *   npx tsx test-harness/cli.ts enemy-stats \
 *     --steps '[{"type":"button","customId":"enemy_stats_set_inputs",
 *               "modalValues":{"enemy_stats_tier":"5","enemy_stats_wave":"1000",
 *                              "enemy_stats_health_skip":"0","enemy_stats_attack_skip":"0"}}]'
 *
 * Run from the monorepo root (or anywhere the bot's @tmrxjd/platform resolves).
 * PNG attachments are written to test-harness/out/.
 */
import fs from 'node:fs'
import path from 'node:path'

import { runCommand } from './run-command'
import type { InteractionStep, MockCommandOptions } from './mock-interaction'

function parseArgs(argv: string[]): { command: string, options: MockCommandOptions, steps: InteractionStep[] } {
  const [command, ...rest] = argv
  const options: MockCommandOptions = {}
  let steps: InteractionStep[] = []
  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i]
    if (!token.startsWith('--')) continue
    const key = token.slice(2)
    const next = rest[i + 1]
    if (key === 'steps') {
      if (next != null) { steps = JSON.parse(next) as InteractionStep[]; i += 1 }
      continue
    }
    if (next == null || next.startsWith('--')) {
      options[key] = true
    } else {
      const num = Number(next)
      options[key] = Number.isFinite(num) && next.trim() !== '' ? num : next
      i += 1
    }
  }
  return { command, options, steps }
}

async function main() {
  const { command, options, steps } = parseArgs(process.argv.slice(2))
  if (!command) {
    console.error('usage: tsx test-harness/cli.ts <command> [--opt value ...] [--steps \'<json>\']')
    process.exit(2)
  }

  const exportName = `${command.replace(/-([a-z])/g, (_, c) => c.toUpperCase())}Command`
  const result = await runCommand(command, exportName, options, steps)

  console.log(`\n=== /${command} ${JSON.stringify(options)}${steps.length ? ` + ${steps.length} step(s)` : ''} ===`)

  if (result.error) console.log(`RUNTIME ERROR: ${result.error}`)

  console.log(`\ninteraction flow: ${result.violations.length === 0 ? 'OK ✓' : `${result.violations.length} violation(s) ✗`}`)
  for (const v of result.violations) console.log(`  ✗ [${v.rule}] ${v.detail}`)
  if (steps.length) console.log(`steps driven: ${result.stepsRun ?? 0}/${steps.length}`)

  const outDir = path.resolve(__dirname, 'out')
  fs.mkdirSync(outDir, { recursive: true })

  console.log(`\nresponses (${result.responses.length}):`)
  let fileSeq = 0
  for (const r of result.responses) {
    const embed: any = r.embeds[0]
    const title = embed?.title ? ` "${embed.title}"` : ''
    console.log(`  [+${r.atMs}ms] (${r.source}) ${r.kind}${r.ephemeral ? ' (ephemeral)' : ''}${title}${r.components ? ` — ${r.components} component row(s)` : ''}`)
    if (embed?.fields?.length) {
      for (const f of embed.fields.slice(0, 8)) console.log(`      • ${f.name}: ${String(f.value).replace(/\n/g, ' / ').slice(0, 80)}`)
    }
    for (const file of r.files) {
      const ok = file.header === '89504e47' ? 'PNG' : `header ${file.header}`
      let written = ''
      if (file.data) {
        const dest = path.join(outDir, `${command}-${fileSeq++}-${file.name}`)
        fs.writeFileSync(dest, file.data)
        written = ` → ${dest}`
      }
      console.log(`      [file] ${file.name} — ${file.size} bytes (${ok})${written}`)
    }
  }

  process.exit(result.ok ? 0 : 1)
}

main().catch(e => { console.error(e); process.exit(2) })
