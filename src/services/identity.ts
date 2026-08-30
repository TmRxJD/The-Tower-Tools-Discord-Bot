import { getCachedAppwriteUserIdForDiscord } from './discord-identity-resolver'

/**
 * Map-free canonical identity.
 *
 * The old env-map (`DISCORD_TO_APPWRITE_MAP`) is gone. Discord->Appwrite ids are
 * now resolved at runtime from Appwrite's OAuth identity records by
 * `resolveAppwriteUserIdForDiscord`, which the interaction entrypoints
 * (`core/interaction-router`, `core/command-pipeline`) call once per interaction
 * and cache. This synchronous accessor reads that cache for downstream service
 * code; a miss returns null, and every caller already treats null as "use the raw
 * Discord id".
 */
export function resolveCanonicalAppwriteUserId(discordUserId: string): string | null {
  return getCachedAppwriteUserIdForDiscord(discordUserId)
}
