import {
  battleConditionsSchedulerFallbackIntervalMs,
  battleConditionsSourceGuildId,
} from '@tmrxjd/platform/tools';
import type { ToolsBotClient } from '../core/tools-bot-client';
import { logger } from '../core/logger';
import {
  getLatestBattleConditions,
  type BattleConditionsRecord,
} from './battle-conditions-cloud';
import {
  getBattleConditionsSchedulerState,
  listBattleConditionsSubscriptions,
  saveBattleConditionsSchedulerState,
} from './battle-conditions-db';
import {
  getActiveBattleConditionsWindow,
  getConfiguredBattleConditionsRanks,
  isBattleConditionsRecordFreshForWindow,
} from './battle-conditions-runtime';
import { deliverBattleConditionsRecords } from './battle-conditions-delivery';

let interval: NodeJS.Timeout | null = null;
type LocalBattleConditionsRank = 'legends' | 'champ' | 'plat' | 'gold' | 'silver';
type LocalBattleConditionsDeliveredDates = Partial<Record<LocalBattleConditionsRank, string | undefined>>;

async function loadFreshRecords(requiredRanks: LocalBattleConditionsRank[], startMs: number): Promise<Partial<Record<LocalBattleConditionsRank, BattleConditionsRecord>>> {
  const result: Partial<Record<LocalBattleConditionsRank, BattleConditionsRecord>> = {};
  for (const rank of requiredRanks) {
    const record = await getLatestBattleConditions(rank);
    if (record && record.sourceMessageUpdatedAt >= startMs) {
      result[rank] = record;
    }
  }
  return result;
}

async function checkAndSend(client: ToolsBotClient): Promise<void> {
  const window = getActiveBattleConditionsWindow();
  if (!window) {
    return;
  }

  const subscriptions = await listBattleConditionsSubscriptions();
  const configuredRanks = Array.from(new Set(subscriptions.flatMap(subscription => getConfiguredBattleConditionsRanks(subscription.channels, subscription.enabled))));
  if (configuredRanks.length === 0) {
    return;
  }

  const schedulerState = await getBattleConditionsSchedulerState();
  if (schedulerState.windowKey === window.windowKey && schedulerState.resolvedAt) {
    return;
  }

  const records = await loadFreshRecords(configuredRanks, window.startMs);
  const lastSeenTournamentDates: LocalBattleConditionsDeliveredDates = { ...schedulerState.lastSeenTournamentDates };
  for (const [rank, record] of Object.entries(records) as Array<[LocalBattleConditionsRank, BattleConditionsRecord | undefined]>) {
    if (record) {
      lastSeenTournamentDates[rank] = record.tournamentDate;
    }
  }

  await deliverBattleConditionsRecords(client, records);

  const resolved = configuredRanks.every(rank => isBattleConditionsRecordFreshForWindow(records[rank] ?? null, window));
  await saveBattleConditionsSchedulerState({
    windowKey: window.windowKey,
    lastPolledAt: Date.now(),
    resolvedAt: resolved ? Date.now() : null,
    lastSeenTournamentDates,
    updatedAt: Date.now(),
  });
}

export function startBattleConditionsScheduler(client: ToolsBotClient): void {
  if (interval) {
    return;
  }

  void checkAndSend(client);
  interval = setInterval(() => {
    void checkAndSend(client);
  }, battleConditionsSchedulerFallbackIntervalMs);
  logger.info('Battle conditions scheduler started', {
    intervalMs: battleConditionsSchedulerFallbackIntervalMs,
    mode: 'fallback',
  });
}

export function stopBattleConditionsScheduler(): void {
  if (!interval) {
    return;
  }

  clearInterval(interval);
  interval = null;
}