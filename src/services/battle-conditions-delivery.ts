import {
  battleConditionsSourceGuildId,
  type BattleConditionsRank,
} from '@tmrxjd/platform/tools';
import type { ToolsBotClient } from '../core/tools-bot-client';
import { logger } from '../core/logger';
import {
  listBattleConditionsSubscriptions,
  markBattleConditionsDelivered,
} from './battle-conditions-db';
import type { BattleConditionsRecord } from './battle-conditions-cloud';
import { sendBattleConditionsRecordToChannel } from './battle-conditions-discord';
import { isBattleConditionsRankEnabled } from './battle-conditions-runtime';

type LocalBattleConditionsRank = BattleConditionsRank;

export interface BattleConditionsDeliverySummary {
  delivered: number;
  skipped: number;
  failed: number;
}

function hasDeliveredCurrentRecord(
  subscription: Awaited<ReturnType<typeof listBattleConditionsSubscriptions>>[number],
  rank: LocalBattleConditionsRank,
  record: BattleConditionsRecord,
): boolean {
  const deliveredTournamentDate = subscription.deliveredTournamentDates[rank];
  const deliveredSourceUpdatedAt = subscription.deliveredSourceUpdatedAt[rank] ?? 0;
  return deliveredTournamentDate === record.tournamentDate
    && deliveredSourceUpdatedAt >= record.sourceMessageUpdatedAt;
}

export async function deliverBattleConditionsRecords(
  client: ToolsBotClient,
  records: Partial<Record<LocalBattleConditionsRank, BattleConditionsRecord | undefined>>,
): Promise<BattleConditionsDeliverySummary> {
  const subscriptions = await listBattleConditionsSubscriptions();
  const summary: BattleConditionsDeliverySummary = {
    delivered: 0,
    skipped: 0,
    failed: 0,
  };

  for (const subscription of subscriptions) {
    if (subscription.guildId === battleConditionsSourceGuildId) {
      continue;
    }

    for (const [rank, record] of Object.entries(records) as Array<[LocalBattleConditionsRank, BattleConditionsRecord | undefined]>) {
      if (!record) {
        continue;
      }

      const channelId = subscription.channels[rank];
      if (!channelId || !isBattleConditionsRankEnabled(subscription.channels, subscription.enabled, rank)) {
        summary.skipped += 1;
        continue;
      }

      if (hasDeliveredCurrentRecord(subscription, rank, record)) {
        summary.skipped += 1;
        continue;
      }

      try {
        const sent = await sendBattleConditionsRecordToChannel(client, subscription.guildId, channelId, record);
        if (sent.ok) {
          await markBattleConditionsDelivered({
            guildId: subscription.guildId,
            rank,
            tournamentDate: record.tournamentDate,
            sourceMessageUpdatedAt: record.sourceMessageUpdatedAt,
          });
          summary.delivered += 1;
          continue;
        }

        summary.failed += 1;
      } catch (error) {
        summary.failed += 1;
        logger.warn('Failed to repost battle conditions', {
          guildId: subscription.guildId,
          rank,
          channelId,
          error,
        });
      }
    }
  }

  return summary;
}

export async function deliverBattleConditionsRecord(
  client: ToolsBotClient,
  record: BattleConditionsRecord,
): Promise<BattleConditionsDeliverySummary> {
  return deliverBattleConditionsRecords(client, {
    [record.rank]: record,
  });
}