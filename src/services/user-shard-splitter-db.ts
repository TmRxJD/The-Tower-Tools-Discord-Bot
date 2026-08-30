import {
  buildSyncedStateReconcileResult,
  buildDefaultShardSplitterSnapshot,
  normalizeShardSplitterSnapshot,
  saveSyncedToolState,
  stableEquals,
  SHARD_SPLITTER_SETTINGS_DEXIE_COLLECTION,
  SHARD_SPLITTER_SETTINGS_RECORD_ID,
  SHARD_SPLITTER_SETTINGS_LEGACY_RECORD_ID,
  type ShardSplitterSnapshot,
} from '@tmrxjd/platform/tools';
import { z } from 'zod';
import { getToolsBotDb } from './idb';
import { logger } from '../core/logger';
import {
  loadUserShardSplitterCloudState,
  saveUserShardSplitterCloudState,
} from './user-shard-splitter-cloud';
import { syncCloudOutboxState } from './cloud-sync-outbox';
import { getEffectiveUserSharedSettings } from './user-shared-settings-db';

const SHARD_SPLITTER_SCOPE = 'shard-splitter-state';

function makeShardSplitterRowId(userId: string): string {
  return `${userId}::${SHARD_SPLITTER_SETTINGS_LEGACY_RECORD_ID}`;
}

function makeStableShardSplitterRowId(userId: string): string {
  return userId;
}

export type UserShardSplitterState = {
  snapshot: ShardSplitterSnapshot;
  rawData: Record<string, unknown>;
};

const shardSplitterRawDataSchema = z.record(z.string(), z.unknown());

const userShardSplitterStateSchema = z.object({
  snapshot: z.record(z.string(), z.unknown()).transform(value => normalizeShardSplitterSnapshot(value)),
  rawData: shardSplitterRawDataSchema,
}).transform(({ snapshot, rawData }) => ({
  snapshot,
  rawData: {
    ...rawData,
    ...snapshot,
  },
}));

export type ShardSplitterReconcileResult = {
  autoCloudEnabled: boolean;
  hasDifference: boolean;
  direction: 'cloud-newer' | 'local-newer' | 'unknown';
  localUpdatedAt: number | null;
  cloudUpdatedAt: number | null;
  localState: UserShardSplitterState;
  cloudState: UserShardSplitterState | null;
  applyCloudToLocal: () => Promise<UserShardSplitterState | null>;
  applyLocalToCloud: () => Promise<void>;
};

async function isCloudSyncEnabledForUser(userId: string): Promise<boolean> {
  try {
    return (await getEffectiveUserSharedSettings(userId)).cloudSyncEnabled;
  } catch (error) {
    logger.warn('Failed to resolve shared settings for shard splitter sync gating', error);
    return false;
  }
}

function getDefaultUserShardSplitterState(): UserShardSplitterState {
  const snapshot = buildDefaultShardSplitterSnapshot();
  return {
    snapshot,
    rawData: { ...snapshot },
  };
}

function normalizeUserShardSplitterState(state: UserShardSplitterState | null | undefined): UserShardSplitterState {
  if (!state) {
    return getDefaultUserShardSplitterState();
  }

  return userShardSplitterStateSchema.parse(state);
}

async function loadLocalUserShardSplitterState(userId: string): Promise<{ state: UserShardSplitterState | null; updatedAt: number | null }> {
  const database = getToolsBotDb();
  const stableId = makeStableShardSplitterRowId(userId);
  const legacyId = makeShardSplitterRowId(userId);

  let row = await database.shardSplitterSettings.get(stableId);
  if (!row) {
    row = await database.shardSplitterSettings.get(legacyId);
  }

  if (!row) {
    row = await database.shardSplitterSettings.where('[userId+recordId]').equals([userId, SHARD_SPLITTER_SETTINGS_LEGACY_RECORD_ID]).first();
  }

  if (!row || !row.data || typeof row.data !== 'object') {
    return {
      state: null,
      updatedAt: null,
    };
  }

  const parsedState = userShardSplitterStateSchema.parse({
    snapshot: row.data,
    rawData: row.data as Record<string, unknown>,
  });

  if (row.id !== stableId) {
    await database.shardSplitterSettings.put({
      id: stableId,
      userId,
      collection: SHARD_SPLITTER_SETTINGS_DEXIE_COLLECTION,
      recordId: SHARD_SPLITTER_SETTINGS_RECORD_ID,
      data: parsedState.rawData,
      updatedAt: Date.now(),
    });
  }

  return {
    state: parsedState,
    updatedAt: Number.isFinite(Number(row.updatedAt)) ? Number(row.updatedAt) : null,
  };
}

async function saveLocalUserShardSplitterState(userId: string, state: UserShardSplitterState): Promise<void> {
  const database = getToolsBotDb();
  const normalizedState = normalizeUserShardSplitterState(state);

  await database.shardSplitterSettings.put({
    id: makeStableShardSplitterRowId(userId),
    userId,
    collection: SHARD_SPLITTER_SETTINGS_DEXIE_COLLECTION,
    recordId: SHARD_SPLITTER_SETTINGS_RECORD_ID,
    data: normalizedState.rawData,
    updatedAt: Date.now(),
  });
}

export async function getUserShardSplitterState(userId: string): Promise<UserShardSplitterState> {
  try {
    const local = await loadLocalUserShardSplitterState(userId);
    if (local.state) {
      return local.state;
    }

    return getDefaultUserShardSplitterState();
  } catch (error) {
    logger.warn('Failed to read shard splitter settings, using defaults', error);
    return getDefaultUserShardSplitterState();
  }
}

export async function saveUserShardSplitterState(userId: string, state: UserShardSplitterState): Promise<void> {
  try {
    await saveSyncedToolState({
      state,
      normalize: input => normalizeUserShardSplitterState(input),
      saveLocal: async normalized => saveLocalUserShardSplitterState(userId, normalized),
      isCloudSyncEnabled: async () => await isCloudSyncEnabledForUser(userId),
      queueCloudSync: async normalized => {
        await syncCloudOutboxState({
          userId,
          scope: SHARD_SPLITTER_SCOPE,
          payload: normalized as unknown as Record<string, unknown>,
          send: async payload => saveUserShardSplitterCloudState(userId, payload as unknown as UserShardSplitterState),
        });
      },
    });
  } catch (error) {
    logger.warn('Failed to save shard splitter settings', error);
  }
}

export async function reconcileUserShardSplitterState(userId: string): Promise<ShardSplitterReconcileResult> {
  let local = await loadLocalUserShardSplitterState(userId);
  const cloud = await loadUserShardSplitterCloudState(userId);
  const autoCloudEnabled = await isCloudSyncEnabledForUser(userId);

  if (autoCloudEnabled && local.updatedAt === null && cloud) {
    await saveLocalUserShardSplitterState(userId, cloud);
    local = {
      state: cloud,
      updatedAt: cloud.updatedAt ?? Date.now(),
    };
  }

  return buildSyncedStateReconcileResult({
    local,
    cloud: {
      state: cloud,
      updatedAt: cloud?.updatedAt ?? null,
    },
    autoCloudEnabled,
    normalize: input => normalizeUserShardSplitterState(input),
    saveLocal: async state => saveLocalUserShardSplitterState(userId, state),
    queueCloudSync: async state => {
      await syncCloudOutboxState({
        userId,
        scope: SHARD_SPLITTER_SCOPE,
        payload: state as unknown as Record<string, unknown>,
        send: async payload => saveUserShardSplitterCloudState(userId, payload as unknown as UserShardSplitterState),
      });
    },
    areEqual: (left, right) => stableEquals(left.snapshot, right.snapshot),
  });
}
