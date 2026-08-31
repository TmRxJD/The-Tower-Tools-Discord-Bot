/**
 * A protocol-enforcing mock of Discord interactions.
 *
 * The point is NOT just to capture what a command replies — it is to model the
 * interaction LIFECYCLE the way Discord does, so a command that acks late, acks
 * twice, edits before acking, shows a modal after deferring, or defers and never
 * resolves fails HERE instead of only failing live in a channel.
 *
 * Phase 1 covers the initial ChatInputCommandInteraction. Phase 2 adds the
 * component (button / string-select) and modal-submit interactions a command
 * continues through, so a multi-step flow (enemy-stats' tier/wave modal) can be
 * driven and graded end to end. All three interaction kinds share one recorder,
 * so responses land on a single timeline and violations aggregate.
 *
 * It is deliberately standalone (no discord.js runtime) and CommonJS-friendly so
 * it can be driven by tsx from the monorepo, where the bot's platform peer deps
 * resolve. The handlers only touch a slice of the discord.js surface; this
 * implements that slice and throws the same errors Discord returns.
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

/** A clickable control lifted from a rendered message, so a UI can drive it. */
export interface ComponentControl {
  type: 'button' | 'select'
  customId: string
  label?: string
  placeholder?: string
  options?: { value: string, label: string }[]
}

/** A modal field, so a UI can render the form a button opened. */
export interface ModalField {
  customId: string
  label?: string
}

export interface CapturedResponse {
  kind: 'deferReply' | 'reply' | 'editReply' | 'followUp' | 'showModal' | 'deferUpdate' | 'update'
  /** Which interaction produced it: 'command', 'component:<id>', or 'modal:<id>'. */
  source: string
  ephemeral?: boolean
  content?: string
  embeds: unknown[]
  components: number
  /** The actual buttons/selects in this render, so a driver can act on them. */
  controls: ComponentControl[]
  files: CapturedFile[]
  modalTitle?: string
  /** The fields of a shown modal, so a driver can fill and submit it. */
  modalFields?: ModalField[]
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

/** One simulated component (button / select) or modal step to drive. */
export interface InteractionStep {
  type: 'button' | 'select'
  customId: string
  /** Selected values for a select menu. */
  values?: string[]
  /** If this control opens a modal, the field values keyed by field customId. */
  modalValues?: Record<string, string>
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

function readCustomId(modal: any): string | undefined {
  const json = typeof modal?.toJSON === 'function' ? modal.toJSON() : modal
  return json?.custom_id ?? json?.customId ?? modal?.custom_id ?? modal?.customId
}

function readModalTitle(modal: any): string | undefined {
  return typeof modal?.toJSON === 'function' ? modal.toJSON()?.title : modal?.title
}

/** Lift the buttons and string-selects out of a message's component rows. */
function toControls(components: unknown): ComponentControl[] {
  if (!Array.isArray(components)) return []
  const controls: ComponentControl[] = []
  for (const row of components as any[]) {
    const json = typeof row?.toJSON === 'function' ? row.toJSON() : row
    for (const c of json?.components ?? []) {
      const customId = c?.custom_id ?? c?.customId
      if (!customId) continue // link buttons have a url, not a custom_id — not drivable
      if (c?.type === 2) {
        controls.push({ type: 'button', customId, label: c?.label })
      } else if (c?.type === 3) {
        controls.push({
          type: 'select',
          customId,
          placeholder: c?.placeholder,
          options: (c?.options ?? []).map((o: any) => ({ value: String(o?.value), label: o?.label ?? String(o?.value) })),
        })
      }
    }
  }
  return controls
}

/** Lift the text-input field ids out of a modal, so a UI can render its form. */
function toModalFields(modal: any): ModalField[] {
  const json = typeof modal?.toJSON === 'function' ? modal.toJSON() : modal
  const fields: ModalField[] = []
  for (const row of json?.components ?? []) {
    for (const c of row?.components ?? []) {
      const customId = c?.custom_id ?? c?.customId
      if (customId) fields.push({ customId, label: c?.label })
    }
  }
  return fields
}

/**
 * The shared recorder: one timeline of responses and one bag of violations for
 * every interaction in a flow (command + its components + their modals).
 */
interface Recorder {
  now: () => number
  createdAt: number
  responses: CapturedResponse[]
  violations: ProtocolViolation[]
  capture: (source: string, r: Omit<CapturedResponse, 'atMs' | 'source'>) => void
  note: (rule: string, detail: string) => void
  /** Collectors created off the command's reply, exposed so a driver can emit. */
  collectors: MockCollector[]
  /** Modals shown+returned to a handler but not yet acked; checked at finish. */
  pendingModals: { source: string, acked: boolean }[]
}

export interface MockCollector {
  on(event: string, cb: (...a: unknown[]) => void): MockCollector
  stop(): void
  /** Fire every 'collect' handler for one component interaction, awaiting each. */
  emit(componentInteraction: unknown): Promise<void>
  /** Back-compat alias. */
  __emit(componentInteraction: unknown): Promise<void>
}

function payloadToResponse(
  kind: CapturedResponse['kind'],
  payload: any,
): Omit<CapturedResponse, 'atMs' | 'source'> {
  return {
    kind,
    ephemeral: payload?.ephemeral,
    content: payload?.content,
    embeds: embedsToJson(payload?.embeds),
    components: Array.isArray(payload?.components) ? payload.components.length : 0,
    controls: toControls(payload?.components),
    files: toCapturedFiles(payload?.files),
  }
}

/**
 * Build a mock command interaction plus the recorder that grades it. Also exposes
 * `collectors` (to drive buttons/selects) and `makeComponent` (to build one).
 */
export function makeMockInteraction(config: MockInteractionConfig) {
  const now = config.now ?? (() => Date.now())
  const createdAt = now()
  const ackBudgetMs = config.ackBudgetMs ?? 3000
  const options = config.options ?? {}
  const userId = config.userId ?? 'harness-user'

  const rec: Recorder = {
    now,
    createdAt,
    responses: [],
    violations: [],
    collectors: [],
    pendingModals: [],
    capture(source, r) {
      rec.responses.push({ ...r, source, atMs: now() - createdAt })
    },
    note(rule, detail) {
      rec.violations.push({ rule, detail })
    },
  }

  let state: AckState = 'NOT_ACKED'
  let resolvedAfterDefer = false
  let firstAckAt: number | null = null

  const recordAck = (kind: CapturedResponse['kind']) => {
    if (firstAckAt === null) {
      firstAckAt = now()
      const elapsed = firstAckAt - createdAt
      if (elapsed > ackBudgetMs) {
        rec.note('late-ack', `first acknowledgement (${kind}) after ${elapsed}ms, past the ${ackBudgetMs}ms window`)
      }
    }
  }

  const makeCollector = () => {
    const collector = makeMockCollector()
    rec.collectors.push(collector)
    return collector
  }
  const replyMessage = () => ({ id: 'harness-message', createMessageComponentCollector: makeCollector })

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
    channel: { id: 'harness-channel', createMessageComponentCollector: makeCollector, send: async () => ({ id: 'harness-message' }) },
    isChatInputCommand: () => true,
    isButton: () => false,
    isContextMenuCommand: () => false,
    isMessageContextMenuCommand: () => false,
    isUserContextMenuCommand: () => false,
    isAutocomplete: () => false,
    inGuild: () => config.guildId != null,
    get replied() { return state === 'REPLIED' },
    get deferred() { return state === 'DEFERRED' },
    options: {
      getString: optionGetter(v => String(v)),
      getInteger: optionGetter(v => Math.trunc(Number(v))),
      getNumber: optionGetter(v => Number(v)),
      getBoolean: optionGetter(v => Boolean(v)),
      getUser: optionGetter(v => ({ id: String(v), tag: `${v}#0000`, username: String(v) })),
      getChannel: optionGetter(v => ({ id: String(v), name: String(v) })),
      getRole: optionGetter(v => ({ id: String(v), name: String(v) })),
      getMentionable: optionGetter(v => ({ id: String(v) })),
      getAttachment: optionGetter(v => ({ url: String(v), name: String(v), contentType: 'application/octet-stream' })),
      getSubcommand: (required?: boolean) => {
        const v = options.__subcommand
        if (v == null && required) throw new InteractionProtocolError('missing-subcommand', config.commandName)
        return v == null ? null : String(v)
      },
      getSubcommandGroup: () => (options.__subcommandGroup == null ? null : String(options.__subcommandGroup)),
    },

    async deferReply(opts?: { ephemeral?: boolean }) {
      if (state !== 'NOT_ACKED') {
        throw new InteractionProtocolError('double-ack', `deferReply after ${state.toLowerCase()}`)
      }
      recordAck('deferReply')
      state = 'DEFERRED'
      rec.capture('command', { kind: 'deferReply', ephemeral: opts?.ephemeral, embeds: [], components: 0, controls: [], files: [] })
    },

    async reply(payload: any) {
      if (state !== 'NOT_ACKED') {
        throw new InteractionProtocolError('double-ack', `reply after ${state.toLowerCase()}`)
      }
      recordAck('reply')
      state = 'REPLIED'
      resolvedAfterDefer = true
      rec.capture('command', payloadToResponse('reply', payload))
      // discord.js returns a Message when reply is called with fetchReply/withResponse.
      return replyMessage()
    },

    async editReply(payload: any) {
      if (state === 'NOT_ACKED') {
        throw new InteractionProtocolError('edit-before-ack', 'editReply before reply/deferReply')
      }
      resolvedAfterDefer = true
      rec.capture('command', payloadToResponse('editReply', payload))
      return replyMessage()
    },

    async followUp(payload: any) {
      if (state === 'NOT_ACKED') {
        throw new InteractionProtocolError('followup-before-ack', 'followUp before reply/deferReply')
      }
      rec.capture('command', payloadToResponse('followUp', payload))
      return { id: 'harness-followup' }
    },

    async showModal(modal: any) {
      if (state !== 'NOT_ACKED') {
        throw new InteractionProtocolError('modal-not-first', `showModal after ${state.toLowerCase()} — a modal must be the first response`)
      }
      recordAck('showModal')
      state = 'REPLIED'
      rec.capture('command', { kind: 'showModal', embeds: [], components: 0, controls: [], files: [], modalTitle: readModalTitle(modal), modalFields: toModalFields(modal) })
    },

    async fetchReply() {
      if (state === 'NOT_ACKED') {
        throw new InteractionProtocolError('fetch-before-ack', 'fetchReply before the interaction was acknowledged')
      }
      return replyMessage()
    },
  }

  /**
   * A stubbed slow dependency calls this before doing its work. If the interaction
   * has not been acked yet, that is a structural late-ack — the handler is awaiting
   * I/O before telling Discord it is working — flagged even when the stub is fast.
   */
  const externalIO = (name: string) => {
    if (state === 'NOT_ACKED') {
      rec.note('io-before-ack', `${name} awaited before the interaction was acknowledged — defer/reply first`)
    }
  }

  const finish = (): MockInteractionResult => {
    if (state === 'DEFERRED' && !resolvedAfterDefer) {
      rec.note('unresolved-defer', 'deferReply was called but no editReply/followUp resolved it — the reply stays "thinking…" forever')
    }
    for (const m of rec.pendingModals) {
      if (!m.acked) {
        rec.note('unresolved-modal', `${m.source} was submitted but never acknowledged (reply/deferUpdate/update) — its "thinking…" state hangs`)
      }
    }
    return { responses: rec.responses, violations: rec.violations, ok: rec.violations.length === 0 }
  }

  /** Build a component interaction the driver can push through a collector. */
  const makeComponent = (step: InteractionStep) =>
    makeMockComponent(rec, {
      customId: step.customId,
      componentType: step.type === 'button' ? 'button' : 'stringSelect',
      values: step.values ?? [],
      userId,
      modalValues: step.modalValues,
      ackBudgetMs,
    })

  return {
    interaction,
    externalIO,
    finish,
    makeComponent,
    get state() { return state },
    get collectors() { return rec.collectors },
    get responses() { return rec.responses },
  }
}

interface MockComponentConfig {
  customId: string
  componentType: 'button' | 'stringSelect'
  values: string[]
  userId: string
  modalValues?: Record<string, string>
  ackBudgetMs: number
}

/**
 * A component interaction (button / string-select). It carries its own ack
 * lifecycle — a component must be acknowledged (deferUpdate / update / reply /
 * showModal) before it can be edited, and cannot be acked twice — and shares the
 * command's recorder so its responses join the one timeline.
 */
function makeMockComponent(rec: Recorder, config: MockComponentConfig) {
  const id = `harness-comp-${config.customId}-${rec.now()}`
  const source = `component:${config.customId}`
  let acked = false
  let shownModal: any = null

  const firstAck = (kind: CapturedResponse['kind']) => {
    if (acked) {
      throw new InteractionProtocolError('double-ack', `${kind} after the component was already acknowledged`)
    }
    acked = true
  }

  const component: any = {
    id,
    customId: config.customId,
    values: config.values,
    user: { id: config.userId, tag: 'harness#0000', username: 'harness' },
    message: { id: 'harness-message' },
    client: makeMockClient(),
    isButton: () => config.componentType === 'button',
    isStringSelectMenu: () => config.componentType === 'stringSelect',
    isChatInputCommand: () => false,
    get replied() { return acked },
    get deferred() { return acked },

    async deferUpdate() {
      firstAck('deferUpdate')
      rec.capture(source, { kind: 'deferUpdate', embeds: [], components: 0, controls: [], files: [] })
    },

    async update(payload: any) {
      firstAck('update')
      rec.capture(source, payloadToResponse('update', payload))
    },

    async reply(payload: any) {
      firstAck('reply')
      rec.capture(source, payloadToResponse('reply', payload))
    },

    async deferReply(opts?: { ephemeral?: boolean }) {
      firstAck('deferReply')
      rec.capture(source, { kind: 'deferReply', ephemeral: opts?.ephemeral, embeds: [], components: 0, controls: [], files: [] })
    },

    async editReply(payload: any) {
      if (!acked) {
        throw new InteractionProtocolError('edit-before-ack', `editReply on ${source} before it was acknowledged`)
      }
      rec.capture(source, payloadToResponse('editReply', payload))
      return { id: 'harness-message' }
    },

    async followUp(payload: any) {
      if (!acked) {
        throw new InteractionProtocolError('followup-before-ack', `followUp on ${source} before it was acknowledged`)
      }
      rec.capture(source, payloadToResponse('followUp', payload))
      return { id: 'harness-followup' }
    },

    async showModal(modal: any) {
      if (acked) {
        throw new InteractionProtocolError('modal-not-first', `showModal on ${source} after it was already acknowledged — a modal must be the first response`)
      }
      acked = true
      shownModal = modal
      rec.capture(source, { kind: 'showModal', embeds: [], components: 0, controls: [], files: [], modalTitle: readModalTitle(modal), modalFields: toModalFields(modal) })
    },

    async awaitModalSubmit(args: { filter?: (i: any) => boolean, time?: number }) {
      if (!shownModal) {
        throw new Error('awaitModalSubmit called without a preceding showModal')
      }
      const modalCustomId = readCustomId(shownModal) ?? `${config.customId}:modal`
      const submit = makeMockModalSubmit(rec, {
        customId: modalCustomId,
        userId: config.userId,
        values: config.modalValues ?? {},
      })
      // Model Discord's collector filter: a non-matching submit never resolves, so
      // the service's awaitModalSubmit rejects → showModalAndAwaitSubmit returns null.
      if (args?.filter && !args.filter(submit.interaction)) {
        throw new Error('modal submission did not pass the filter (would time out)')
      }
      rec.pendingModals.push(submit.pending)
      return submit.interaction
    },

    async fetchReply() {
      return { id: 'harness-message' }
    },
  }

  return { interaction: component, get acked() { return acked } }
}

interface MockModalSubmitConfig {
  customId: string
  userId: string
  values: Record<string, string>
}

/**
 * A modal-submit interaction. Field reads come from the supplied values; it has
 * its own ack lifecycle and is tracked so an unacknowledged submit (a hung
 * "thinking…" modal) is flagged at finish.
 */
function makeMockModalSubmit(rec: Recorder, config: MockModalSubmitConfig) {
  const source = `modal:${config.customId}`
  const pending = { source, acked: false }

  const getField = (fieldId: string): string => {
    const v = Object.prototype.hasOwnProperty.call(config.values, fieldId) ? config.values[fieldId] : undefined
    return v == null ? '' : String(v)
  }

  const firstAck = (kind: string) => {
    if (pending.acked) {
      throw new InteractionProtocolError('double-ack', `${kind} after ${source} was already acknowledged`)
    }
    pending.acked = true
  }

  const interaction: any = {
    id: `harness-modal-${config.customId}-${rec.now()}`,
    customId: config.customId,
    user: { id: config.userId, tag: 'harness#0000', username: 'harness' },
    client: makeMockClient(),
    isModalSubmit: () => true,
    get replied() { return pending.acked },
    get deferred() { return pending.acked },
    fields: {
      getTextInputValue: (fieldId: string) => getField(fieldId),
      getStringSelectValues: (fieldId: string) => {
        const raw = getField(fieldId)
        return raw === '' ? [] : raw.split(',').map(s => s.trim()).filter(Boolean)
      },
      getField: (fieldId: string) => ({ value: getField(fieldId) }),
    },

    async deferUpdate() {
      firstAck('deferUpdate')
      rec.capture(source, { kind: 'deferUpdate', embeds: [], components: 0, controls: [], files: [] })
    },
    async deferReply(opts?: { ephemeral?: boolean }) {
      firstAck('deferReply')
      rec.capture(source, { kind: 'deferReply', ephemeral: opts?.ephemeral, embeds: [], components: 0, controls: [], files: [] })
    },
    async reply(payload: any) {
      firstAck('reply')
      rec.capture(source, payloadToResponse('reply', payload))
    },
    async update(payload: any) {
      firstAck('update')
      rec.capture(source, payloadToResponse('update', payload))
    },
    async editReply(payload: any) {
      if (!pending.acked) {
        throw new InteractionProtocolError('edit-before-ack', `editReply on ${source} before it was acknowledged`)
      }
      rec.capture(source, payloadToResponse('editReply', payload))
      return { id: 'harness-message' }
    },
    async followUp(payload: any) {
      if (!pending.acked) {
        throw new InteractionProtocolError('followup-before-ack', `followUp on ${source} before it was acknowledged`)
      }
      rec.capture(source, payloadToResponse('followUp', payload))
      return { id: 'harness-followup' }
    },
    async fetchReply() {
      return { id: 'harness-message' }
    },
  }

  return { interaction, pending }
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

/**
 * A collector stub that never fires on its own; a driver pushes component
 * interactions through `emit`, awaiting each handler so its full flow (including
 * modal submit + refresh) completes before the next step.
 */
function makeMockCollector(): MockCollector {
  const handlers: Record<string, ((...a: unknown[]) => unknown)[]> = {}
  const collector: MockCollector = {
    on(event, cb) {
      (handlers[event] ??= []).push(cb)
      return collector
    },
    stop() {
      for (const cb of handlers.end ?? []) cb([], 'harness-stop')
    },
    async emit(componentInteraction) {
      for (const cb of handlers.collect ?? []) await cb(componentInteraction)
    },
    __emit(componentInteraction) {
      return collector.emit(componentInteraction)
    },
  }
  return collector
}
