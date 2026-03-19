import { getToolsBotDb } from './idb';
import { logger } from '../core/logger';
import { loadUserLabSettingsCloud, saveUserLabSettingsCloud } from './user-lab-cloud';
import { resolveCanonicalAppwriteUserId } from './identity';
import {
  buildSyncedStateReconcileResult,
  defaultSharedLabsSettings,
  normalizeSharedLabsSettings,
  saveSyncedToolState,
} from '@tmrxjd/platform/tools';
import { syncCloudOutboxState } from './cloud-sync-outbox';

const LAB_SETTINGS_SCOPE = 'lab-settings';

type LabCloudContext = {
  username?: string;
  usernameCandidates?: string[];
};

export interface LabLevelRange {
  startLevel: number;
  targetLevel: number;
}

export interface UserLabSettings {
  labSpeed: number;
  labRelic: number;
  labDiscount: number;
  speedUp: number;
  hideMaxedLabs: boolean;
  labLevels: Record<string, LabLevelRange>;
}

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

const DEFAULT_SETTINGS: UserLabSettings = {
  ...defaultSharedLabsSettings,
  hideMaxedLabs: true,
  labLevels: {},
};

function normalizeLabSettings(input: UserLabSettings): UserLabSettings {
  const shared = normalizeSharedLabsSettings(input);
  return {
    labSpeed: shared.labSpeed,
    labRelic: shared.labRelic,
    labDiscount: shared.labDiscount,
    speedUp: shared.speedUp,
    hideMaxedLabs: input.hideMaxedLabs !== false,
    labLevels: input.labLevels ?? {},
  };
}

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
  void userId;
  return true;
}

function resolveLabCloudUserId(userId: string): string {
  const canonicalUserId = resolveCanonicalAppwriteUserId(userId);
  if (canonicalUserId && canonicalUserId !== userId) {
    return canonicalUserId;
  }

  return userId;
}

async function loadLocalUserLabSettings(userId: string): Promise<{ state: UserLabSettings | null; updatedAt: number | null }> {
  const database = getToolsBotDb();
  const row = await database.labSettings.get(userId);
  if (!row) {
    return {
      state: null,
      updatedAt: null,
    };
  }

  return {
    state: {
      labSpeed: Number(row.labSpeed ?? 0) || 0,
      labRelic: Number(row.labRelic ?? 0) || 0,
      labDiscount: Number(row.labDiscount ?? 0) || 0,
      speedUp: Math.max(1, Number(row.speedUp ?? 1) || 1),
      hideMaxedLabs: Boolean(row.hideMaxedLabs),
      labLevels: row.labLevels ?? {},
    },
    updatedAt: Number.isFinite(Number(row.updatedAt)) ? Number(row.updatedAt) : null,
  };
}

async function saveLocalUserLabSettings(userId: string, settings: UserLabSettings): Promise<void> {
  const normalized = normalizeLabSettings(settings);
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

export async function getUserLabSettings(userId: string, context: LabCloudContext = {}): Promise<UserLabSettings> {
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
      normalize: normalizeLabSettings,
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
    normalize: input => normalizeLabSettings(input ?? { ...DEFAULT_SETTINGS, labLevels: {} }),
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
