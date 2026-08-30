import { Query, Users } from 'node-appwrite';
import {
  resolveTrackerDiscordAppwriteUserId,
  TrackerIdentityNotFoundError,
  TRACKER_IDENTITY_NOT_FOUND_CODE,
  type TrackerDiscordIdentityKvCache,
} from '@tmrxjd/platform/tools';
import { getAppwriteClient } from './appwrite-client';
import { getToolsBotKv, setToolsBotKv } from './idb';
import { logger } from '../core/logger';

export { TrackerIdentityNotFoundError, TRACKER_IDENTITY_NOT_FOUND_CODE };

const KV_PREFIX = 'toolsbot:discord-appwrite-id:v1:';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const runtimeCache = new Map<string, string | null>();

type CachedEntry = {
  appwriteId: string | null;
  cachedAt: number;
};

export async function resolveAppwriteUserIdForDiscord(
  discordUserId: string,
  options: { requireLinked?: boolean } = {},
): Promise<string | null> {
  const normalized = discordUserId.trim();
  const bundle = getAppwriteClient();

  return resolveTrackerDiscordAppwriteUserId({
    discordUserId: normalized,
    requireLinked: options.requireLinked,
    usersApi: bundle ? new Users(bundle.client) : null,
    identityQueries: [
      Query.equal('provider', 'discord'),
      Query.equal('providerUid', normalized),
    ],
    runtimeCache,
    kvCache: {
      read: async (discordId: string) => {
        const entry = await getToolsBotKv<CachedEntry>(`${KV_PREFIX}${discordId}`).catch(() => null);
        if (!entry) return undefined;
        if (Date.now() - entry.cachedAt > CACHE_TTL_MS) return undefined;
        return entry.appwriteId;
      },
      write: async (discordId: string, appwriteUserId: string | null) => {
        await setToolsBotKv(`${KV_PREFIX}${discordId}`, {
          appwriteId: appwriteUserId,
          cachedAt: Date.now(),
        } satisfies CachedEntry).catch(() => {});
      },
    } satisfies TrackerDiscordIdentityKvCache,
    onResolveFailed: ({ discordUserId: failedDiscordUserId, error }: { discordUserId: string; error: unknown }) => {
      logger.warn('[identity] failed to resolve Appwrite account for Discord user', {
        discordUserId: failedDiscordUserId,
        error,
      });
    },
  });
}

/**
 * Synchronous read of the already-resolved Discord->Appwrite id from the runtime
 * cache. The interaction entrypoints (interaction-router / command-pipeline) call
 * `resolveAppwriteUserIdForDiscord` once per interaction, so by the time downstream
 * sync code runs the id is cached. Returns null on a cache miss, which every caller
 * treats as "fall back to the raw Discord id".
 */
export function getCachedAppwriteUserIdForDiscord(discordUserId: string): string | null {
  return runtimeCache.get(discordUserId.trim()) ?? null;
}

export async function refreshAppwriteUserIdForDiscord(discordUserId: string): Promise<string | null> {
  runtimeCache.delete(discordUserId.trim());
  await setToolsBotKv(`${KV_PREFIX}${discordUserId.trim()}`, { appwriteId: null, cachedAt: 0 } satisfies CachedEntry).catch(() => {});
  return resolveAppwriteUserIdForDiscord(discordUserId);
}
