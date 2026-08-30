import { EmbedBuilder, TextChannel } from 'discord.js';
import type { MessageEditOptions } from 'discord.js';
import type { ToolsBotClient } from '../../core/tools-bot-client';
import { type GiveawayEntry, giveawayRepo } from '../../persistence/repositories/giveaway.repo';
import { normalizeGiveawayEndTime } from '@tmrxjd/platform/tools';
import { logger } from '../../core/logger';

export async function endSingleGiveaway(client: ToolsBotClient, giveawayId: string): Promise<void> {
  logger.debug(`[endSingleGiveaway] called for giveawayId=${giveawayId}`);
  const giveaway = await giveawayRepo.getGiveaway(giveawayId);
  if (!giveaway) {
    logger.warn(`[endSingleGiveaway] giveaway not found: ${giveawayId}`);
    return;
  }

  if (giveaway.announcementSent) {
    logger.debug(`[endSingleGiveaway] giveaway already announced: ${giveawayId}`);
    return;
  }

  const endTimeNum = normalizeGiveawayEndTime(giveaway.endTime);
  if (endTimeNum > Date.now()) {
    logger.debug(`[endSingleGiveaway] giveaway not ended yet: ${giveawayId}`);
    return;
  }

  let winnerIds = Array.isArray(giveaway.winnerIds) ? [...giveaway.winnerIds] : [];
  if (winnerIds.length === 0) {
    const entries = await giveawayRepo.getEntriesForGiveaway(giveaway);
    const uniqueEntries: GiveawayEntry[] = Array.from(
      new Map(entries.documents.map((e: GiveawayEntry) => [e.playerId, e])).values(),
    );
    for (let i = uniqueEntries.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [uniqueEntries[i], uniqueEntries[j]] = [uniqueEntries[j], uniqueEntries[i]];
    }
    winnerIds = uniqueEntries.slice(0, giveaway.winners).map((e: GiveawayEntry) => e.userId);
    await giveawayRepo.updateGiveaway(giveaway.$id, { winnerIds, announcementSent: false });
  }

  try {
    const channel = await client.channels.fetch(giveaway.channelId);
    if (channel && channel instanceof TextChannel) {
      const msg = await channel.messages.fetch(giveaway.messageId);
      if (msg) {
        const embed = EmbedBuilder.from(msg.embeds[0]);
        const fields = (embed.data.fields || []).filter(f => f.name !== 'Winners');
        fields.push({
          name: 'Winners',
          value: winnerIds.length ? winnerIds.map(id => `<@${id}>`).join(', ') : 'No winners',
          inline: false,
        });
        embed.setFields(fields);
        const disabledComponents = msg.components.map(row => {
          const json = row.toJSON() as unknown as Record<string, unknown>;
          const components = (json.components as Array<Record<string, unknown>> | undefined) ?? [];
          json.components = components.map(c => ({ ...c, disabled: true }));
          return json;
        });
        await msg.edit({ embeds: [embed], components: disabledComponents as unknown as MessageEditOptions['components'] });
        await channel.send({
          content: `🎉 Giveaway ended! Winners: ${winnerIds.length ? winnerIds.map(id => `<@${id}>`).join(', ') : 'No winners'}`,
        });
        await giveawayRepo.updateGiveaway(giveaway.$id, { announcementSent: true });
        logger.info(`[endSingleGiveaway] announcement sent for giveaway ${giveawayId}`);
      } else {
        logger.warn(`[endSingleGiveaway] message not found for giveaway ${giveawayId}`);
      }
    } else {
      logger.warn(`[endSingleGiveaway] channel unavailable for giveaway ${giveawayId}`);
    }
  } catch (err) {
    logger.error(`[endSingleGiveaway] error announcing giveaway ${giveawayId}`, err);
  }
}
