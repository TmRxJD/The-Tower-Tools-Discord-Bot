import { Query } from 'node-appwrite';
import { getAppwriteClient } from './appwrite-client';
import { getAppConfig } from '../config';
import { resolveCanonicalAppwriteUserId } from './identity';
import { resolveAppwriteUserIdForDiscord } from './discord-identity-resolver';
import { logger } from '../core/logger';

const DISCORD_SNOWFLAKE_REGEX = /^\d{16,20}$/;
const CACHE_TTL_MS = 5 * 60 * 1000;

type CloudUserResolutionContext = {
  username?: string;
  usernameCandidates?: string[];
};

type CacheEntry = {
  expiresAt: number;
  candidates: string[];
};

const userIdCandidateCache = new Map<string, CacheEntry>();

function isDiscordSnowflake(value: string): boolean {
  return DISCORD_SNOWFLAKE_REGEX.test(value);
}

function isLikelyAppwriteId(value: string): boolean {
  const normalized = value.trim();
  if (!normalized) return false;
  if (isDiscordSnowflake(normalized)) return false;
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(normalized);
}

function uniqueOrdered(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => typeof value === 'string' && value.trim().length > 0).map(value => value.trim())));
}

function buildUsernameCandidates(context: CloudUserResolutionContext): string[] {
  return uniqueOrdered([context.username, ...(Array.isArray(context.usernameCandidates) ? context.usernameCandidates : [])]);
}

async function findBotUsernameByDiscordId(discordUserId: string): Promise<string | null> {
  const cfg = getAppConfig();
  if (!cfg.appwrite) return null;

  const client = getAppwriteClient();
  if (!client) return null;

  try {
    const botDatabaseId = process.env.APPWRITE_DATABASE_ID?.trim() || 'run-tracker-bot';
    const botUserSettingsCollectionId = process.env.APPWRITE_USER_SETTINGS_COLLECTION_ID?.trim() || 'user_settings';

    const response = await client.databases.listDocuments(
      botDatabaseId,
      botUserSettingsCollectionId,
      [Query.equal('userId', discordUserId), Query.limit(1)],
    );

    const doc = response.documents?.[0] as Record<string, unknown> | undefined;
    const username = typeof doc?.username === 'string' ? doc.username.trim() : '';
    return username || null;
  } catch (error) {
    logger.warn('Failed to resolve bot username from discord ID', error);
    return null;
  }
}

async function findAppwriteIdsByUsernameInSettings(username: string): Promise<string[]> {
  const cfg = getAppConfig();
  if (!cfg.appwrite) return [];

  const client = getAppwriteClient();
  if (!client) return [];

  try {
    const response = await client.databases.listDocuments(
      cfg.appwrite.settingsDatabaseId,
      cfg.appwrite.settingsCollectionId,
      [Query.equal('username', username), Query.orderDesc('$updatedAt'), Query.limit(10)],
    );

    const ids = (Array.isArray(response.documents) ? response.documents : [])
      .map(doc => (doc as { $id?: unknown }).$id)
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .map(value => value.trim());

    return uniqueOrdered(ids);
  } catch (error) {
    logger.warn('Failed to resolve Appwrite IDs from run-tracker-data settings username lookup', { username, error });
    return [];
  }
}

async function findAppwriteIdsByUsernameInLegacyLabs(username: string): Promise<string[]> {
  const client = getAppwriteClient();
  if (!client) return [];

  try {
    const response = await client.databases.listDocuments(
      'labs-data',
      'lab-settings',
      [Query.equal('username', username), Query.orderDesc('$updatedAt'), Query.limit(10)],
    );

    const ids = (Array.isArray(response.documents) ? response.documents : [])
      .map(doc => (doc as { userId?: unknown }).userId)
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .map(value => value.trim());

    return uniqueOrdered(ids);
  } catch (error) {
    logger.warn('Failed to resolve Appwrite IDs from legacy labs-data username lookup', { username, error });
    return [];
  }
}

export async function resolveCloudUserIdCandidates(
  userId: string,
  context: CloudUserResolutionContext = {},
): Promise<string[]> {
  const normalized = userId.trim();
  if (!normalized) return [];

  const cached = userIdCandidateCache.get(normalized);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.candidates;
  }

  const canonical = resolveCanonicalAppwriteUserId(normalized);
  const authoritative = await resolveAppwriteUserIdForDiscord(normalized).catch(() => null);
  const baseCandidates = uniqueOrdered([authoritative, canonical, normalized]);

  let usernames = buildUsernameCandidates(context);
  if (usernames.length === 0 && isDiscordSnowflake(normalized)) {
    const username = await findBotUsernameByDiscordId(normalized);
    if (username) {
      usernames = [username];
    }
  }

  const discoveredIds: string[] = [];
  for (const username of usernames) {
    const [settingsIds, legacyIds] = await Promise.all([
      findAppwriteIdsByUsernameInSettings(username),
      findAppwriteIdsByUsernameInLegacyLabs(username),
    ]);
    discoveredIds.push(...settingsIds, ...legacyIds);
  }

  const candidates = uniqueOrdered([...discoveredIds, ...baseCandidates]);
  const filtered = uniqueOrdered([
    ...candidates.filter(candidate => isLikelyAppwriteId(candidate)),
    ...candidates,
  ]);

  userIdCandidateCache.set(normalized, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    candidates: filtered,
  });

  return filtered;
}
