import { diagnosticRef } from './operation-diagnostics';

type Lifecycle = { id: string; createdTimestamp: number; deferred: boolean; replied: boolean };
type Stage = 'dispatch' | 'acknowledge' | 'persist' | 'render' | 'edit-response' | 'modal-wait' | 'share' | 'close-response' | 'cleanup-build' | 'cleanup-edit' | 'reconcile';
type Request = { method: 'POST' | 'PATCH'; route: 'interaction-callback' | 'original-response'; payload?: unknown };
const actions = new Set(['category', 'uwType', 'lab', 'speedup', 'toggleHideMaxed', 'settings', 'range', 'close', 'share', 'cleanup', 'reconcile']);

function object(value: unknown): Record<string, any> {
  return value && typeof value === 'object' ? value as Record<string, any> : {};
}

/** Counts and lengths only; evaluated on failure, never serialized message contents or identifiers. */
function payloadShape(value: unknown): Record<string, unknown> {
  const payload = object(value);
  const rows = Array.isArray(payload.components) ? payload.components : [];
  const embeds = Array.isArray(payload.embeds) ? payload.embeds : [];
  let serializationFailed = false;
  const json = (item: unknown) => {
    try { const record = object(item); return object(typeof record.toJSON === 'function' ? record.toJSON() : record); }
    catch { serializationFailed = true; return {}; }
  };
  const componentRows = rows.slice(0, 10).map(row => {
    const data = json(row);
    const components = Array.isArray(data.components) ? data.components : [];
    return {
      count: components.length,
      components: components.slice(0, 5).map((component: unknown) => {
        const c = object(component);
        return { type: typeof c.type === 'number' ? c.type : null, disabled: c.disabled === true,
          customIdLength: typeof c.custom_id === 'string' ? c.custom_id.length : 0,
          optionCount: Array.isArray(c.options) ? c.options.length : 0 };
      }),
    };
  });
  return { rowCount: rows.length, rows: componentRows, embedCount: embeds.length,
    embedFieldCounts: embeds.slice(0, 10).map(embed => { const fields = json(embed).fields; return Array.isArray(fields) ? fields.length : 0; }),
    uploadCount: Array.isArray(payload.files) ? payload.files.length : 0,
    attachmentCount: Array.isArray(payload.attachments) ? payload.attachments.length : null, serializationFailed };
}

/** Per-task state prevents overlapping collectors/modal waits from sharing diagnostic stages. */
export class LabTaskDiagnostics {
  private current: Stage = 'dispatch';
  private request?: Request;
  private readonly durations: Partial<Record<Stage, number>> = {};
  private lifecycle: Lifecycle;
  private readonly sessionCorrelation: string;
  private readonly action: string;

  constructor(interaction: Lifecycle, action: string, sessionId: string) {
    this.lifecycle = interaction;
    this.sessionCorrelation = diagnosticRef(sessionId);
    this.action = actions.has(action) ? action : 'unknown';
  }
  interaction = (): Lifecycle => this.lifecycle;
  stage = (): Stage => this.current;
  useInteraction(interaction: Lifecycle): void { this.lifecycle = interaction; }
  async run<T>(stage: Stage, task: () => Promise<T>, request?: Request): Promise<T> {
    this.current = stage;
    this.request = request;
    const started = Date.now();
    try { return await task(); }
    finally { this.durations[stage] = (this.durations[stage] ?? 0) + Date.now() - started; }
  }
  details = (): Record<string, unknown> => ({
    operation: 'lab', action: this.action, sessionCorrelation: this.sessionCorrelation,
    stageDurationsMs: { ...this.durations },
    ...(this.request ? { request: { method: this.request.method, route: this.request.route },
      ...(this.request.payload ? { payload: payloadShape(this.request.payload) } : {}) } : {}),
  });
}
