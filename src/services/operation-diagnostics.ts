import { createHash } from 'node:crypto';
import { discordValidationDiagnostics } from './discord-validation-diagnostics';

const stages = new WeakMap<object, { operation: string; stage: string }>();
const safeCodes = new Set(['CACHE_STALE', 'COL23', 'DB8', 'DB9', 'SQLITE_BUSY', 'SQLITE_LOCKED', 'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET', 'InteractionAlreadyReplied']);

export function diagnosticRef(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

/** Only structured codes and caller-owned stages: never error messages, URLs, data or tokens. */
export function failureDiagnostics(error: unknown): Record<string, unknown> {
  const record = error && typeof error === 'object' ? error as { code?: unknown; status?: unknown; cause?: unknown; rawError?: { errors?: unknown } } : {};
  const code = typeof record.code === 'number' || (typeof record.code === 'string' && safeCodes.has(record.code)) ? record.code : undefined;
  const cause = record.cause && typeof record.cause === 'object' ? record.cause as { code?: unknown } : {};
  const causeCode = typeof cause.code === 'string' && safeCodes.has(cause.code) ? cause.code : undefined;
  return { ...stages.get(record), code, causeCode, status: typeof record.status === 'number' ? record.status : undefined,
    ...(code === 50035 ? discordValidationDiagnostics(record.rawError?.errors) : {}) };
}

export async function atOperationStage<T>(operation: string, stage: string, action: () => Promise<T>): Promise<T> {
  try { return await action(); }
  catch (error) {
    if (error && typeof error === 'object' && !stages.has(error)) stages.set(error, { operation, stage });
    throw error;
  }
}
