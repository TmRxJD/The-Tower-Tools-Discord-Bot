import { getAppConfig } from '../config';
import { logger } from '../core/logger';
import { getAppwriteClient } from './appwrite-client';
import { getToolsBotDb } from './idb';
import { resolveCloudUserIdCandidates } from './cloud-user-resolution';
import {
  buildSyncedStateReconcileResult,
  normalizeSharedCommandState,
  parseJsonWithSchema,
  parseIsoTimestampToMillis,
  saveSyncedToolState,
  sharedCommandStateBlobSchema,
  toObjectRecord,
} from '@tmrxjd/platform/tools';
import { mutateCloudJsonBlobDocument, resolveDocumentByCandidates } from '@tmrxjd/platform/node';
import { syncCloudOutboxState } from './cloud-sync-outbox';
import { getEffectiveUserSharedSettings } from './user-shared-settings-db';

export type SharedCommandStateKey = 'bots' | 'module' | 'workshop' | 'stone' | 'chart' | 'thorns' | 'guardian';

type CollectionRoute = {
  primary: string;
};

type SharedCommandStateBlob = {
  settings?: Record<string, unknown>;
  [key: string]: unknown;
};

export type CloudStateDirection = 'cloud-newer' | 'local-newer' | 'unknown';

export type SharedCommandStateReconcileResult<T extends object> = {
  autoCloudEnabled: boolean;
  hasDifference: boolean;
  direction: CloudStateDirection;
  localUpdatedAt: number | null;
  cloudUpdatedAt: number | null;
  localState: T;
  cloudState: T | null;
  applyCloudToLocal: () => Promise<T | null>;
  applyLocalToCloud: () => Promise<void>;
};

function parseSharedCommandStateBlob(rawJson: string): SharedCommandStateBlob | null {
  return parseJsonWithSchema(sharedCommandStateBlobSchema, rawJson) as SharedCommandStateBlob | null;
}

const SHARED_COLLECTION = 'commandSharedSettings';

function getCollectionRoute(cfg: NonNullable<ReturnType<typeof getAppConfig>['appwrite']>, key: SharedCommandStateKey): CollectionRoute {
  if (key === 'bots') {
    return {
      primary: cfg.botsCollectionId,
    };
  }

  if (key === 'workshop') {
    return {
      primary: cfg.workshopCollectionId,
    };
  }

  if (key === 'chart') {
    return {
      primary: cfg.chartCollectionId,
    };
  }

  if (key === 'stone') {
    return {
      primary: cfg.stoneCollectionId,
    };
  }

  if (key === 'thorns') {
    return {
      primary: cfg.thornsCollectionId,
    };
  }

  if (key === 'guardian' || key === 'module') {
    return {
      primary: cfg.modulesCollectionId,
    };
  }

  return {
    primary: cfg.modulesCollectionId,
  };
}

function stableLocalId(userId: string, key: SharedCommandStateKey): string {
  return `${userId}::${SHARED_COLLECTION}:${key}`;
}

function localRecordId(key: SharedCommandStateKey): string {
  return `${SHARED_COLLECTION}:${key}`;
}

function getCommandScopeKey(key: SharedCommandStateKey): string {
  return `command-shared:${key}`;
}

async function shouldUseCloudSync(userId: string): Promise<boolean> {
  try {
    return (await getEffectiveUserSharedSettings(userId)).cloudSyncEnabled;
  } catch (error) {
    logger.warn(`Failed resolving shared settings for command shared state (${userId})`, error);
    return false;
  }
}

async function loadLocalCommandState(userId: string, key: SharedCommandStateKey): Promise<{ state: Record<string, unknown> | null; updatedAt: number | null }> {
  const database = getToolsBotDb();
  const recordId = localRecordId(key);
  const stableId = stableLocalId(userId, key);

  let row = await database.shardSplitterSettings.get(stableId);
  if (!row) {
    row = await database.shardSplitterSettings.where('[userId+recordId]').equals([userId, recordId]).first();
  }

  return {
    state: row?.data ? normalizeSharedCommandState(key, toObjectRecord(row.data)) as Record<string, unknown> : null,
    updatedAt: Number.isFinite(Number(row?.updatedAt)) ? Number(row?.updatedAt) : null,
  };
}

async function saveLocalCommandState(userId: string, key: SharedCommandStateKey, state: Record<string, unknown>): Promise<void> {
  const database = getToolsBotDb();
  const recordId = localRecordId(key);
  const normalizedState = normalizeSharedCommandState(key, state) as Record<string, unknown>;

  await database.shardSplitterSettings.put({
    id: stableLocalId(userId, key),
    userId,
    collection: SHARED_COLLECTION,
    recordId,
    data: normalizedState,
    updatedAt: Date.now(),
  });
}

async function getCollectionDocumentWithId(
  userId: string,
  collectionId: string,
): Promise<{ documentId: string; document: Record<string, unknown> } | null> {
  const cfg = getAppConfig();
  if (!cfg.appwrite) {
    return null;
  }

  const client = getAppwriteClient();
  if (!client) {
    return null;
  }

  const candidates = await resolveCloudUserIdCandidates(userId);
  return await resolveDocumentByCandidates({
    databases: client.databases,
    databaseId: cfg.appwrite.cloudDatabaseId,
    collectionId,
    candidateDocumentIds: candidates,
  });
}

async function loadCloudCommandState(userId: string, key: SharedCommandStateKey): Promise<{ state: Record<string, unknown> | null; updatedAt: number | null }> {
  try {
    const cfg = getAppConfig();
    if (!cfg.appwrite) {
      return {
        state: null,
        updatedAt: null,
      };
    }

    const route = getCollectionRoute(cfg.appwrite, key);
    const resolved = await getCollectionDocumentWithId(userId, route.primary);
    const doc = resolved?.document;
    if (!doc || typeof doc.data !== 'string') {
      return {
        state: null,
        updatedAt: null,
      };
    }

    const parsed = parseSharedCommandStateBlob(doc.data);
    const settings = toObjectRecord(parsed?.settings);
    if (!settings) {
      return {
        state: null,
        updatedAt: parseIsoTimestampToMillis(doc.updatedAt ?? doc.$updatedAt),
      };
    }

    const direct = toObjectRecord(settings[key]);
    if (direct) {
      return {
        state: normalizeSharedCommandState(key, direct) as Record<string, unknown>,
        updatedAt: parseIsoTimestampToMillis(doc.updatedAt ?? doc.$updatedAt),
      };
    }

    const nested = toObjectRecord(toObjectRecord(settings.commandSharedSettings)?.[key]);
    return {
      state: nested ? normalizeSharedCommandState(key, nested) as Record<string, unknown> : null,
      updatedAt: parseIsoTimestampToMillis(doc.updatedAt ?? doc.$updatedAt),
    };
  } catch (error) {
    logger.warn(`Failed loading ${key} command cloud state`, error);
    return {
      state: null,
      updatedAt: null,
    };
  }
}

async function saveCloudCommandState(userId: string, key: SharedCommandStateKey, state: Record<string, unknown>): Promise<boolean> {
  const cfg = getAppConfig();
  if (!cfg.appwrite) {
    return false;
  }

  const client = getAppwriteClient();
  if (!client) {
    return false;
  }

  try {
    const nowIso = new Date().toISOString();
    const route = getCollectionRoute(cfg.appwrite, key);
    const candidates = await resolveCloudUserIdCandidates(userId);
    const normalizedState = normalizeSharedCommandState(key, state) as Record<string, unknown>;

    await mutateCloudJsonBlobDocument({
      databases: client.databases,
      databaseId: cfg.appwrite.cloudDatabaseId,
      collectionId: route.primary,
      candidateDocumentIds: candidates,
      fallbackDocumentId: userId,
      nowIso,
      parseBlob: raw => (typeof raw === 'string' ? (parseSharedCommandStateBlob(raw) ?? {}) : null),
      mutate: existingBlob => {
        const nextSettings = {
          ...(toObjectRecord(existingBlob.settings) ?? {}),
          [key]: normalizedState,
        };

        const nextBlob: SharedCommandStateBlob = {
          ...existingBlob,
          settings: nextSettings,
        };

        return nextBlob;
      },
    });
    return true;
  } catch (error) {
    logger.warn(`Failed saving ${key} command cloud state`, error);
    return false;
  }
}

export async function getUserCommandSharedState<T extends object>(
  userId: string,
  key: SharedCommandStateKey,
  normalize: (input: Record<string, unknown> | null) => T,
): Promise<T> {
  try {
    const local = await loadLocalCommandState(userId, key);
    return normalize(local.state);
  } catch (error) {
    logger.warn(`Failed reading ${key} command shared state`, error);
    return normalize(null);
  }
}

export async function reconcileUserCommandSharedState<T extends object>(
  userId: string,
  key: SharedCommandStateKey,
  normalize: (input: Record<string, unknown> | null) => T,
): Promise<SharedCommandStateReconcileResult<T>> {
  let local = await loadLocalCommandState(userId, key);
  const cloud = await loadCloudCommandState(userId, key);
  const autoCloudEnabled = await shouldUseCloudSync(userId);

  if (autoCloudEnabled && local.updatedAt === null && cloud.state) {
    await saveLocalCommandState(userId, key, cloud.state);
    local = {
      state: cloud.state,
      updatedAt: cloud.updatedAt ?? Date.now(),
    };
  }

  const normalizedLocal = {
    state: normalize(local.state),
    updatedAt: local.updatedAt,
  };
  const normalizedCloud = {
    state: cloud.state ? normalize(cloud.state) : null,
    updatedAt: cloud.updatedAt,
  };

  return buildSyncedStateReconcileResult<T>({
    local: normalizedLocal,
    cloud: normalizedCloud,
    autoCloudEnabled,
    normalize: input => input ?? normalize(null),
    saveLocal: async state => saveLocalCommandState(userId, key, state as Record<string, unknown>),
    queueCloudSync: async state => {
      await syncCloudOutboxState({
        userId,
        scope: getCommandScopeKey(key),
        payload: state as Record<string, unknown>,
        send: async payload => saveCloudCommandState(userId, key, payload),
      });
    },
  });
}

export async function saveUserCommandSharedState<T extends object>(
  userId: string,
  key: SharedCommandStateKey,
  state: T,
  normalize: (input: Record<string, unknown> | null) => T,
): Promise<void> {
  try {
    await saveSyncedToolState({
      state,
      normalize: input => normalize(input as Record<string, unknown> | null),
      saveLocal: async normalized => saveLocalCommandState(userId, key, normalized as Record<string, unknown>),
      isCloudSyncEnabled: async () => await shouldUseCloudSync(userId),
      queueCloudSync: async normalized => {
        await syncCloudOutboxState({
          userId,
          scope: getCommandScopeKey(key),
          payload: normalized as Record<string, unknown>,
          send: async payload => saveCloudCommandState(userId, key, payload),
        });
      },
    });
  } catch (error) {
    logger.warn(`Failed saving ${key} command shared state`, error);
  }
}
