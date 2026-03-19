import {
  parseJsonRecord,
  parseIsoTimestampToMillis,
  normalizeSharedUserToolSettings,
  toObjectRecord,
  type SharedUserToolSettings,
} from '@tmrxjd/platform/tools';
import { getAppConfig } from '../config';
import { logger } from '../core/logger';
import { getAppwriteClient } from './appwrite-client';
import { resolveCloudUserIdCandidates } from './cloud-user-resolution';
import { getDocumentOrNull } from './appwrite-document-utils';

function extractSharedSettings(blob: Record<string, unknown>): SharedUserToolSettings | null {
  const settings = toObjectRecord(blob.settings);
  if (!settings) {
    return null;
  }

  const fromCurrent = toObjectRecord(settings.sharedToolSettings);
  if (fromCurrent) {
    return normalizeSharedUserToolSettings(fromCurrent);
  }

  const fromLegacy = toObjectRecord(settings.shared_tool_settings);
  if (fromLegacy) {
    return normalizeSharedUserToolSettings(fromLegacy);
  }

  return null;
}

function normalizeSharedSettingsDoc(doc: Record<string, unknown>): SharedUserToolSettings {
  return normalizeSharedUserToolSettings({
    cloudSyncEnabled: doc.cloudSyncEnabled,
    chartPalettePreset: doc.chartPalettePreset,
    chartDataAlignment: doc.chartDataAlignment,
  });
}

function isUnknownAttributeError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error || '').toLowerCase();
  return message.includes('unknown attribute')
    || message.includes('attribute not found')
    || message.includes('invalid document structure')
    || message.includes('attribute is not available');
}

export type SharedSettingsCloudLoadResult = {
  state: SharedUserToolSettings;
  updatedAt: number | null;
};

async function getSettingsDocumentOrNull(userId: string): Promise<Record<string, unknown> | null> {
  const cfg = getAppConfig();
  if (!cfg.appwrite) {
    return null;
  }

  const client = getAppwriteClient();
  if (!client) {
    return null;
  }

  return await getDocumentOrNull(
    client.databases,
    cfg.appwrite.settingsDatabaseId,
    cfg.appwrite.settingsCollectionId,
    userId,
  );
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

  return await getDocumentOrNull(
    client.databases,
    cfg.appwrite.cloudDatabaseId,
    cfg.appwrite.modulesCollectionId,
    userId,
  );
}

export async function loadUserSharedSettingsCloud(userId: string): Promise<SharedSettingsCloudLoadResult | null> {
  try {
    const candidates = await resolveCloudUserIdCandidates(userId);

    for (const candidate of candidates) {
      const settingsDoc = await getSettingsDocumentOrNull(candidate);
      if (settingsDoc) {
        return {
          state: normalizeSharedSettingsDoc(settingsDoc),
          updatedAt: parseIsoTimestampToMillis(settingsDoc.$updatedAt ?? settingsDoc.updatedAt),
        };
      }

      const legacyDoc = await getModulesDocumentOrNull(candidate);
      if (legacyDoc && typeof legacyDoc.data === 'string') {
        const parsed = parseJsonRecord(legacyDoc.data);
        if (!parsed) {
          continue;
        }
        const extracted = extractSharedSettings(parsed);
        if (extracted) {
          return {
            state: extracted,
            updatedAt: parseIsoTimestampToMillis(legacyDoc.$updatedAt ?? legacyDoc.updatedAt),
          };
        }
      }
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
    const fullPayload = {
      cloudSyncEnabled: normalized.cloudSyncEnabled,
      chartPalettePreset: normalized.chartPalettePreset,
      chartDataAlignment: normalized.chartDataAlignment,
    };
    const legacyPayload = {
      cloudSyncEnabled: normalized.cloudSyncEnabled,
      chartPalettePreset: normalized.chartPalettePreset,
    };

    const candidates = await resolveCloudUserIdCandidates(userId);
    const targetDocumentId = candidates[0] ?? userId;
    const existing = await getSettingsDocumentOrNull(targetDocumentId);

    if (existing) {
      try {
        await client.databases.updateDocument(
          cfg.appwrite.settingsDatabaseId,
          cfg.appwrite.settingsCollectionId,
          targetDocumentId,
          fullPayload,
        );
      } catch (error) {
        if (!isUnknownAttributeError(error)) {
          throw error;
        }
        await client.databases.updateDocument(
          cfg.appwrite.settingsDatabaseId,
          cfg.appwrite.settingsCollectionId,
          targetDocumentId,
          legacyPayload,
        );
      }
      return true;
    } else {
      try {
        await client.databases.createDocument(
          cfg.appwrite.settingsDatabaseId,
          cfg.appwrite.settingsCollectionId,
          targetDocumentId,
          fullPayload,
        );
      } catch (error) {
        if (!isUnknownAttributeError(error)) {
          throw error;
        }
        await client.databases.createDocument(
          cfg.appwrite.settingsDatabaseId,
          cfg.appwrite.settingsCollectionId,
          targetDocumentId,
          legacyPayload,
        );
      }
      return true;
    }
  } catch (error) {
    logger.warn('Failed saving shared settings cloud state', error);
    return false;
  }
}
