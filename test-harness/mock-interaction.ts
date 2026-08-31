/**
 * A protocol-enforcing mock of a Discord ChatInputCommandInteraction.
 *
 * The point is NOT just to capture what a command replies — it is to model the
 * interaction LIFECYCLE the way Discord does, so a command that acks late, acks
 * twice, edits before acking, shows a modal after deferring, or defers and never
 * resolves fails HERE instead of only failing live in a channel.
 *
 * It is deliberately standalone (no discord.js runtime) and CommonJS-friendly so
 * it can be driven by tsx from the monorepo, where the bot's platform peer deps
 * resolve. The command handler only touches a slice of the discord.js surface;
 * this implements that slice and throws the same errors Discord returns.
 */

export type MockCommandOptions = Record<string, string | number | boolean | null | undefined>

export interface CapturedFile {
  name: string
  size: number
  /** First bytes, for a cheap "is this a PNG" sanity check. */
  header: string
  /** The bytes, kept so the CLI can write it and the playground can show it. */
  data?: Buffer
}

export interface CapturedResponse {
  kind: 'deferReply' | 'reply' | 'editReply' | 'followUp' | 'showModal'
  ephemeral?: boolean
  content?: string
  embeds: unknown[]
  components: number
  files: CapturedFile[]
  modalTitle?: string
  atMs: number
}

export interface ProtocolViolation {
  rule: string
  detail: string
}

/** Thrown for the hard lifecycle errors Discord itself would reject. */
export class InteractionProtocolError extends Error {
  constructor(public readonly rule: string, detail: string) {
    super(`[interaction] ${rule}: ${detail}`)
    this.name = 'InteractionProtocolError'
  }
}

type AckState = 'NOT_ACKED' | 'DEFERRED' | 'REPLIED'

export interface MockInteractionConfig {
  commandName: string
  options?: MockCommandOptions
  userId?: string
  guildId?: string | null
  /** Time-to-first-ack budget; Discord's real window is 3000ms. */
  ackBudgetMs?: number
  /** Injected into external-IO stubs so IO-before-ack is caught deterministically. */
  now?: () => number
}

export interface MockInteractionResult {
  responses: CapturedResponse[]
  violations: ProtocolViolation[]
  /** Every ProtocolViolation plus a pass/fail verdict. */
  ok: boolean
}

const PNG_MAGIC = '89504e47'

function toCapturedFiles(files: unknown): CapturedFile[] {
  if (!Array.isArray(files)) return []
  return files.map((f: any) => {
    const buf: Buffer | undefined = f?.attachment ?? f?.data ?? (Buffer.isBuffer(f) ? f : undefined)
    const name: string = f?.name ?? 'attachment'
    if (Buffer.isBuffer(buf)) {
      return { name, size: buf.length, header: buf.subarray(0, 4).toString('hex'), data: buf }
    }
    return { name, size: 0, header: '' }
  })
}

function embedsToJson(embeds: unknown): unknown[] {
  if (!Array.isArray(embeds)) return []
  return embeds.map((e: any) => (typeof e?.toJSON === 'function' ? e.toJSON() : e))
}

/**
 * Build a mock interaction plus the recorder that grades it. Pass the recorder's
 * `externalIO(name)` into any stubbed slow dependency (cloud reads, chart render)
 * so an await-before-ack is flagged even when the stub is fast.
 */
export function makeMockInteraction(config: MockInteractionConfig) {
  const now = config.now ?? (() => Date.now())
  const createdAt = now()
  const ackBudgetMs = config.ackBudgetMs ?? 3000
  const options = config.options ?? {}
  const userId = config.userId ?? 'harness-user'

  const responses: CapturedResponse[] = []
  const violations: ProtocolViolation[] = []
  let state: AckState = 'NOT_ACKED'
  let resolvedAfterDefer = false
  let firstAckAt: number | null = null

  const note = (rule: string, detail: string) => violations.push({ rule, detail })

  const recordAck = (kind: CapturedResponse['kind']) => {
    if (firstAckAt === null) {
      firstAckAt = now()
      const elapsed = firstAckAt - createdAt
      if (elapsed > ackBudgetMs) {
        note('late-ack', `first acknowledgement (${kind}) after ${elapsed}ms, past the ${ackBudgetMs}ms window`)
      }
    }
  }

  const capture = (r: Omit<CapturedResponse, 'atMs'>) => {
    responses.push({ ...r, atMs: now() - createdAt })
  }

  const optionGetter = <T>(coerce: (v: unknown) => T | null) =>
    (name: string, required?: boolean): T | null => {
      const raw = options[name]
      if (raw == null) {
        if (required) throw new InteractionProtocolError('missing-required-option', name)
        return null
      }
      return coerce(raw)
    }

  const interaction: any = {
    id: `harness-${config.commandName}-${createdAt}`,
    commandName: config.commandName,
    guildId: config.guildId ?? null,
    channelId: 'harness-channel',
    user: { id: userId, tag: 'harness#0000', username: 'harness' },
    member: null,
    memberPermissions: { has: () => true },
    client: makeMockClient(),
    isChatInputCommand: () => true,
    isButton: () => false,
    inGuild: () => config.guildId != null,
    get replied() { return state === 'REPLIED' },
    get deferred() { return state === 'DEFERRED' },
    options: {
      getString: optionGetter(v => String(v)),
      getInteger: optionGetter(v => Math.trunc(Number(v))),
      getNumber: optionGetter(v => Number(v)),
      getBoolean: optionGetter(v => Boolean(v)),
      getSubcommand: (required?: boolean) => {
        const v = options.__subcommand
        if (v == null && required) throw new InteractionProtocolError('missing-subcommand', config.commandName)
        return v == null ? null : String(v)
      },
    },

    async deferReply(opts?: { ephemeral?: boolean }) {
      if (state !== 'NOT_ACKED') {
        throw new InteractionProtocolError('double-ack', `deferReply after ${state.toLowerCase()}`)
      }
      recordAck('deferReply')
      state = 'DEFERRED'
      capture({ kind: 'deferReply', ephemeral: opts?.ephemeral, embeds: [], components: 0, files: [] })
    },

    async reply(payload: any) {
      if (state !== 'NOT_ACKED') {
        throw new InteractionProtocolError('double-ack', `reply after ${state.toLowerCase()}`)
      }
      recordAck('reply')
      state = 'REPLIED'
      resolvedAfterDefer = true
      capture(payloadToResponse('reply', payload))
    },

    async editReply(payload: any) {
      if (state === 'NOT_ACKED') {
        throw new InteractionProtocolError('edit-before-ack', 'editReply before reply/deferReply')
      }
      resolvedAfterDefer = true
      capture(payloadToResponse('editReply', payload))
      return { id: 'harness-message', createMessageComponentCollector: makeMockCollector }
    },

    async followUp(payload: any) {
      if (state === 'NOT_ACKED') {
        throw new InteractionProtocolError('followup-before-ack', 'followUp before reply/deferReply')
      }
      capture(payloadToResponse('followUp', payload))
      return { id: 'harness-followup' }
    },

    async showModal(modal: any) {
      if (state !== 'NOT_ACKED') {
        throw new InteractionProtocolError('modal-not-first', `showModal after ${state.toLowerCase()} — a modal must be the first response`)
      }
      recordAck('showModal')
      state = 'REPLIED'
      const title = typeof modal?.toJSON === 'function' ? modal.toJSON()?.title : modal?.title
      capture({ kind: 'showModal', embeds: [], components: 0, files: [], modalTitle: title })
    },

    async fetchReply() {
      if (state === 'NOT_ACKED') {
        throw new InteractionProtocolError('fetch-before-ack', 'fetchReply before the interaction was acknowledged')
      }
      return { id: 'harness-message', createMessageComponentCollector: makeMockCollector }
    },
  }

  function payloadToResponse(kind: CapturedResponse['kind'], payload: any): Omit<CapturedResponse, 'atMs'> {
    return {
      kind,
      ephemeral: payload?.ephemeral,
      content: payload?.content,
      embeds: embedsToJson(payload?.embeds),
      components: Array.isArray(payload?.components) ? payload.components.length : 0,
      files: toCapturedFiles(payload?.files),
    }
  }

  /**
   * A stubbed slow dependency calls this before doing its work. If the interaction
   * has not been acked yet, that is a structural late-ack — the handler is awaiting
   * I/O before telling Discord it is working — flagged even when the stub is fast.
   */
  const externalIO = (name: string) => {
    if (state === 'NOT_ACKED') {
      note('io-before-ack', `${name} awaited before the interaction was acknowledged — defer/reply first`)
    }
  }

  const finish = (): MockInteractionResult => {
    if (state === 'DEFERRED' && !resolvedAfterDefer) {
      note('unresolved-defer', 'deferReply was called but no editReply/followUp resolved it — the reply stays "thinking…" forever')
    }
    return { responses, violations, ok: violations.length === 0 }
  }

  return { interaction, externalIO, finish, get state() { return state } }
}

/** Minimal client the commands read (scoped sessions, user, etc.). */
function makeMockClient() {
  return {
    user: { id: 'harness-bot', tag: 'harness-bot#0000' },
    scopedInteractionSessions: {
      register: () => {},
      release: () => {},
      get: () => null,
    },
    users: { fetch: async () => ({ id: 'harness-user', tag: 'harness#0000' }) },
  }
}

/** A collector stub that never fires on its own; a follow-on harness can drive it. */
function makeMockCollector() {
  const handlers: Record<string, ((...a: unknown[]) => void)[]> = {}
  return {
    on(event: string, cb: (...a: unknown[]) => void) {
      (handlers[event] ??= []).push(cb)
      return this
    },
    stop() {
      for (const cb of handlers.end ?? []) cb([], 'harness-stop')
    },
    /** Test hook: push a simulated component interaction through the collector. */
    __emit(componentInteraction: unknown) {
      for (const cb of handlers.collect ?? []) cb(componentInteraction)
    },
  }
}
