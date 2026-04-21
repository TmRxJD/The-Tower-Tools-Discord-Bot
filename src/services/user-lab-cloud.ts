import { getAppConfig } from '../config';
import { logger } from '../core/logger';
import { getAppwriteClient } from './appwrite-client';
import { z } from 'zod';
import { resolveCanonicalAppwriteUserId } from './identity';
import { Query } from 'node-appwrite';
import { resolveCloudUserIdCandidates } from './cloud-user-resolution';
import { mutateCloudJsonBlobDocument, resolveDocumentByCandidates } from '@tmrxjd/platform/node';
import {
  buildLabLevelRangesFromProgressRecords,
  defaultUserLabSettings,
  normalizeUserLabSettings,
  parseIsoTimestampToMillis,
  toObjectRecord,
  userLabSettingsSchema,
  type UserLabSettings,
} from '@tmrxjd/platform/tools';

const DEFAULT_LAB_SETTINGS: UserLabSettings = {
  ...defaultUserLabSettings,
  labLevels: {},
};

type LabBlobRecord = {
  labName?: string;
  currentLevel?: number;
  rangeStart?: number;
  rangeTarget?: number;
  [key: string]: unknown;
};

type LabBlobState = {
  progress?: {
    records?: LabBlobRecord[];
  };
  settings?: {
    labs?: {
      labSpeed?: number;
      labRelic?: number;
      labDiscount?: number;
      speedUp?: number;
      [key: string]: unknown;
    };
    ui?: Record<string, unknown>;
  };
  [key: string]: unknown;
};

type LabCloudContext = {
  username?: string;
  usernameCandidates?: string[];
};

export type LabCloudLoadResult = {
  settings: UserLabSettings;
  updatedAt: number | null;
};

const LEGACY_LABS_DATABASE_ID = 'labs-data';
const LEGACY_LAB_SETTINGS_COLLECTION_ID = 'lab-settings';
const LEGACY_LAB_PROGRESS_COLLECTION_ID = 'lab-progress';

type LegacyLabSettingsDocument = {
  userId?: string;
  labSpeed?: number | null;
  labRelic?: number | null;
  labDiscount?: number | null;
  speedUp?: number | null;
};

type LegacyLabProgressDocument = {
  userId?: string;
  labName?: string;
  currentLevel?: number | null;
  rangeStart?: number | null;
  rangeTarget?: number | null;
};

function normalizeLabProgressRecords(
  records: Array<{
    labName?: string;
    currentLevel?: number | null;
    rangeStart?: number | null;
    rangeTarget?: number | null;
  }> | null | undefined,
): Array<{ labName: string; currentLevel?: number; rangeStart?: number; rangeTarget?: number }> {
  if (!Array.isArray(records)) {
    return [];
  }

  return records
    .filter((record): record is NonNullable<typeof record> => !!record && typeof record.labName === 'string' && record.labName.trim().length > 0)
    .map(record => ({
      labName: record.labName!.trim(),
      ...(typeof record.currentLevel === 'number' ? { currentLevel: record.currentLevel } : {}),
      ...(typeof record.rangeStart === 'number' ? { rangeStart: record.rangeStart } : {}),
      ...(typeof record.rangeTarget === 'number' ? { rangeTarget: record.rangeTarget } : {}),
    }));
}

const labsDocumentSchema = z.object({
  data: z.string(),
  version: z.number().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  $updatedAt: z.string().optional(),
}).passthrough();

const labBlobRecordSchema = z.object({
  labName: z.string().optional(),
  currentLevel: z.number().optional(),
  rangeStart: z.number().optional(),
  rangeTarget: z.number().optional(),
}).passthrough();

const labBlobSchema = z.object({
  progress: z.object({
    records: z.array(labBlobRecordSchema).optional(),
  }).optional(),
  settings: z.object({
    labs: z.object({
      labSpeed: z.number().optional(),
      labRelic: z.number().optional(),
      labDiscount: z.number().optional(),
      speedUp: z.number().optional(),
    }).passthrough().optional(),
    ui: z.record(z.string(), z.unknown()).optional(),
  }).passthrough().optional(),
}).passthrough();

function normalizeLocalLabSettings(input: Partial<UserLabSettings>): UserLabSettings {
  return normalizeUserLabSettings({
    ...DEFAULT_LAB_SETTINGS,
    ...input,
    labLevels: input.labLevels ?? {},
  });
}

function scoreLabSettings(settings: UserLabSettings | null): number {
  if (!settings) return -1;

  let score = 0;
  score += Math.min(100, Object.keys(settings.labLevels ?? {}).length * 5);
  score += settings.labSpeed > 0 ? 10 : 0;
  score += settings.labRelic > 0 ? 10 : 0;
  score += settings.labDiscount > 0 ? 10 : 0;
  score += settings.speedUp > 1 ? 5 : 0;
  score += settings.hideMaxedLabs === false ? 3 : 0;

  return score;
}

function pickRicherLabSettings(primary: UserLabSettings | null, secondary: UserLabSettings | null): UserLabSettings | null {
  const primaryScore = scoreLabSettings(primary);
  const secondaryScore = scoreLabSettings(secondary);

  if (secondaryScore > primaryScore) {
    return secondary;
  }

  return primary;
}

function getLabDocumentIdCandidatesSyncFallback(userId: string): string[] {
  const normalized = userId.trim();
  if (!normalized) return [];

  const canonical = resolveCanonicalAppwriteUserId(normalized);
  if (canonical && canonical !== normalized) {
    return [canonical, normalized];
  }

  return [normalized];
}

function buildLabDocumentCandidates(
  userId: string,
  candidates: readonly string[],
  discoveredAppwriteUserId?: string | null,
): string[] {
  return Array.from(new Set([
    ...(discoveredAppwriteUserId ? [discoveredAppwriteUserId] : []),
    ...candidates,
    ...getLabDocumentIdCandidatesSyncFallback(userId),
  ].map(value => value.trim()).filter(Boolean)));
}

async function getLabsDocumentWithId(
  userId: string,
  context: LabCloudContext = {},
  discoveredAppwriteUserId?: string | null,
): Promise<{ documentId: string; document: Record<string, unknown> } | null> {
  const cfg = getAppConfig();
  if (!cfg.appwrite) {
    return null;
  }

  const client = getAppwriteClient();
  if (!client) {
    return null;
  }

  const candidates = await resolveCloudUserIdCandidates(userId, context);
  return await resolveDocumentByCandidates({
    databases: client.databases,
    databaseId: cfg.appwrite.cloudDatabaseId,
    collectionId: cfg.appwrite.labsCollectionId,
    candidateDocumentIds: buildLabDocumentCandidates(userId, candidates, discoveredAppwriteUserId),
  });
}

async function discoverAppwriteUserIdByUsername(username?: string): Promise<string | null> {
  const normalizedUsername = typeof username === 'string' ? username.trim() : '';
  if (!normalizedUsername) {
    return null;
  }

  const cfg = getAppConfig();
  if (!cfg.appwrite) {
    return null;
  }

  const client = getAppwriteClient();
  if (!client) {
    return null;
  }

  try {
    const response = await client.databases.listDocuments(
      cfg.appwrite.settingsDatabaseId,
      cfg.appwrite.settingsCollectionId,
      [Query.equal('username', normalizedUsername), Query.limit(2)],
    );

    if (!Array.isArray(response.documents) || response.documents.length !== 1) {
      return null;
    }

    const candidate = response.documents[0]?.$id;
    return typeof candidate === 'string' && candidate.trim().length > 0 ? candidate : null;
  } catch (error) {
    logger.warn('Failed discovering Appwrite user ID from username for lab cloud load', error);
    return null;
  }
}

function getUsernameCandidates(context: LabCloudContext): string[] {
  const candidates = [
    context.username,
    ...(Array.isArray(context.usernameCandidates) ? context.usernameCandidates : []),
  ]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map(value => value.trim());

  return Array.from(new Set(candidates));
}

async function discoverAppwriteUserIdFromLegacyLabs(usernameCandidates: string[]): Promise<string | null> {
  if (usernameCandidates.length === 0) {
    return null;
  }

  const cfg = getAppConfig();
  if (!cfg.appwrite) {
    return null;
  }

  const client = getAppwriteClient();
  if (!client) {
    return null;
  }

  for (const username of usernameCandidates) {
    try {
      const response = await client.databases.listDocuments(
        LEGACY_LABS_DATABASE_ID,
        LEGACY_LAB_SETTINGS_COLLECTION_ID,
        [Query.equal('username', username), Query.orderDesc('$updatedAt'), Query.limit(5)],
      );

      const docs = Array.isArray(response.documents) ? response.documents as Array<Record<string, unknown>> : [];
      const userIds = docs
        .map(doc => doc.userId)
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        .map(value => value.trim());

      if (userIds.length > 0) {
        return userIds[0];
      }
    } catch (error) {
      logger.warn('Failed discovering Appwrite user ID from legacy labs-data username', { username, error });
    }
  }

  return null;
}

async function resolveDiscoveredAppwriteUserId(context: LabCloudContext): Promise<string | null> {
  const usernameCandidates = getUsernameCandidates(context);
  const fromLegacy = await discoverAppwriteUserIdFromLegacyLabs(usernameCandidates);
  if (fromLegacy) {
    return fromLegacy;
  }

  for (const username of usernameCandidates) {
    const fromSettings = await discoverAppwriteUserIdByUsername(username);
    if (fromSettings) {
      return fromSettings;
    }
  }

  return null;
}

async function loadLegacyLabStateByUserId(userId: string): Promise<LabCloudLoadResult | null> {
  const cfg = getAppConfig();
  if (!cfg.appwrite) {
    return null;
  }

  const client = getAppwriteClient();
  if (!client) {
    return null;
  }

  try {
    const [settingsPage, progressPage] = await Promise.all([
      client.databases.listDocuments(
        LEGACY_LABS_DATABASE_ID,
        LEGACY_LAB_SETTINGS_COLLECTION_ID,
        [Query.equal('userId', userId), Query.limit(1)],
      ),
      client.databases.listDocuments(
        LEGACY_LABS_DATABASE_ID,
        LEGACY_LAB_PROGRESS_COLLECTION_ID,
        [Query.equal('userId', userId), Query.limit(5000)],
      ),
    ]);

    const settingsDoc = (settingsPage.documents?.[0] ?? null) as LegacyLabSettingsDocument | null;
    const progressDocs = (Array.isArray(progressPage.documents) ? progressPage.documents : []) as LegacyLabProgressDocument[];

    if (!settingsDoc && progressDocs.length === 0) {
      return null;
    }

    const labLevels = buildLabLevelRangesFromProgressRecords(normalizeLabProgressRecords(progressDocs));

    return {
      settings: normalizeLocalLabSettings({
        labSpeed: Number(settingsDoc?.labSpeed ?? 0),
        labRelic: Number(settingsDoc?.labRelic ?? 0),
        labDiscount: Number(settingsDoc?.labDiscount ?? 0),
        speedUp: Number(settingsDoc?.speedUp ?? 1),
        hideMaxedLabs: true,
        labLevels,
      }),
      updatedAt: parseIsoTimestampToMillis((settingsDoc as Record<string, unknown> | null)?.$updatedAt),
    };
  } catch (error) {
    logger.warn('Failed loading legacy labs-data cloud state', error);
    return null;
  }
}

async function loadLegacyLabStateWithFallbacks(userId: string, context: LabCloudContext): Promise<LabCloudLoadResult | null> {
  const candidates = await resolveCloudUserIdCandidates(userId, context);
  for (const candidate of candidates) {
    const legacy = await loadLegacyLabStateByUserId(candidate);
    if (legacy) {
      return legacy;
    }
  }

  const discoveredAppwriteUserId = await discoverAppwriteUserIdByUsername(context.username);
  if (discoveredAppwriteUserId) {
    return await loadLegacyLabStateByUserId(discoveredAppwriteUserId);
  }

  return null;
}

export async function loadUserLabSettingsCloud(userId: string, context: LabCloudContext = {}): Promise<LabCloudLoadResult | null> {
  try {
    const legacy = await loadLegacyLabStateWithFallbacks(userId, context);
    const discoveredAppwriteUserId = await resolveDiscoveredAppwriteUserId(context);

    const resolvedDoc = await getLabsDocumentWithId(userId, context, discoveredAppwriteUserId);

    const rawDoc = resolvedDoc?.document;
    if (!rawDoc || typeof rawDoc.data !== 'string') {
      return legacy;
    }
    const doc = labsDocumentSchema.parse(rawDoc);

    const blob = labBlobSchema.parse(JSON.parse(doc.data));
    const records = Array.isArray(blob.progress?.records) ? blob.progress?.records : [];

    const labLevels = buildLabLevelRangesFromProgressRecords(normalizeLabProgressRecords(records));

    const labsSettings = blob.settings?.labs ?? {};
    const ui = toObjectRecord(blob.settings?.ui) ?? {};

    const trackerLabs = userLabSettingsSchema.parse(normalizeLocalLabSettings({
      labSpeed: Number(labsSettings.labSpeed ?? 0),
      labRelic: Number(labsSettings.labRelic ?? 0),
      labDiscount: Number(labsSettings.labDiscount ?? 0),
      speedUp: Number(labsSettings.speedUp ?? 1),
      hideMaxedLabs: ui.toolsBotHideMaxedLabs !== false,
      labLevels,
    }));

    return {
      settings: pickRicherLabSettings(trackerLabs, legacy?.settings ?? null) ?? DEFAULT_LAB_SETTINGS,
      updatedAt: parseIsoTimestampToMillis(doc.updatedAt ?? doc.$updatedAt) ?? legacy?.updatedAt ?? null,
    };
  } catch (error) {
    logger.warn('Failed loading lab settings cloud state', error);
    return null;
  }
}

export async function saveUserLabSettingsCloud(userId: string, settings: UserLabSettings, context: LabCloudContext = {}): Promise<boolean> {
  const cfg = getAppConfig();
  if (!cfg.appwrite) {
    return false;
  }

  const client = getAppwriteClient();
  if (!client) {
    return false;
  }

  try {
    const parsedSettings = normalizeLocalLabSettings(userLabSettingsSchema.parse(settings));
    const nowIso = new Date().toISOString();
    const candidates = await resolveCloudUserIdCandidates(userId, context);
    const discoveredAppwriteUserId = await resolveDiscoveredAppwriteUserId(context);
    const existingResolved = await getLabsDocumentWithId(userId, context, discoveredAppwriteUserId);
    const targetDocumentId = existingResolved?.documentId
      ?? discoveredAppwriteUserId
      ?? candidates[0]
      ?? getLabDocumentIdCandidatesSyncFallback(userId)[0]
      ?? userId;

    await mutateCloudJsonBlobDocument({
      databases: client.databases,
      databaseId: cfg.appwrite.cloudDatabaseId,
      collectionId: cfg.appwrite.labsCollectionId,
      candidateDocumentIds: buildLabDocumentCandidates(userId, candidates, discoveredAppwriteUserId),
      fallbackDocumentId: targetDocumentId,
      nowIso,
      parseBlob: raw => {
        if (typeof raw !== 'string') {
          return {};
        }

        return labBlobSchema.parse(JSON.parse(raw));
      },
      mutate: existingBlobInput => {
        const existingBlob = labBlobSchema.parse(existingBlobInput) as LabBlobState;

        const recordsByName = new Map<string, LabBlobRecord>();
        const existingRecords = Array.isArray(existingBlob.progress?.records) ? existingBlob.progress.records : [];
        for (const record of existingRecords) {
          if (!record || typeof record.labName !== 'string' || record.labName.length === 0) {
            continue;
          }
          recordsByName.set(record.labName, { ...record });
        }

        for (const [labName, range] of Object.entries(parsedSettings.labLevels)) {
          const existingRecord = recordsByName.get(labName) ?? { labName };
          recordsByName.set(labName, {
            ...existingRecord,
            labName,
            currentLevel: Math.max(0, Math.floor(Number(range.startLevel) || 0)),
            rangeStart: Math.max(0, Math.floor(Number(range.startLevel) || 0)),
            rangeTarget: Math.max(0, Math.floor(Number(range.targetLevel) || 0)),
          });
        }

        const nextLabs = {
          ...(toObjectRecord(existingBlob.settings?.labs) ?? {}),
          labSpeed: parsedSettings.labSpeed,
          labRelic: parsedSettings.labRelic,
          labDiscount: parsedSettings.labDiscount,
          speedUp: parsedSettings.speedUp,
        };

        const nextUi = {
          ...(toObjectRecord(existingBlob.settings?.ui) ?? {}),
          toolsBotHideMaxedLabs: parsedSettings.hideMaxedLabs,
        };

        const nextBlob: LabBlobState = {
          ...existingBlob,
          progress: {
            ...(toObjectRecord(existingBlob.progress) ?? {}),
            records: Array.from(recordsByName.values()),
          },
          settings: {
            ...(toObjectRecord(existingBlob.settings) ?? {}),
            labs: nextLabs,
            ui: nextUi,
          },
        };

        return nextBlob;
      },
    });
    return true;
  } catch (error) {
    logger.warn('Failed saving lab settings cloud state', error);
    return false;
  }
}
