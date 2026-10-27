import { sendWithBattleReceipt } from './battle-delivery-receipt';
import { readLocalBattlePayload } from './battle-conditions-payload';
import { createHash } from 'node:crypto';
import { ChannelType, PermissionFlagsBits, type APIEmbed, type GuildTextBasedChannel, type MessageCreateOptions } from 'discord.js';
import type { ToolsBotClient } from '../core/tools-bot-client';
import type { BattleConditionsRecord } from './battle-conditions-cloud';
import { atOperationStage, failureDiagnostics } from './operation-diagnostics';

export type DestinationFailure = { ok: false; reason: 'guild-unavailable' | 'channel-unavailable' | 'missing-permissions' | 'source-payload-unavailable' | 'delivery-uncertain';
  stage?: string; classification?: 'invalid-destination' | 'inaccessible' | 'transient' | 'unknown' | 'uncertain'; code?: unknown; status?: unknown };

export type BattleConditionsSourcePayload = Pick<MessageCreateOptions, 'content' | 'embeds' | 'files' | 'allowedMentions'>;
export type SendBattleConditionsRecordResult =
  | { ok: true; messageId: string }
  | DestinationFailure;

function destinationFailure(reason: DestinationFailure['reason'], stage: string, error?: unknown): DestinationFailure {
  const diagnostics = failureDiagnostics(error);
  const code = diagnostics.code;
  const classification = code === 10004 || code === 10003 ? 'invalid-destination'
    : code === 50001 || code === 50013 || (!error && reason === 'missing-permissions') ? 'inaccessible'
    : diagnostics.status === 429 || (typeof diagnostics.status === 'number' && diagnostics.status >= 500)
      || diagnostics.causeCode || (typeof code === 'string' && /^(ECONN|ETIMEDOUT|ENOTFOUND|EAI_|UND_)/.test(code)) ? 'transient' : 'unknown';
  return { ok: false, reason, stage, classification, ...diagnostics };
}

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
  if (!client.isReady()) return { ok: false, reason: 'guild-unavailable', stage: 'client-ready', classification: 'transient' };
  let guild;
  try { guild = client.guilds.cache.get(guildId) ?? await client.guilds.fetch(guildId); }
  catch (error) { return destinationFailure('guild-unavailable', 'guild-fetch', error); }
  if (!guild) {
    return destinationFailure('guild-unavailable', 'guild-fetch');
  }
  if (guild.available === false) return { ok: false, reason: 'guild-unavailable', stage: 'guild-available', classification: 'transient' };

  let channel;
  try { channel = guild.channels.cache.get(channelId) ?? await guild.channels.fetch(channelId); }
  catch (error) { return destinationFailure('channel-unavailable', 'channel-fetch', error); }
  if (!channel || !channel.isTextBased() || !('permissionsFor' in channel) || !isAllowedBattleConditionsTargetChannelType(channel.type)) {
    return { ok: false, reason: 'channel-unavailable', stage: 'channel-validate', classification: 'invalid-destination' };
  }

  let botMember;
  try { botMember = guild.members.me ?? await guild.members.fetchMe(); }
  catch (error) { return destinationFailure('missing-permissions', 'member-fetch', error); }
  const botPermissions = botMember ? channel.permissionsFor(botMember) : null;
  const requiredSendPermission = getBattleConditionsSendPermission(channel.type);
  if (!botPermissions?.has(PermissionFlagsBits.ViewChannel) || !botPermissions.has(requiredSendPermission)) {
    return destinationFailure('missing-permissions', 'permission-check');
  }

  const forwardPayload = await atOperationStage('battle-delivery', 'source-payload', () => buildBattleConditionsSourcePayload(client, record));
  if (!forwardPayload) {
    return { ok: false, reason: 'source-payload-unavailable' };
  }

  const nonce = createHash('sha256').update([guildId, channelId, record.rank, record.tournamentDate, record.sourceMessageUpdatedAt].join(':')).digest('hex').slice(0, 24);
  const messageId = await atOperationStage('battle-delivery', 'send-receipt', () => sendWithBattleReceipt(nonce, () => (channel as GuildTextBasedChannel).send({ ...forwardPayload, nonce, enforceNonce: true })));
  return messageId ? { ok: true, messageId } : { ok: false, reason: 'delivery-uncertain', stage: 'send-receipt', classification: 'uncertain' };
}
