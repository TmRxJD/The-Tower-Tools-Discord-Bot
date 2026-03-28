import { getToolsBotDb, reminderPairId } from './idb';
import { logger } from '../core/logger';
import {
  buildSyncedStateReconcileResult,
  normalizeChecklistState,
  normalizeReminderCompositeState,
  saveSyncedToolState,
  type ChecklistState,
  type ReminderCompositeState,
} from '@tmrxjd/platform/tools';
import {
  type CloudChecklistState,
  type CloudReminderState,
  loadUserChecklistCloudState,
  loadUserReminderCloudState,
  saveUserChecklistCloudState,
  saveUserReminderCloudState,
} from './user-reminder-cloud';
import { syncCloudOutboxState } from './cloud-sync-outbox';
import { getEffectiveUserSharedSettings } from './user-shared-settings-db';

const CHECKLIST_SCOPE = 'checklist-state';
const REMINDER_SCOPE = 'reminder-state';

type Direction = 'cloud-newer' | 'local-newer' | 'unknown';

export type ReminderReconcileResult = {
  autoCloudEnabled: boolean;
  hasDifference: boolean;
  direction: Direction;
  localUpdatedAt: number | null;
  cloudUpdatedAt: number | null;
  localState: ReminderCompositeState;
  cloudState: ReminderCompositeState | null;
  applyCloudToLocal: () => Promise<ReminderCompositeState | null>;
  applyLocalToCloud: () => Promise<void>;
};

export type ChecklistReconcileResult = {
  autoCloudEnabled: boolean;
  hasDifference: boolean;
  direction: Direction;
  localUpdatedAt: number | null;
  cloudUpdatedAt: number | null;
  localState: ChecklistState;
  cloudState: ChecklistState | null;
  applyCloudToLocal: () => Promise<ChecklistState | null>;
  applyLocalToCloud: () => Promise<void>;
};

async function isCloudSyncEnabledForUser(userId: string): Promise<boolean> {
  try {
    return (await getEffectiveUserSharedSettings(userId)).cloudSyncEnabled;
  } catch (error) {
    logger.warn('Failed to resolve shared settings for reminder sync gating', error);
    return false;
  }
}

async function loadLocalChecklist(userId: string): Promise<ChecklistState | null> {
  const database = getToolsBotDb();
  const row = await database.checklists.get(userId);
  if (!row) {
    return null;
  }

  return {
    labels: row.labels,
    tasks: row.tasks,
    updatedAt: row.updatedAt ?? null,
  };
}

async function saveLocalChecklist(userId: string, state: ChecklistState): Promise<void> {
  const database = getToolsBotDb();
  await database.checklists.put({
    userId,
    labels: state.labels,
    tasks: state.tasks,
    updatedAt: state.updatedAt ?? Date.now(),
  });
}

export async function getUserChecklist(userId: string): Promise<ChecklistState | null> {
  try {
    return await loadLocalChecklist(userId);
  } catch (error) {
    logger.warn('Failed to read user checklist', error);
    return null;
  }
}

export async function saveUserChecklist(userId: string, labels: Array<string | null>, tasks: boolean[]): Promise<void> {
  try {
    await saveSyncedToolState({
      state: {
        labels,
        tasks,
        updatedAt: Date.now(),
      },
      normalize: state => state,
      saveLocal: async state => saveLocalChecklist(userId, state),
      isCloudSyncEnabled: async () => await isCloudSyncEnabledForUser(userId),
      queueCloudSync: async state => {
        await syncCloudOutboxState({
          userId,
          scope: CHECKLIST_SCOPE,
          payload: state as unknown as Record<string, unknown>,
          send: async payload => saveUserChecklistCloudState(userId, payload as unknown as ChecklistState),
        });
      },
    })
  } catch (error) {
    logger.warn('Failed to save user checklist', error);
  }
}

export async function getUserReminders(userId: string): Promise<Record<string, boolean>> {
  try {
    const database = getToolsBotDb();
    const rows = await database.reminderToggles.where('userId').equals(userId).toArray();
    const local: Record<string, boolean> = {};
    for (const row of rows) {
      local[row.reminderKey] = Boolean(row.enabled);
    }

    return local;
  } catch (error) {
    logger.warn('Failed to read user reminders', error);
    return {};
  }
}

export async function saveUserReminders(userId: string, remindersMap: Record<string, boolean>): Promise<void> {
  try {
    const now = Date.now();
    const database = getToolsBotDb();
    for (const [reminderKey, enabled] of Object.entries(remindersMap)) {
      await database.reminderToggles.put({
        id: reminderPairId(userId, reminderKey),
        userId,
        reminderKey,
        enabled: enabled ? 1 : 0,
        updatedAt: now,
      });
    }

    const cloudSyncEnabled = await isCloudSyncEnabledForUser(userId);
    if (cloudSyncEnabled) {
      const pausedState = await getReminderSettings(userId);
      await syncCloudOutboxState({
        userId,
        scope: REMINDER_SCOPE,
        payload: {
          toggles: remindersMap,
          paused: pausedState.paused,
          updatedAt: now,
        },
        send: async payload => saveUserReminderCloudState(userId, payload as CloudReminderState),
      });
    }
  } catch (error) {
    logger.warn('Failed to save user reminders', error);
  }
}

export async function setReminderDisabled(userId: string, reminderKey: string): Promise<void> {
  const database = getToolsBotDb();
  await database.reminderToggles.put({
    id: reminderPairId(userId, reminderKey),
    userId,
    reminderKey,
    enabled: 0,
    updatedAt: Date.now(),
  });
}

export async function getReminderSettings(userId: string): Promise<{ paused: boolean }> {
  try {
    const database = getToolsBotDb();
    const row = await database.reminderSettings.get(userId);
    return { paused: Boolean(row?.paused) };
  } catch (error) {
    logger.warn('Failed to read reminder settings', error);
    return { paused: false };
  }
}

export async function setPauseAll(userId: string, paused: boolean): Promise<void> {
  try {
    const now = Date.now();
    const database = getToolsBotDb();
    await database.reminderSettings.put({ userId, paused: paused ? 1 : 0, updatedAt: now });

    const cloudSyncEnabled = await isCloudSyncEnabledForUser(userId);
    if (cloudSyncEnabled) {
      const reminders = await getUserReminders(userId);
      await syncCloudOutboxState({
        userId,
        scope: REMINDER_SCOPE,
        payload: {
          toggles: reminders,
          paused,
          updatedAt: now,
        },
        send: async payload => saveUserReminderCloudState(userId, payload as CloudReminderState),
      });
    }
  } catch (error) {
    logger.warn('Failed to set pause-all reminder state', error);
  }
}

async function loadLocalReminderState(userId: string): Promise<{ state: ReminderCompositeState; updatedAt: number | null }> {
  const database = getToolsBotDb();
  const rows = await database.reminderToggles.where('userId').equals(userId).toArray();
  const settingsRow = await database.reminderSettings.get(userId);

  const toggles: Record<string, boolean> = {};
  let latestToggleUpdatedAt: number | null = null;
  for (const row of rows) {
    toggles[row.reminderKey] = Boolean(row.enabled);
    const rowUpdatedAt = Number.isFinite(Number(row.updatedAt)) ? Number(row.updatedAt) : null;
    if (rowUpdatedAt !== null) {
      latestToggleUpdatedAt = latestToggleUpdatedAt === null ? rowUpdatedAt : Math.max(latestToggleUpdatedAt, rowUpdatedAt);
    }
  }

  const settingsUpdatedAt = Number.isFinite(Number((settingsRow as { updatedAt?: unknown } | undefined)?.updatedAt))
    ? Number((settingsRow as { updatedAt?: unknown } | undefined)?.updatedAt)
    : null;

  const localUpdatedAt = settingsUpdatedAt === null
    ? latestToggleUpdatedAt
    : (latestToggleUpdatedAt === null ? settingsUpdatedAt : Math.max(settingsUpdatedAt, latestToggleUpdatedAt));

  return {
    state: normalizeReminderCompositeState({
      paused: Boolean(settingsRow?.paused),
      toggles,
    }),
    updatedAt: localUpdatedAt,
  };
}

export async function getUsersForReminder(reminderKey: string): Promise<string[]> {
  const database = getToolsBotDb();
  const rows = await database.reminderToggles.where('[reminderKey+enabled]').equals([reminderKey, 1]).toArray();
  return [...new Set(rows.map(row => row.userId))];
}

export async function getLastSent(userId: string, reminderKey: string): Promise<number | null> {
  const database = getToolsBotDb();
  const row = await database.reminderLastSent.get(reminderPairId(userId, reminderKey));
  return row?.lastSent ?? null;
}

export async function setLastSent(userId: string, reminderKey: string, timestamp: number): Promise<void> {
  const database = getToolsBotDb();
  await database.reminderLastSent.put({
    id: reminderPairId(userId, reminderKey),
    userId,
    reminderKey,
    lastSent: timestamp,
  });
}

export async function reconcileUserReminderState(userId: string): Promise<ReminderReconcileResult> {
  let [local, cloudSyncEnabled] = await Promise.all([
    loadLocalReminderState(userId),
    isCloudSyncEnabledForUser(userId),
  ]);

  const cloud = cloudSyncEnabled ? await loadUserReminderCloudState(userId) : await loadUserReminderCloudState(userId);

  if (cloudSyncEnabled && local.updatedAt === null && cloud) {
    await saveUserReminders(userId, cloud.toggles)
    await setPauseAll(userId, cloud.paused)
    local = {
      state: {
        paused: cloud.paused,
        toggles: cloud.toggles,
      },
      updatedAt: cloud.updatedAt ?? Date.now(),
    }
  }

  if (cloudSyncEnabled) {
    void syncCloudOutboxState({
      userId,
      scope: REMINDER_SCOPE,
      payload: {
        ...local.state,
        updatedAt: local.updatedAt,
      },
      send: async payload => saveUserReminderCloudState(userId, payload as CloudReminderState),
    });
  }

  return buildSyncedStateReconcileResult({
    local,
    cloud: {
      state: cloud
        ? {
          paused: cloud.paused,
          toggles: cloud.toggles,
        }
        : null,
      updatedAt: cloud?.updatedAt ?? null,
    },
    autoCloudEnabled: cloudSyncEnabled,
    normalize: state => normalizeReminderCompositeState(state),
    saveLocal: async state => {
      await saveUserReminders(userId, state.toggles)
      await setPauseAll(userId, state.paused)
    },
    queueCloudSync: async state => {
      await syncCloudOutboxState({
        userId,
        scope: REMINDER_SCOPE,
        payload: {
          toggles: state.toggles,
          paused: state.paused,
          updatedAt: Date.now(),
        },
        send: async payload => saveUserReminderCloudState(userId, payload as CloudReminderState),
      })
    },
  });
}

export async function reconcileUserChecklistState(userId: string): Promise<ChecklistReconcileResult> {
  let [local, cloud, cloudSyncEnabled] = await Promise.all([
    getUserChecklist(userId),
    loadUserChecklistCloudState(userId),
    isCloudSyncEnabledForUser(userId),
  ]);

  if (cloudSyncEnabled && local === null && cloud) {
    await saveLocalChecklist(userId, cloud)
    local = cloud
  }

  return buildSyncedStateReconcileResult({
    local: {
      state: local,
      updatedAt: Number.isFinite(Number(local?.updatedAt)) ? Number(local?.updatedAt) : null,
    },
    cloud: {
      state: cloud,
      updatedAt: Number.isFinite(Number(cloud?.updatedAt)) ? Number(cloud?.updatedAt) : null,
    },
    autoCloudEnabled: cloudSyncEnabled,
    normalize: state => normalizeChecklistState(state),
    saveLocal: async state => {
      await saveLocalChecklist(userId, state)
    },
    queueCloudSync: async state => {
      await syncCloudOutboxState({
        userId,
        scope: CHECKLIST_SCOPE,
        payload: state as unknown as Record<string, unknown>,
        send: async payload => saveUserChecklistCloudState(userId, payload as CloudChecklistState),
      })
    },
  });
}
