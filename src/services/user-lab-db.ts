import { getToolsBotDb } from './idb';
import { logger } from '../core/logger';
import { loadUserLabSettingsCloud, saveUserLabSettingsCloud } from './user-lab-cloud';
import { resolveCanonicalAppwriteUserId } from './identity';
import {
  buildSyncedStateReconcileResult,
  defaultUserLabSettings,
  normalizeUserLabSettings,
  saveSyncedToolState,
  type UserLabSettings,
} from '@tmrxjd/platform/tools';
import { syncCloudOutboxState } from './cloud-sync-outbox';
import { getEffectiveUserSharedSettings } from './user-shared-settings-db';

const LAB_SETTINGS_SCOPE = 'lab-settings';

type LabCloudContext = {
  username?: string;
  usernameCandidates?: string[];
};

export type { UserLabSettings } from '@tmrxjd/platform/tools';

export type LabReconcileResult = {
  autoCloudEnabled: boolean;
  hasDifference: boolean;
  direction: 'cloud-newer' | 'local-newer' | 'unknown';
  localUpdatedAt: number | null;
  cloudUpdatedAt: number | null;
  localState: UserLabSettings;
  cloudState: UserLabSettings | null;
  applyCloudToLocal: () => Promise<UserLabSettings | null>;
  applyLocalToCloud: () => Promise<void>;
};

const DEFAULT_SETTINGS: UserLabSettings = { ...defaultUserLabSettings, labLevels: {} };

function hasMeaningfulLabState(settings: UserLabSettings | null): boolean {
  if (!settings) return false;
  if (Object.keys(settings.labLevels ?? {}).length > 0) return true;

  return settings.labSpeed > 0
    || settings.labRelic > 0
    || settings.labDiscount > 0
    || settings.speedUp > 1
    || settings.hideMaxedLabs === false;
}

async function isCloudSyncEnabledForUser(userId: string): Promise<boolean> {
  try {
    return (await getEffectiveUserSharedSettings(userId)).cloudSyncEnabled;
  } catch (error) {
    logger.warn('Failed to resolve shared settings for lab sync gating', error);
    return false;
  }
}

function resolveLabCloudUserId(userId: string): string {
  const canonicalUserId = resolveCanonicalAppwriteUserId(userId);
  if (canonicalUserId && canonicalUserId !== userId) {
    return canonicalUserId;
  }

  return userId;
}

async function loadLocalUserLabSettingsLegacySqlite(userId: string): Promise<{ state: UserLabSettings | null; updatedAt: number | null }> {
  const database = getToolsBotDb();
  const row = await database.labSettings.get(userId);
  if (!row) {
    return {
      state: null,
      updatedAt: null,
    };
  }

  return {
    state: normalizeUserLabSettings({
      ...DEFAULT_SETTINGS,
      ...row,
      labLevels: row.labLevels ?? {},
    }),
    updatedAt: Number.isFinite(Number(row.updatedAt)) ? Number(row.updatedAt) : null,
  };
}

async function saveLocalUserLabSettingsLegacySqlite(userId: string, settings: UserLabSettings): Promise<void> {
  const normalized = normalizeUserLabSettings(settings);
  const database = getToolsBotDb();
  await database.labSettings.put({
    userId,
    labSpeed: normalized.labSpeed,
    labRelic: normalized.labRelic,
    labDiscount: normalized.labDiscount,
    speedUp: normalized.speedUp,
    hideMaxedLabs: normalized.hideMaxedLabs ? 1 : 0,
    labLevels: normalized.labLevels,
    updatedAt: Date.now(),
  });
}

async function loadLocalUserLabSettings(userId: string): Promise<{ state: UserLabSettings | null; updatedAt: number | null }> {
  try {
    const { loadLabSettingsFromRxDB } = await import('../rxdb/user-state-rxdb-store.js');
    return await loadLabSettingsFromRxDB(userId);
  } catch (error) {
    logger.warn('[lab-settings] RxDB read failed; falling back to legacy sqlite', { userId, error });
    return loadLocalUserLabSettingsLegacySqlite(userId);
  }
}

async function saveLocalUserLabSettings(userId: string, settings: UserLabSettings): Promise<void> {
  try {
    const { saveLabSettingsToRxDB } = await import('../rxdb/user-state-rxdb-store.js');
    await saveLabSettingsToRxDB(userId, settings);
    return;
  } catch (error) {
    logger.warn('[lab-settings] RxDB write failed; falling back to legacy sqlite', { userId, error });
  }

  await saveLocalUserLabSettingsLegacySqlite(userId, settings);
}

export async function getUserLabSettings(userId: string, _context: LabCloudContext = {}): Promise<UserLabSettings> {
  try {
    const local = await loadLocalUserLabSettings(userId);
    return local.state ?? { ...DEFAULT_SETTINGS, labLevels: {} };
  } catch (error) {
    logger.warn('Failed to read lab settings, using defaults', error);
    return { ...DEFAULT_SETTINGS, labLevels: {} };
  }
}

export async function saveUserLabSettings(userId: string, settings: UserLabSettings, context: LabCloudContext = {}): Promise<void> {
  try {
    await saveSyncedToolState({
      state: settings,
      normalize: normalizeUserLabSettings,
      saveLocal: async normalized => saveLocalUserLabSettings(userId, normalized),
      isCloudSyncEnabled: async () => await isCloudSyncEnabledForUser(userId),
      queueCloudSync: async normalized => {
        const cloudUserId = resolveLabCloudUserId(userId);
        await syncCloudOutboxState({
          userId: cloudUserId,
          scope: LAB_SETTINGS_SCOPE,
          payload: normalized as unknown as Record<string, unknown>,
          send: async payload => saveUserLabSettingsCloud(cloudUserId, payload as unknown as UserLabSettings, context),
        });
      },
    });
  } catch (error) {
    logger.warn('Failed to save lab settings', error);
  }
}

export async function reconcileUserLabSettings(userId: string, context: LabCloudContext = {}): Promise<LabReconcileResult> {
  let [local, cloud, autoCloudEnabled] = await Promise.all([
    loadLocalUserLabSettings(userId),
    loadUserLabSettingsCloud(userId, context),
    isCloudSyncEnabledForUser(userId),
  ]);

  if (autoCloudEnabled && local.updatedAt === null && cloud?.settings) {
    await saveLocalUserLabSettings(userId, cloud.settings);
    local = {
      state: cloud.settings,
      updatedAt: cloud.updatedAt ?? Date.now(),
    };
  }

  return buildSyncedStateReconcileResult({
    local,
    cloud: {
      state: cloud?.settings ?? null,
      updatedAt: cloud?.updatedAt ?? null,
    },
    autoCloudEnabled,
    normalize: input => normalizeUserLabSettings(input ?? { ...DEFAULT_SETTINGS, labLevels: {} }),
    saveLocal: async state => saveLocalUserLabSettings(userId, state),
    queueCloudSync: async state => {
      const cloudUserId = resolveLabCloudUserId(userId);
      await syncCloudOutboxState({
        userId: cloudUserId,
        scope: LAB_SETTINGS_SCOPE,
        payload: state as unknown as Record<string, unknown>,
        send: async payload => saveUserLabSettingsCloud(cloudUserId, payload as unknown as UserLabSettings, context),
      });
    },
  });
}
