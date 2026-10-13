import { canAutomaticallyDeliverBattleRecord } from './battle-conditions-payload';
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
  if (deliveredTournamentDate && deliveredTournamentDate > record.tournamentDate) return true;
  return deliveredTournamentDate === record.tournamentDate
    && deliveredSourceUpdatedAt >= record.sourceMessageUpdatedAt;
}

async function runDelivery(
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
      if (!record || !await canAutomaticallyDeliverBattleRecord(record)) {
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
          logger.warn('Battle conditions delivery confirmed', { guildId: subscription.guildId, channelId, rank, tournamentDate: record.tournamentDate, sourceUpdatedAt: record.sourceMessageUpdatedAt, messageId: sent.messageId });
          summary.delivered += 1;
          continue;
        }

        logger.warn('Battle conditions delivery target unavailable', { guildId: subscription.guildId, channelId, rank, reason: sent.reason });
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

// Serialize bridge and fallback delivery so both re-read receipts after the prior send.
let deliveryTail: Promise<unknown> = Promise.resolve();
let pendingDeliveryPasses = 0;

export function getPendingBattleConditionsDeliveryCount(): number {
  return pendingDeliveryPasses;
}
export function deliverBattleConditionsRecords(
  client: ToolsBotClient,
  records: Partial<Record<LocalBattleConditionsRank, BattleConditionsRecord | undefined>>,
): Promise<BattleConditionsDeliverySummary> {
  pendingDeliveryPasses += 1;
  const next = deliveryTail.then(() => runDelivery(client, records)).finally(() => {
    pendingDeliveryPasses -= 1;
  });
  deliveryTail = next.catch(() => {});
  return next;
}

export async function deliverBattleConditionsRecord(
  client: ToolsBotClient,
  record: BattleConditionsRecord,
): Promise<BattleConditionsDeliverySummary> {
  return deliverBattleConditionsRecords(client, {
    [record.rank]: record,
  });
}
