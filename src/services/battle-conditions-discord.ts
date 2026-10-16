import { sendWithBattleReceipt } from './battle-delivery-receipt';
import { readLocalBattlePayload } from './battle-conditions-payload';
import { createHash } from 'node:crypto';
import { ChannelType, PermissionFlagsBits, type APIEmbed, type GuildTextBasedChannel, type MessageCreateOptions } from 'discord.js';
import type { ToolsBotClient } from '../core/tools-bot-client';
import type { BattleConditionsRecord } from './battle-conditions-cloud';

export type BattleConditionsSourcePayload = Pick<MessageCreateOptions, 'content' | 'embeds' | 'files' | 'allowedMentions'>;
export type SendBattleConditionsRecordResult =
  | { ok: true; messageId: string }
  | { ok: false; reason: 'guild-unavailable' | 'channel-unavailable' | 'missing-permissions' | 'source-payload-unavailable' | 'delivery-uncertain' };

function isAllowedBattleConditionsTargetChannelType(type: ChannelType): boolean {
  return type === ChannelType.GuildText
    || type === ChannelType.GuildAnnouncement
    || type === ChannelType.PublicThread
    || type === ChannelType.AnnouncementThread
    || type === ChannelType.PrivateThread;
}

function getBattleConditionsSendPermission(type: ChannelType): bigint {
  return type === ChannelType.PublicThread
    || type === ChannelType.AnnouncementThread
    || type === ChannelType.PrivateThread
    ? PermissionFlagsBits.SendMessagesInThreads
    : PermissionFlagsBits.SendMessages;
}

/** Source content comes only from ModBot's durable local payload store. */
export async function buildBattleConditionsSourcePayload(
  _client: ToolsBotClient, record: BattleConditionsRecord,
): Promise<BattleConditionsSourcePayload | null> {
  const entry = await readLocalBattlePayload(record);
  if (!entry) return null;
  return {
    content: entry.payload.content || undefined,
    embeds: entry.payload.embeds as APIEmbed[],
    files: entry.payload.files.map(file => ({ name: file.name, attachment: Buffer.from(file.data, 'base64') })),
    allowedMentions: { parse: [] },
  };
}

export async function sendBattleConditionsRecordToChannel(
  client: ToolsBotClient,
  guildId: string,
  channelId: string,
  record: BattleConditionsRecord,
): Promise<SendBattleConditionsRecordResult> {
  const guild = client.guilds.cache.get(guildId) ?? await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) {
    return { ok: false, reason: 'guild-unavailable' };
  }

  const channel = guild.channels.cache.get(channelId) ?? await guild.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased() || !('permissionsFor' in channel) || !isAllowedBattleConditionsTargetChannelType(channel.type)) {
    return { ok: false, reason: 'channel-unavailable' };
  }

  const botMember = guild.members.me ?? await guild.members.fetchMe().catch(() => null);
  const botPermissions = botMember ? channel.permissionsFor(botMember) : null;
  const requiredSendPermission = getBattleConditionsSendPermission(channel.type);
  if (!botPermissions?.has(PermissionFlagsBits.ViewChannel) || !botPermissions.has(requiredSendPermission)) {
    return { ok: false, reason: 'missing-permissions' };
  }

  const forwardPayload = await buildBattleConditionsSourcePayload(client, record);
  if (!forwardPayload) {
    return { ok: false, reason: 'source-payload-unavailable' };
  }

  const nonce = createHash('sha256').update([guildId, channelId, record.rank, record.tournamentDate, record.sourceMessageUpdatedAt].join(':')).digest('hex').slice(0, 24);
  const messageId = await sendWithBattleReceipt(nonce, () => (channel as GuildTextBasedChannel).send({ ...forwardPayload, nonce, enforceNonce: true }));
  return messageId ? { ok: true, messageId } : { ok: false, reason: 'delivery-uncertain' };
}