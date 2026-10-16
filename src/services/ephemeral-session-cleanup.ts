// Discord interaction tokens expire 15 minutes after interaction creation, not collector creation.
const TOKEN_LIFETIME_MS = 15 * 60_000;
const CLEANUP_HEADROOM_MS = 30_000;

export function ephemeralCollectorTimeout(createdTimestamp: number, requestedMs: number, now = Date.now()): number {
  if (!Number.isFinite(createdTimestamp) || !Number.isFinite(requestedMs) || requestedMs <= 0) return 0;
  return Math.max(0, Math.min(requestedMs, createdTimestamp + TOKEN_LIFETIME_MS - CLEANUP_HEADROOM_MS - now));
}

/** Best-effort cleanup only; never retry an expired response or fall back to a public message. */
export async function cleanupEphemeralSession(createdTimestamp: number, edit: () => Promise<unknown>, now = Date.now()): Promise<'edited' | 'expired' | 'unavailable'> {
  if (!Number.isFinite(createdTimestamp) || now >= createdTimestamp + TOKEN_LIFETIME_MS) return 'expired';
  try { await edit(); return 'edited'; }
  catch (error) {
    const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
    if (code === 50027 || code === 10015 || code === 10008) return 'unavailable';
    throw error;
  }
}
