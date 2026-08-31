/**
 * Local "command playground" — a web UI for driving bot commands offline.
 *
 *   npx tsx test-harness/playground-server.ts        (run from the monorepo root)
 *   → open http://localhost:8420
 *
 * The command runs Node-side (real chart rendering), and the page shows the
 * embed, the chart PNG, and the interaction-flow verdict (late ack, double ack,
 * unresolved defer, …). No Discord, no login.
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'

import { runCommand } from './run-command'

const PORT = Number(process.env.PLAYGROUND_PORT ?? 8420)
const PAGE_PATH = path.join(__dirname, 'playground.html')

const toExportName = (cmd: string) => `${cmd.replace(/-([a-z])/g, (_, c) => c.toUpperCase())}Command`

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && (req.url === '/' || req.url?.startsWith('/index'))) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(fs.readFileSync(PAGE_PATH, 'utf8'))
      return
    }

    if (req.method === 'POST' && req.url === '/run') {
      let body = ''
      for await (const chunk of req) body += chunk
      const { command, options } = JSON.parse(body || '{}') as { command: string, options?: Record<string, unknown> }
      if (!command) { res.writeHead(400); res.end('{"error":"command required"}'); return }

      const result = await runCommand(command, toExportName(command), (options ?? {}) as any)
      const serialized = {
        ...result,
        responses: result.responses.map(r => ({
          ...r,
          files: r.files.map(f => ({
            name: f.name,
            size: f.size,
            isPng: f.header === '89504e47',
            base64: f.data ? f.data.toString('base64') : null,
          })),
        })),
      }
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify(serialized))
      return
    }

    res.writeHead(404); res.end('not found')
  } catch (e) {
    res.writeHead(500, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }))
  }
})

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[playground] http://localhost:${PORT}`)
})
