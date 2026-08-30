import type { Giveaway } from '../../persistence/repositories/giveaway.repo';
import { giveawayRepo } from '../../persistence/repositories/giveaway.repo';
import type { ToolsBotClient } from '../../core/tools-bot-client';
import { normalizeGiveawayEndTime } from '@tmrxjd/platform/tools';
import { logger } from '../../core/logger';
import { endSingleGiveaway } from './giveaway-end-single';

const scheduledGiveawayTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
const GIVEAWAY_RETRY_DELAY_MS = 5 * 60 * 1000;
const GIVEAWAY_CATCHUP_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_TIMEOUT_MS = 2_147_483_647;
const STARTUP_STAGGER_MS = 500;

async function finalizeGiveawayWithRetry(client: ToolsBotClient, giveawayId: string): Promise<void> {
  await endSingleGiveaway(client, giveawayId);
  const latest = await giveawayRepo.getGiveaway(giveawayId).catch(() => null);
  if (!latest || latest.announcementSent) {
    scheduledGiveawayTimeouts.delete(giveawayId);
    return;
  }

  const retryTimeout = setTimeout(() => {
    void finalizeGiveawayWithRetry(client, giveawayId);
  }, GIVEAWAY_RETRY_DELAY_MS);
  scheduledGiveawayTimeouts.set(giveawayId, retryTimeout);
}

export async function scheduleGiveawayEnd(client: ToolsBotClient, giveaway: Giveaway): Promise<void> {
  if (giveaway.announcementSent) return;
  const endTime = normalizeGiveawayEndTime(giveaway.endTime);
  const msUntilEnd = endTime - Date.now();
  if (msUntilEnd <= 0) {
    logger.info(`[GiveawayScheduler] ending overdue giveaway now: ${giveaway.$id}`);
    await finalizeGiveawayWithRetry(client, giveaway.$id);
    return;
  }
  if (scheduledGiveawayTimeouts.has(giveaway.$id)) {
    clearTimeout(scheduledGiveawayTimeouts.get(giveaway.$id));
  }
  logger.debug(`[GiveawayScheduler] scheduling giveaway ${giveaway.$id} to end in ${msUntilEnd}ms`);
  const timeout = setTimeout(() => {
    void scheduleGiveawayEnd(client, giveaway);
  }, Math.min(msUntilEnd, MAX_TIMEOUT_MS));
  scheduledGiveawayTimeouts.set(giveaway.$id, timeout);
}

export async function scheduleAllActiveGiveaways(client: ToolsBotClient): Promise<void> {
  const giveaways = await giveawayRepo.listPendingAnnouncements(GIVEAWAY_CATCHUP_WINDOW_MS);
  logger.info(`[GiveawayScheduler] queueing ${giveaways.length} active giveaways for startup catch-up`);
  for (const [index, giveaway] of giveaways.entries()) {
    setTimeout(() => {
      void scheduleGiveawayEnd(client, giveaway);
    }, index * STARTUP_STAGGER_MS);
  }
}
