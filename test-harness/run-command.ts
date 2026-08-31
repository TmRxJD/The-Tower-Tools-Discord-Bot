/**
 * Run a bot command against the protocol-enforcing mock interaction, offline.
 *
 * Driven by tsx from the monorepo root, where the bot's @tmrxjd/platform peer
 * (and its thetowersdk/tracker-languages transitive deps) resolve. Cloud/DB
 * dependencies run for real and degrade offline (no Appwrite config → null client,
 * RxDB falls back) — which is what makes the late-ack check below reliable.
 *
 * Late-ack detection is patch-free: a correct handler acknowledges (defer/reply/
 * showModal) before it yields to any real I/O. Real I/O is a MACROTASK, so if the
 * interaction is still unacknowledged at the first macrotask boundary after execute
 * begins, the handler awaited a cloud/DB round-trip before acking — the exact shape
 * that expires an interaction under real latency. (An `await` that only chains
 * microtasks — config, cached lookups — still lands the ack before that boundary.)
 */
import path from 'node:path'
import { createRequire } from 'node:module'

import {
  makeMockInteraction,
  type CapturedResponse,
  type MockCommandOptions,
  type ProtocolViolation,
} from './mock-interaction'

const BOT_ROOT = path.resolve(__dirname, '..')
const requireFromBot = createRequire(path.join(BOT_ROOT, 'src', '_harness_anchor.ts'))

export interface RunResult {
  command: string
  responses: CapturedResponse[]
  violations: ProtocolViolation[]
  ok: boolean
  error?: string
}

const nextMacrotask = () => new Promise<void>(resolve => setImmediate(resolve))

export async function runCommand(
  commandFile: string,
  exportName: string,
  options: MockCommandOptions,
): Promise<RunResult> {
  // Compile/require the command and its imports BEFORE the ack clock starts, so
  // first-load compilation is never miscounted as time-to-acknowledge.
  let command: any
  try {
    const mod = requireFromBot(`./commands/${commandFile}`)
    command = mod[exportName] ?? mod.default
      ?? Object.values(mod).find((v: any) => v && typeof v.execute === 'function')
    if (!command || typeof command.execute !== 'function') {
      throw new Error(`no command with .execute found in ${commandFile}`)
    }
  } catch (e) {
    return { command: commandFile, responses: [], violations: [], ok: false, error: e instanceof Error ? e.message : String(e) }
  }

  const mock = makeMockInteraction({ commandName: commandFile, options })

  let error: string | undefined
  let ackedBeforeFirstIO: boolean
  try {
    const running = Promise.resolve(command.execute(mock.interaction))
    // The first macrotask boundary: microtask-only handlers have acked by now.
    await nextMacrotask()
    ackedBeforeFirstIO = mock.state !== 'NOT_ACKED'
    await running
  } catch (e) {
    error = e instanceof Error ? e.message : String(e)
    ackedBeforeFirstIO = mock.state !== 'NOT_ACKED'
  }

  const graded = mock.finish()
  const violations: ProtocolViolation[] = [...graded.violations]

  // Only a handler that DOES respond but acked after yielding to I/O is late; a
  // handler that returns early without responding (e.g. wrong interaction type) is
  // not.
  if (mock.state !== 'NOT_ACKED' && !ackedBeforeFirstIO) {
    violations.unshift({
      rule: 'late-ack',
      detail: 'the handler awaited real I/O (cloud/DB) before acknowledging — defer/reply first, then do the work',
    })
  }

  return {
    command: commandFile,
    responses: graded.responses,
    violations,
    ok: violations.length === 0 && !error,
    error,
  }
}
