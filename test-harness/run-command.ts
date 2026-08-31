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
 *
 * Phase 2: after the initial response, a scripted list of `steps` (button clicks /
 * select choices / modal submits) is pushed through the reply's collector. Each
 * component gets the same macrotask-boundary late-ack check, and modal submits are
 * checked for the "shown but never acknowledged" hang.
 */
import path from 'node:path'
import { createRequire } from 'node:module'

import {
  makeMockInteraction,
  type CapturedResponse,
  type InteractionStep,
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
  /** How many scripted steps actually reached a collector and were emitted. */
  stepsRun?: number
}

const nextMacrotask = () => new Promise<void>(resolve => setImmediate(resolve))

export async function runCommand(
  commandFile: string,
  exportName: string,
  options: MockCommandOptions,
  steps: InteractionStep[] = [],
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

  const violations: ProtocolViolation[] = []
  let error: string | undefined
  let stepsRun = 0

  // An async execute() that throws before its first await rejects synchronously.
  // Attach the settle handler NOW so the rejection is never unhandled across the
  // macrotask boundary below (Node aborts on unhandled rejections).
  const settle = (p: Promise<unknown>) =>
    p.then(() => ({} as { error?: string }), (e: unknown) => ({ error: e instanceof Error ? e.message : String(e) }))

  const running = settle(Promise.resolve().then(() => command.execute(mock.interaction)))
  // The first macrotask boundary: microtask-only handlers have acked by now.
  await nextMacrotask()
  const ackedBeforeFirstIO = mock.state !== 'NOT_ACKED'
  error = (await running).error

  // Only a handler that DOES respond but acked after yielding to I/O is late; a
  // handler that returns early without responding (wrong type) is not.
  if (mock.state !== 'NOT_ACKED' && !ackedBeforeFirstIO) {
    violations.push({
      rule: 'late-ack',
      detail: 'the handler awaited real I/O (cloud/DB) before acknowledging — defer/reply first, then do the work',
    })
  }

  // Phase 2: drive scripted component/modal steps through the reply's collector.
  if (!error) {
    for (const step of steps) {
      const collector = mock.collectors[mock.collectors.length - 1]
      if (!collector) {
        violations.push({ rule: 'no-collector', detail: `step "${step.customId}" could not run — the command opened no component collector` })
        break
      }
      const comp = mock.makeComponent(step)
      const stepRunning = settle(collector.emit(comp.interaction))
      await nextMacrotask()
      const stepAckedBeforeIO = comp.acked
      const stepError = (await stepRunning).error
      stepsRun += 1
      if (comp.acked && !stepAckedBeforeIO) {
        violations.push({
          rule: 'late-ack',
          detail: `component "${step.customId}" awaited real I/O before acknowledging (deferUpdate/update) — ack first, then do the work`,
        })
      }
      if (stepError) { error = `step "${step.customId}": ${stepError}`; break }
    }
  }

  const graded = mock.finish()
  // graded.violations holds the protocol errors the mock recorded during the run
  // (double-ack, edit-before-ack, unresolved-defer/modal, …); the ones above are
  // the timing-derived late-acks. Keep late-acks first — they read as the headline.
  const allViolations = [...violations, ...graded.violations]

  return {
    command: commandFile,
    responses: graded.responses,
    violations: allViolations,
    ok: allViolations.length === 0 && !error,
    error,
    stepsRun,
  }
}
