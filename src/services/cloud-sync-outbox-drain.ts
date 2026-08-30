import { getToolsBotDb } from './idb';
import { logger } from '../core/logger';
import { syncCloudOutboxState } from './cloud-sync-outbox';
import { saveUserSharedSettingsCloud } from './user-shared-settings-cloud';
import { saveUserLabSettingsCloud } from './user-lab-cloud';
import { saveUserShardSplitterCloudState } from './user-shard-splitter-cloud';
import {
  saveUserChecklistCloudState,
  saveUserReminderCloudState,
  type CloudChecklistState,
  type CloudReminderState,
} from './user-reminder-cloud';
import { sendCommandSharedCloudOutboxPayload } from './user-command-shared-state';
import type { LocalSharedUserToolSettings } from './user-shared-settings-db';
import type { UserLabSettings } from './user-lab-db';
import type { UserShardSplitterState } from './user-shard-splitter-db';

const MAX_DRAIN_BATCH = 20;
const MAX_RETRY_ATTEMPTS = 8;
const CLOUD_SYNC_OUTBOX_DRAIN_INTERVAL_MS = 15_000;

async function sendOutboxPayload(
  userId: string,
  scope: string,
  payload: Record<string, unknown>,
): Promise<boolean> {
  switch (scope) {
    case 'shared-settings':
      return saveUserSharedSettingsCloud(userId, payload as unknown as LocalSharedUserToolSettings);
    case 'lab-settings':
      return saveUserLabSettingsCloud(userId, payload as unknown as UserLabSettings);
    case 'shard-splitter-state':
      return saveUserShardSplitterCloudState(userId, payload as unknown as UserShardSplitterState);
    case 'checklist-state':
      return saveUserChecklistCloudState(userId, payload as unknown as CloudChecklistState);
    case 'reminder-state':
      return saveUserReminderCloudState(userId, payload as unknown as CloudReminderState);
    default:
      if (scope.startsWith('command-shared:')) {
        return sendCommandSharedCloudOutboxPayload(userId, scope, payload);
      }
      logger.warn('No cloud outbox sender registered for scope', { userId, scope });
      return false;
  }
}

export async function drainDueCloudOutboxEntries(limit = MAX_DRAIN_BATCH): Promise<{ attempted: number; synced: number }> {
  const database = getToolsBotDb();
  const now = Date.now();
  const entries = await database.cloudSyncOutbox.toArray();
  const due = entries
    .filter((entry) => (entry.nextRetryAt ?? 0) <= now && (entry.attempts ?? 0) < MAX_RETRY_ATTEMPTS)
    .slice(0, limit);

  let synced = 0;
  for (const entry of due) {
    const ok = await syncCloudOutboxState({
      userId: entry.userId,
      scope: entry.scope,
      payload: entry.payload,
      send: async (payload) => sendOutboxPayload(entry.userId, entry.scope, payload),
    });

    if (ok) {
      synced += 1;
    }
  }

  return { attempted: due.length, synced };
}

let interval: NodeJS.Timeout | null = null;
let running = false;

async function runDrainPass(): Promise<void> {
  if (running) {
    return;
  }

  running = true;
  try {
    const result = await drainDueCloudOutboxEntries();
    if (result.attempted > 0) {
      logger.info('Cloud sync outbox drain completed', result);
    }
  } catch (error) {
    logger.warn('Cloud sync outbox drain failed', error);
  } finally {
    running = false;
  }
}

export function startCloudSyncOutboxDrainScheduler(): void {
  if (interval) {
    return;
  }

  void runDrainPass();
  interval = setInterval(() => {
    void runDrainPass();
  }, CLOUD_SYNC_OUTBOX_DRAIN_INTERVAL_MS);

  logger.info('Cloud sync outbox drain scheduler started', {
    intervalMs: CLOUD_SYNC_OUTBOX_DRAIN_INTERVAL_MS,
  });
}

export function stopCloudSyncOutboxDrainScheduler(): void {
  if (!interval) {
    return;
  }

  clearInterval(interval);
  interval = null;
}
