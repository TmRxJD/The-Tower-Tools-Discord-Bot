import {
  hasCanonicalAppwriteIdentity as hasCanonicalAppwriteIdentityBase,
  parseDiscordToAppwriteMapFromEnv,
  resolveCanonicalAppwriteUserId as resolveCanonicalAppwriteUserIdBase,
} from '@tmrxjd/platform/tools'

const DISCORD_TO_APPWRITE_MAP = parseDiscordToAppwriteMapFromEnv(process.env)

export function resolveCanonicalAppwriteUserId(discordUserId: string): string | null {
  return resolveCanonicalAppwriteUserIdBase(discordUserId, DISCORD_TO_APPWRITE_MAP)
}

export function hasCanonicalAppwriteIdentity(discordUserId: string): boolean {
  return hasCanonicalAppwriteIdentityBase(discordUserId, DISCORD_TO_APPWRITE_MAP)
}
