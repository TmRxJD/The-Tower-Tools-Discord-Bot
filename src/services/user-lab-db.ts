import { diagnosticRef, failureDiagnostics } from './operation-diagnostics';
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
    logger.warn('Failed to resolve shared settings for lab sync gating', failureDiagnostics(error));
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
      hideMaxedLabs: typeof row.hideMaxedLabs === 'number' ? row.hideMaxedLabs !== 0 : row.hideMaxedLabs,
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
    const fallback = await loadLocalUserLabSettingsLegacySqlite(userId);
    logger.warn('[lab-settings] RxDB read failed; using durable sqlite', { ...failureDiagnostics(error), correlation: diagnosticRef(userId), pid: process.pid, outcome: 'sqlite-read' });
    return fallback;
  }
}

async function saveLocalUserLabSettings(userId: string, settings: UserLabSettings): Promise<void> {
  // sqlite is the durable copy (RxDB is in memory on Node), so it is always written and RxDB is a cache on top.
  await saveLocalUserLabSettingsLegacySqlite(userId, settings);

  try {
    const { saveLabSettingsToRxDB } = await import('../rxdb/user-state-rxdb-store.js');
    await saveLabSettingsToRxDB(userId, settings);
  } catch (error) {
    logger.warn('[lab-settings] RxDB write failed; sqlite copy is saved', { ...failureDiagnostics(error), correlation: diagnosticRef(userId), pid: process.pid, operation: 'write', outcome: 'sqlite-saved-cache-unavailable' });
  }
}

export async function getUserLabSettings(userId: string, _context: LabCloudContext = {}): Promise<UserLabSettings> {
  try {
    const local = await loadLocalUserLabSettings(userId);
    return local.state ?? { ...DEFAULT_SETTINGS, labLevels: {} };
  } catch (error) {
    logger.warn('Failed to read lab settings, using defaults', failureDiagnostics(error));
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
    logger.warn('Failed to save lab settings', failureDiagnostics(error));
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
