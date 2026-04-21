import {
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
  markBattleConditionsDelivered,
  saveBattleConditionsSchedulerState,
} from './battle-conditions-db';
import {
  getActiveBattleConditionsWindow,
  getConfiguredBattleConditionsRanks,
  isBattleConditionsRecordFreshForWindow,
} from './battle-conditions-runtime';
import { sendBattleConditionsRecordToChannel } from './battle-conditions-discord';

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

async function deliverRecords(client: ToolsBotClient, records: Partial<Record<LocalBattleConditionsRank, BattleConditionsRecord>>) {
  const subscriptions = await listBattleConditionsSubscriptions();
  for (const subscription of subscriptions) {
    if (subscription.guildId === battleConditionsSourceGuildId) {
      continue;
    }

    for (const [rank, record] of Object.entries(records) as Array<[LocalBattleConditionsRank, BattleConditionsRecord | undefined]>) {
      if (!record) {
        continue;
      }

      const channelId = subscription.channels[rank];
      if (!channelId) {
        continue;
      }

      if (subscription.deliveredTournamentDates[rank] === record.tournamentDate) {
        continue;
      }

      try {
        const sent = await sendBattleConditionsRecordToChannel(client, subscription.guildId, channelId, record);
        if (sent.ok) {
          await markBattleConditionsDelivered({
            guildId: subscription.guildId,
            rank,
            tournamentDate: record.tournamentDate,
          });
        }
      } catch (error) {
        logger.warn('Failed to repost battle conditions', {
          guildId: subscription.guildId,
          rank,
          channelId,
          error,
        });
      }
    }
  }
}

async function checkAndSend(client: ToolsBotClient): Promise<void> {
  const window = getActiveBattleConditionsWindow();
  if (!window) {
    return;
  }

  const subscriptions = await listBattleConditionsSubscriptions();
  const configuredRanks = Array.from(new Set(subscriptions.flatMap(subscription => getConfiguredBattleConditionsRanks(subscription.channels))));
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

  await deliverRecords(client, records);

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
  }, 60 * 1000);
  logger.info('Battle conditions scheduler started');
}

export function stopBattleConditionsScheduler(): void {
  if (!interval) {
    return;
  }

  clearInterval(interval);
  interval = null;
}