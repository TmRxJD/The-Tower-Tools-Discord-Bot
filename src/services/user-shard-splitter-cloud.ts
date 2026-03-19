import {
  normalizeShardSplitterSnapshot,
  type ShardSplitterSnapshot,
} from '@tmrxjd/platform/tools';
import { getAppConfig } from '../config';
import { logger } from '../core/logger';
import { getAppwriteClient } from './appwrite-client';
import { resolveCloudUserIdCandidates } from './cloud-user-resolution';
import {
  createCloudJsonBlobPayload,
  findFirstResolvedCloudDocument,
  isCloudNotFoundError,
  parseCloudJsonBlob,
  parseIsoTimestampToMillis,
  toObjectRecord,
} from '@tmrxjd/platform/tools';

export type CloudShardSplitterState = {
  snapshot: ShardSplitterSnapshot;
  rawData: Record<string, unknown>;
  updatedAt?: number | null;
};

type CloudModulesBlobState = {
  settings?: Record<string, unknown>;
  [key: string]: unknown;
};

function extractShardRawData(blob: CloudModulesBlobState): Record<string, unknown> | null {
  const settings = toObjectRecord(blob.settings);
  if (!settings) {
    return null;
  }

  const shardData = toObjectRecord(settings.shardSplitter);
  if (shardData) {
    return shardData;
  }

  const legacyShardData = toObjectRecord(settings.shard_splitter);
  if (legacyShardData) {
    return legacyShardData;
  }

  return null;
}

async function getModulesDocumentOrNull(userId: string): Promise<Record<string, unknown> | null> {
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
      cfg.appwrite.modulesCollectionId,
      userId,
    ) as unknown as Record<string, unknown>;
  } catch (error) {
    if (isCloudNotFoundError(error)) {
      return null;
    }

    throw error;
  }
}

async function getModulesDocumentWithId(userId: string): Promise<{ documentId: string; document: Record<string, unknown> } | null> {
  const candidates = await resolveCloudUserIdCandidates(userId);
  return findFirstResolvedCloudDocument(candidates, candidate => getModulesDocumentOrNull(candidate));
}

export async function loadUserShardSplitterCloudState(userId: string): Promise<CloudShardSplitterState | null> {
  try {
    const resolved = await getModulesDocumentWithId(userId);
    const doc = resolved?.document;
    if (!doc || typeof doc.data !== 'string') {
      return null;
    }

    const parsed = parseCloudJsonBlob(doc.data) as CloudModulesBlobState | null;
    if (!parsed) {
      return null;
    }
    const rawData = extractShardRawData(parsed);
    if (!rawData) {
      return null;
    }

    const snapshot = normalizeShardSplitterSnapshot(rawData);
    return {
      snapshot,
      rawData,
      updatedAt: parseIsoTimestampToMillis(doc.updatedAt ?? doc.$updatedAt),
    };
  } catch (error) {
    logger.warn('Failed loading shard splitter cloud state', error);
    return null;
  }
}

export async function saveUserShardSplitterCloudState(userId: string, state: CloudShardSplitterState): Promise<boolean> {
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
    const candidates = await resolveCloudUserIdCandidates(userId);
    const existingResolved = await getModulesDocumentWithId(userId);
    const existing = existingResolved?.document;
    const targetDocumentId = existingResolved?.documentId ?? candidates[0] ?? userId;

    const mergedShardData: Record<string, unknown> = {
      ...state.rawData,
      ...state.snapshot,
    };

    const existingBlob = (parseCloudJsonBlob(existing?.data) as CloudModulesBlobState | null) ?? {};

    const nextSettings = {
      ...(toObjectRecord(existingBlob.settings) ?? {}),
      shardSplitter: mergedShardData,
    };

    const nextBlob: CloudModulesBlobState = {
      ...existingBlob,
      settings: nextSettings,
    };

    const payload = createCloudJsonBlobPayload(existing ?? null, nextBlob, nowIso);

    if (existing) {
      await client.databases.updateDocument(
        cfg.appwrite.cloudDatabaseId,
        cfg.appwrite.modulesCollectionId,
        targetDocumentId,
        payload,
      );
      return true;
    }

    await client.databases.createDocument(
      cfg.appwrite.cloudDatabaseId,
      cfg.appwrite.modulesCollectionId,
      targetDocumentId,
      payload,
    );
    return true;
  } catch (error) {
    logger.warn('Failed saving shard splitter cloud state', error);
    return false;
  }
}
