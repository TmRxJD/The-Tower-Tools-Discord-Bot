/**
 * Drive a bot command offline and report what it would reply + whether its
 * interaction flow is well-formed.
 *
 *   npx tsx test-harness/cli.ts enemy-stats --tier 5 --wave 1000
 *
 * Run from the monorepo root (or anywhere the bot's @tmrxjd/platform resolves).
 * PNG attachments are written to test-harness/out/.
 */
import fs from 'node:fs'
import path from 'node:path'

import { runCommand } from './run-command'
import type { MockCommandOptions } from './mock-interaction'

function parseArgs(argv: string[]): { command: string, options: MockCommandOptions } {
  const [command, ...rest] = argv
  const options: MockCommandOptions = {}
  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i]
    if (!token.startsWith('--')) continue
    const key = token.slice(2)
    const next = rest[i + 1]
    if (next == null || next.startsWith('--')) {
      options[key] = true
    } else {
      const num = Number(next)
      options[key] = Number.isFinite(num) && next.trim() !== '' ? num : next
      i += 1
    }
  }
  return { command, options }
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2))
  if (!command) {
    console.error('usage: tsx test-harness/cli.ts <command> [--opt value ...]')
    process.exit(2)
  }

  const result = await runCommand(command, `${command.replace(/-([a-z])/g, (_, c) => c.toUpperCase())}Command`, options)

  console.log(`\n=== /${command} ${JSON.stringify(options)} ===`)

  if (result.error) console.log(`RUNTIME ERROR: ${result.error}`)

  console.log(`\ninteraction flow: ${result.violations.length === 0 ? 'OK ✓' : `${result.violations.length} violation(s) ✗`}`)
  for (const v of result.violations) console.log(`  ✗ [${v.rule}] ${v.detail}`)

  const outDir = path.resolve(__dirname, 'out')
  fs.mkdirSync(outDir, { recursive: true })

  console.log(`\nresponses (${result.responses.length}):`)
  for (const r of result.responses) {
    const embed: any = r.embeds[0]
    const title = embed?.title ? ` "${embed.title}"` : ''
    console.log(`  [+${r.atMs}ms] ${r.kind}${r.ephemeral ? ' (ephemeral)' : ''}${title}${r.components ? ` — ${r.components} component row(s)` : ''}`)
    if (embed?.fields?.length) {
      for (const f of embed.fields.slice(0, 8)) console.log(`      • ${f.name}: ${String(f.value).replace(/\n/g, ' / ').slice(0, 80)}`)
    }
    for (const file of r.files) {
      const ok = file.header === '89504e47' ? 'PNG' : `header ${file.header}`
      let written = ''
      if (file.data) {
        const dest = path.join(outDir, `${command}-${file.name}`)
        fs.writeFileSync(dest, file.data)
        written = ` → ${dest}`
      }
      console.log(`      [file] ${file.name} — ${file.size} bytes (${ok})${written}`)
    }
  }

  process.exit(result.ok ? 0 : 1)
}

main().catch(e => { console.error(e); process.exit(2) })
