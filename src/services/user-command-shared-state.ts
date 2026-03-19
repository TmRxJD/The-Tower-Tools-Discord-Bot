import { getAppConfig } from '../config';
import { logger } from '../core/logger';
import { getAppwriteClient } from './appwrite-client';
import { getToolsBotDb } from './idb';
import { resolveCloudUserIdCandidates } from './cloud-user-resolution';
import {
  buildSyncedStateReconcileResult,
  createCloudJsonBlobPayload,
  findFirstResolvedCloudDocument,
  isCloudNotFoundError,
  parseJsonWithSchema,
  parseIsoTimestampToMillis,
  saveSyncedToolState,
  sharedCommandStateBlobSchema,
  toObjectRecord,
} from '@tmrxjd/platform/tools';
import { syncCloudOutboxState } from './cloud-sync-outbox';

export type SharedCommandStateKey = 'bots' | 'module' | 'workshop' | 'stone' | 'chart' | 'thorns' | 'guardian';

type CollectionRoute = {
  primary: string;
};

type SharedCommandStateBlob = {
  settings?: Record<string, unknown>;
  [key: string]: unknown;
};

export type CloudStateDirection = 'cloud-newer' | 'local-newer' | 'unknown';

export type SharedCommandStateReconcileResult<T extends Record<string, unknown>> = {
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
  void userId;
  return true;
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
    state: toObjectRecord(row?.data) ?? null,
    updatedAt: Number.isFinite(Number(row?.updatedAt)) ? Number(row?.updatedAt) : null,
  };
}

async function saveLocalCommandState(userId: string, key: SharedCommandStateKey, state: Record<string, unknown>): Promise<void> {
  const database = getToolsBotDb();
  const recordId = localRecordId(key);

  await database.shardSplitterSettings.put({
    id: stableLocalId(userId, key),
    userId,
    collection: SHARED_COLLECTION,
    recordId,
    data: state,
    updatedAt: Date.now(),
  });
}

async function getCollectionDocumentOrNull(
  userId: string,
  collectionId: string,
): Promise<Record<string, unknown> | null> {
  const cfg = getAppConfig();
  if (!cfg.appwrite) {
    return null;
  }

  const client = getAppwriteClient();
  if (!client) {
    return null;
  }

  try {
    return await client.databases.getDocument(
      cfg.appwrite.cloudDatabaseId,
      collectionId,
      userId,
    ) as unknown as Record<string, unknown>;
  } catch (error) {
    if (isCloudNotFoundError(error)) {
      return null;
    }

    throw error;
  }
}

async function getCollectionDocumentWithId(
  userId: string,
  collectionId: string,
): Promise<{ documentId: string; document: Record<string, unknown> } | null> {
  const candidates = await resolveCloudUserIdCandidates(userId);
  return findFirstResolvedCloudDocument(candidates, candidate => getCollectionDocumentOrNull(candidate, collectionId));
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
        state: direct,
        updatedAt: parseIsoTimestampToMillis(doc.updatedAt ?? doc.$updatedAt),
      };
    }

    const nested = toObjectRecord(toObjectRecord(settings.commandSharedSettings)?.[key]);
    return {
      state: nested ?? null,
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
    const existingResolved = await getCollectionDocumentWithId(userId, route.primary);
    const existing = existingResolved?.document;
    const targetDocumentId = existingResolved?.documentId ?? candidates[0] ?? userId;

    const existingBlob = typeof existing?.data === 'string'
      ? (parseSharedCommandStateBlob(existing.data) ?? {})
      : {};

    const nextSettings = {
      ...(toObjectRecord(existingBlob.settings) ?? {}),
      [key]: state,
    };

    const nextBlob: SharedCommandStateBlob = {
      ...existingBlob,
      settings: nextSettings,
    };

    const payload = createCloudJsonBlobPayload(existing ?? null, nextBlob, nowIso);

    if (existing) {
      await client.databases.updateDocument(
        cfg.appwrite.cloudDatabaseId,
        route.primary,
        targetDocumentId,
        payload,
      );
      return true;
    }

    await client.databases.createDocument(
      cfg.appwrite.cloudDatabaseId,
      route.primary,
      targetDocumentId,
      payload,
    );
    return true;
  } catch (error) {
    logger.warn(`Failed saving ${key} command cloud state`, error);
    return false;
  }
}

export async function getUserCommandSharedState<T extends Record<string, unknown>>(
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

export async function reconcileUserCommandSharedState<T extends Record<string, unknown>>(
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
    saveLocal: async state => saveLocalCommandState(userId, key, state),
    queueCloudSync: async state => {
      await syncCloudOutboxState({
        userId,
        scope: getCommandScopeKey(key),
        payload: state as unknown as Record<string, unknown>,
        send: async payload => saveCloudCommandState(userId, key, payload),
      });
    },
  });
}

export async function saveUserCommandSharedState<T extends Record<string, unknown>>(
  userId: string,
  key: SharedCommandStateKey,
  state: T,
  normalize: (input: Record<string, unknown> | null) => T,
): Promise<void> {
  try {
    await saveSyncedToolState({
      state,
      normalize: input => normalize(input),
      saveLocal: async normalized => saveLocalCommandState(userId, key, normalized),
      isCloudSyncEnabled: async () => await shouldUseCloudSync(userId),
      queueCloudSync: async normalized => {
        await syncCloudOutboxState({
          userId,
          scope: getCommandScopeKey(key),
          payload: normalized as unknown as Record<string, unknown>,
          send: async payload => saveCloudCommandState(userId, key, payload),
        });
      },
    });
  } catch (error) {
    logger.warn(`Failed saving ${key} command shared state`, error);
  }
}
