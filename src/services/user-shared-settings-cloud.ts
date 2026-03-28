import {
  parseIsoTimestampToMillis,
  normalizeSharedUserToolSettings,
  type SharedUserToolSettings,
} from '@tmrxjd/platform/tools';
import {
  isAppwriteUnknownAttributeError,
  resolveDocumentByCandidates,
} from '@tmrxjd/platform/node';
import { z } from 'zod';
import { getAppConfig } from '../config';
import { logger } from '../core/logger';
import { getAppwriteClient } from './appwrite-client';
import { resolveCloudUserIdCandidates } from './cloud-user-resolution';

function normalizeSharedSettingsDoc(doc: Record<string, unknown>): SharedUserToolSettings {
  const parsed = sharedSettingsCloudDocumentSchema.parse(doc);
  return normalizeSharedUserToolSettings({
    cloudSyncEnabled: parsed.cloudSyncEnabled,
    chartPalettePreset: parsed.chartPalettePreset,
    chartDataAlignment: parsed.chartDataAlignment,
  });
}

const sharedSettingsCloudDocumentSchema = z.object({
  cloudSyncEnabled: z.boolean().optional(),
  chartPalettePreset: z.string().optional(),
  chartDataAlignment: z.string().optional(),
  updatedAt: z.string().optional(),
  $updatedAt: z.string().optional(),
}).passthrough();

const sharedSettingsCloudWriteSchema = z.object({
  cloudSyncEnabled: z.boolean(),
  chartPalettePreset: z.string(),
  chartDataAlignment: z.string().optional(),
});

const legacySharedSettingsCloudWriteSchema = z.object({
  cloudSyncEnabled: z.boolean(),
  chartPalettePreset: z.string(),
});

export type SharedSettingsCloudLoadResult = {
  state: SharedUserToolSettings;
  updatedAt: number | null;
};

async function getResolvedSettingsDocument(userId: string): Promise<{ documentId: string; document: Record<string, unknown> } | null> {
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
    databaseId: cfg.appwrite.settingsDatabaseId,
    collectionId: cfg.appwrite.settingsCollectionId,
    candidateDocumentIds: candidates,
  });
}

async function writeSettingsDocumentWithFallback(input: {
  mode: 'create' | 'update';
  documentId: string;
  fullPayload: Record<string, unknown>;
  legacyPayload: Record<string, unknown>;
}): Promise<void> {
  const cfg = getAppConfig();
  if (!cfg.appwrite) {
    return;
  }
  const appwrite = cfg.appwrite;

  const client = getAppwriteClient();
  if (!client) {
    return;
  }

  const write = input.mode === 'update'
    ? (payload: Record<string, unknown>) => client.databases.updateDocument(
      appwrite.settingsDatabaseId,
      appwrite.settingsCollectionId,
      input.documentId,
      payload,
    )
    : (payload: Record<string, unknown>) => client.databases.createDocument(
      appwrite.settingsDatabaseId,
      appwrite.settingsCollectionId,
      input.documentId,
      payload,
    );

  try {
    await write(input.fullPayload);
  } catch (error) {
    if (!isAppwriteUnknownAttributeError(error)) {
      throw error;
    }

    await write(input.legacyPayload);
  }
}

export async function loadUserSharedSettingsCloud(userId: string): Promise<SharedSettingsCloudLoadResult | null> {
  try {
    const resolved = await getResolvedSettingsDocument(userId);
    const settingsDoc = resolved?.document;
    if (settingsDoc) {
      return {
        state: normalizeSharedSettingsDoc(settingsDoc),
        updatedAt: parseIsoTimestampToMillis(settingsDoc.$updatedAt ?? settingsDoc.updatedAt),
      };
    }

    return null;
  } catch (error) {
    logger.warn('Failed loading shared settings cloud state', error);
    return null;
  }
}

export async function saveUserSharedSettingsCloud(userId: string, settings: SharedUserToolSettings): Promise<boolean> {
  const cfg = getAppConfig();
  if (!cfg.appwrite) {
    return false;
  }

  const client = getAppwriteClient();
  if (!client) {
    return false;
  }

  try {
    const normalized = normalizeSharedUserToolSettings(settings);
    const fullPayload = sharedSettingsCloudWriteSchema.parse({
      cloudSyncEnabled: normalized.cloudSyncEnabled,
      chartPalettePreset: normalized.chartPalettePreset,
      chartDataAlignment: normalized.chartDataAlignment,
    });
    const legacyPayload = legacySharedSettingsCloudWriteSchema.parse({
      cloudSyncEnabled: normalized.cloudSyncEnabled,
      chartPalettePreset: normalized.chartPalettePreset,
    });

    const candidates = await resolveCloudUserIdCandidates(userId);
    const targetDocumentId = candidates[0] ?? userId;
    const existing = await getResolvedSettingsDocument(userId);

    await writeSettingsDocumentWithFallback({
      mode: existing ? 'update' : 'create',
      documentId: existing?.documentId ?? targetDocumentId,
      fullPayload,
      legacyPayload,
    });
    return true;
  } catch (error) {
    logger.warn('Failed saving shared settings cloud state', error);
    return false;
  }
}
