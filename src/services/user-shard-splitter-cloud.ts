import {
  normalizeShardSplitterSnapshot,
  type ShardSplitterSnapshot,
} from '@tmrxjd/platform/tools';
import { z } from 'zod';
import { getAppConfig } from '../config';
import { logger } from '../core/logger';
import { getAppwriteClient } from './appwrite-client';
import { resolveCloudUserIdCandidates } from './cloud-user-resolution';
import {
  parseCloudJsonBlob,
  parseIsoTimestampToMillis,
  toObjectRecord,
} from '@tmrxjd/platform/tools';
import { mutateCloudJsonBlobDocument, resolveDocumentByCandidates } from '@tmrxjd/platform/node';

export type CloudShardSplitterState = {
  snapshot: ShardSplitterSnapshot;
  rawData: Record<string, unknown>;
  updatedAt?: number | null;
};

type CloudModulesBlobState = {
  settings?: Record<string, unknown>;
  [key: string]: unknown;
};

const modulesDocumentSchema = z.object({
  data: z.string(),
  updatedAt: z.string().optional(),
  $updatedAt: z.string().optional(),
}).passthrough();

const shardRawDataSchema = z.record(z.string(), z.unknown());

const shardSplitterCloudStateSchema = z.object({
  snapshot: z.record(z.string(), z.unknown()).transform(value => normalizeShardSplitterSnapshot(value)),
  rawData: shardRawDataSchema,
  updatedAt: z.number().nullable().optional(),
}).transform(({ snapshot, rawData, updatedAt }) => ({
  snapshot,
  rawData: {
    ...rawData,
    ...snapshot,
  },
  updatedAt: updatedAt ?? null,
}));

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

async function getModulesDocumentWithId(userId: string): Promise<{ documentId: string; document: Record<string, unknown> } | null> {
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
    collectionId: cfg.appwrite.modulesCollectionId,
    candidateDocumentIds: candidates,
  });
}

export async function loadUserShardSplitterCloudState(userId: string): Promise<CloudShardSplitterState | null> {
  try {
    const resolved = await getModulesDocumentWithId(userId);
    const rawDoc = resolved?.document;
    if (!rawDoc || typeof rawDoc.data !== 'string') {
      return null;
    }
    const doc = modulesDocumentSchema.parse(rawDoc);

    const parsed = parseCloudJsonBlob(doc.data) as CloudModulesBlobState | null;
    if (!parsed) {
      return null;
    }
    const rawData = extractShardRawData(parsed);
    if (!rawData) {
      return null;
    }

    return shardSplitterCloudStateSchema.parse({
      snapshot: rawData,
      rawData: shardRawDataSchema.parse(rawData),
      updatedAt: parseIsoTimestampToMillis(doc.updatedAt ?? doc.$updatedAt),
    });
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
    const parsedState = shardSplitterCloudStateSchema.parse(state);
    const nowIso = new Date().toISOString();
    const candidates = await resolveCloudUserIdCandidates(userId);

    const mergedShardData: Record<string, unknown> = {
      ...parsedState.rawData,
      ...parsedState.snapshot,
    };

    await mutateCloudJsonBlobDocument({
      databases: client.databases,
      databaseId: cfg.appwrite.cloudDatabaseId,
      collectionId: cfg.appwrite.modulesCollectionId,
      candidateDocumentIds: candidates,
      fallbackDocumentId: userId,
      nowIso,
      mutate: existingBlob => {
        const nextSettings = {
          ...(toObjectRecord(existingBlob.settings) ?? {}),
          shardSplitter: mergedShardData,
        };

        const nextBlob: CloudModulesBlobState = {
          ...existingBlob,
          settings: nextSettings,
        };

        return nextBlob;
      },
    });
    return true;
  } catch (error) {
    logger.warn('Failed saving shard splitter cloud state', error);
    return false;
  }
}
