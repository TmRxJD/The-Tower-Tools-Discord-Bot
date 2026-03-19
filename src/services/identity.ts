const DISCORD_SNOWFLAKE_REGEX = /^\d{16,20}$/

function isLikelyDiscordSnowflake(value: string): boolean {
  return DISCORD_SNOWFLAKE_REGEX.test(value)
}

function isLikelyAppwriteId(value: string): boolean {
  const normalized = value.trim()
  if (!normalized) return false
  if (isLikelyDiscordSnowflake(normalized)) return false
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(normalized)
}

function parseDiscordToAppwriteMapFromRaw(raw: string): Record<string, string> {
  if (!raw || !raw.trim()) return {}

  const normalizedRaw = raw.trim()

  const tryJson = (): Record<string, string> => {
    try {
      const parsed = JSON.parse(normalizedRaw) as Record<string, unknown>
      const entries = Object.entries(parsed)
      const normalizedEntries = entries
        .map(([discordId, appwriteId]) => {
          if (typeof discordId !== 'string' || typeof appwriteId !== 'string') return null
          const discordKey = discordId.trim()
          const appwriteValue = appwriteId.trim()
          if (!discordKey || !appwriteValue) return null
          if (!isLikelyDiscordSnowflake(discordKey)) return null
          if (!isLikelyAppwriteId(appwriteValue)) return null
          return [discordKey, appwriteValue] as const
        })
        .filter((entry): entry is readonly [string, string] => Array.isArray(entry))

      return Object.fromEntries(normalizedEntries)
    } catch {
      return {}
    }
  }

  const fromJson = tryJson()
  if (Object.keys(fromJson).length > 0) {
    return fromJson
  }

  const entries = normalizedRaw
    .split(/[;,\n]/)
    .map(chunk => chunk.trim())
    .filter(Boolean)

  const pairs = entries
    .map(entry => {
      const separatorIndex = entry.indexOf(':') >= 0 ? entry.indexOf(':') : entry.indexOf('=')
      if (separatorIndex <= 0) return null

      const discordId = entry.slice(0, separatorIndex).trim()
      const appwriteId = entry.slice(separatorIndex + 1).trim()

      if (!isLikelyDiscordSnowflake(discordId)) return null
      if (!isLikelyAppwriteId(appwriteId)) return null

      return [discordId, appwriteId] as const
    })
    .filter((entry): entry is readonly [string, string] => Array.isArray(entry))

  return Object.fromEntries(pairs)
}

function parseDiscordToAppwriteMapFromEnv(): Record<string, string> {
  const raw = process.env.DISCORD_APPWRITE_USER_MAP_JSON
    ?? process.env.DISCORD_APPWRITE_USER_MAP
    ?? process.env.TOOLSBOT_DISCORD_APPWRITE_USER_MAP_JSON
    ?? process.env.TOOLSBOT_DISCORD_APPWRITE_USER_MAP
  if (!raw) return {}

  return parseDiscordToAppwriteMapFromRaw(raw)
}

const DISCORD_TO_APPWRITE_MAP = parseDiscordToAppwriteMapFromEnv()

export function resolveCanonicalAppwriteUserId(discordUserId: string): string | null {
  const normalized = discordUserId.trim()
  if (!normalized) return null

  if (!isLikelyDiscordSnowflake(normalized) && isLikelyAppwriteId(normalized)) {
    return normalized
  }

  const mapped = DISCORD_TO_APPWRITE_MAP[normalized]
  if (!mapped) {
    return isLikelyDiscordSnowflake(normalized) ? normalized : null
  }
  if (!isLikelyAppwriteId(mapped)) return null
  return mapped
}

export function hasCanonicalAppwriteIdentity(discordUserId: string): boolean {
  return Boolean(resolveCanonicalAppwriteUserId(discordUserId))
}
