import {
  buildSyncedStateReconcileResult,
  createDefaultShardSplitterSnapshot,
  normalizeShardSplitterSnapshot,
  saveSyncedToolState,
  stableEquals,
  SHARD_SPLITTER_COLLECTION,
  SHARD_SPLITTER_RECORD_ID,
  type ShardSplitterSnapshot,
} from '@tmrxjd/platform/tools';
import { getToolsBotDb } from './idb';
import { logger } from '../core/logger';
import {
  loadUserShardSplitterCloudState,
  saveUserShardSplitterCloudState,
} from './user-shard-splitter-cloud';
import { syncCloudOutboxState } from './cloud-sync-outbox';

const SHARD_SPLITTER_SCOPE = 'shard-splitter-state';

function makeShardSplitterRowId(userId: string): string {
  return `${userId}::${SHARD_SPLITTER_RECORD_ID}`;
}

function makeStableShardSplitterRowId(userId: string): string {
  return userId;
}

export type UserShardSplitterState = {
  snapshot: ShardSplitterSnapshot;
  rawData: Record<string, unknown>;
};

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
  void userId;
  return true;
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
    row = await database.shardSplitterSettings.where('[userId+recordId]').equals([userId, SHARD_SPLITTER_RECORD_ID]).first();
  }

  if (!row || !row.data || typeof row.data !== 'object') {
    return {
      state: null,
      updatedAt: null,
    };
  }

  const rawData = row.data as Record<string, unknown>;
  const snapshot = normalizeShardSplitterSnapshot(rawData);

  if (row.id !== stableId) {
    await database.shardSplitterSettings.put({
      id: stableId,
      userId,
      collection: SHARD_SPLITTER_COLLECTION,
      recordId: SHARD_SPLITTER_RECORD_ID,
      data: {
        ...rawData,
        ...snapshot,
      },
      updatedAt: Date.now(),
    });
  }

  return {
    state: {
      snapshot,
      rawData,
    },
    updatedAt: Number.isFinite(Number(row.updatedAt)) ? Number(row.updatedAt) : null,
  };
}

async function saveLocalUserShardSplitterState(userId: string, state: UserShardSplitterState): Promise<void> {
  const database = getToolsBotDb();
  const merged = {
    ...state.rawData,
    ...state.snapshot,
  };

  await database.shardSplitterSettings.put({
    id: makeStableShardSplitterRowId(userId),
    userId,
    collection: SHARD_SPLITTER_COLLECTION,
    recordId: SHARD_SPLITTER_RECORD_ID,
    data: merged,
    updatedAt: Date.now(),
  });
}

export async function getUserShardSplitterState(userId: string): Promise<UserShardSplitterState> {
  try {
    const local = await loadLocalUserShardSplitterState(userId);
    if (local.state) {
      return local.state;
    }

    const snapshot = createDefaultShardSplitterSnapshot();
    return {
      snapshot,
      rawData: { ...snapshot },
    };
  } catch (error) {
    logger.warn('Failed to read shard splitter settings, using defaults', error);
    const snapshot = createDefaultShardSplitterSnapshot();
    return {
      snapshot,
      rawData: { ...snapshot },
    };
  }
}

export async function saveUserShardSplitterState(userId: string, state: UserShardSplitterState): Promise<void> {
  try {
    await saveSyncedToolState({
      state,
      normalize: input => input,
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

  const defaultSnapshot = createDefaultShardSplitterSnapshot();

  return buildSyncedStateReconcileResult({
    local,
    cloud: {
      state: cloud,
      updatedAt: cloud?.updatedAt ?? null,
    },
    autoCloudEnabled,
    normalize: input => input ?? {
      snapshot: defaultSnapshot,
      rawData: { ...defaultSnapshot },
    },
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
