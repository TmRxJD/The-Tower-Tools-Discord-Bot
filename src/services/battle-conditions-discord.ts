import { ChannelType, PermissionFlagsBits, type APIEmbed, type GuildTextBasedChannel, type MessageCreateOptions } from 'discord.js';
import type { ToolsBotClient } from '../core/tools-bot-client';
import type { BattleConditionsRecord } from './battle-conditions-cloud';

export type BattleConditionsSourcePayload = Pick<MessageCreateOptions, 'content' | 'embeds' | 'files' | 'allowedMentions'>;
type BattleConditionsForwardFile = { attachment: string; name?: string };
export type SendBattleConditionsRecordResult =
  | { ok: true }
  | { ok: false; reason: 'guild-unavailable' | 'channel-unavailable' | 'missing-permissions' | 'source-payload-unavailable' };

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

async function fetchGuildMessage(
  client: ToolsBotClient,
  guildId: string,
  channelId: string,
  messageId: string,
) {
  const guild = client.guilds.cache.get(guildId) ?? await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) {
    return null;
  }

  const channel = guild.channels.cache.get(channelId) ?? await guild.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased() || !('messages' in channel)) {
    return null;
  }

  return channel.messages.fetch(messageId).catch(() => null);
}

function hasRenderableMessagePayload(message: { content: string; embeds: Array<unknown>; attachments: Map<unknown, unknown> | { size: number } }): boolean {
  return Boolean(message.content || message.embeds.length || message.attachments.size);
}

function buildPayload(content: string | undefined, embeds: APIEmbed[], files: BattleConditionsForwardFile[]): BattleConditionsSourcePayload | null {
  if (!content && embeds.length === 0 && files.length === 0) {
    return null;
  }

  return {
    content,
    embeds,
    files,
    allowedMentions: { parse: [] },
  };
}

function buildPayloadFromLiveMessage(message: {
  content: string;
  embeds: Array<{ toJSON: () => unknown }>;
  attachments: Map<unknown, { url: string; name: string | null }> | { values: () => Iterable<{ url: string; name: string | null }> };
}): BattleConditionsSourcePayload | null {
  const files = [...message.attachments.values()].map(attachment => ({
    attachment: attachment.url,
    name: attachment.name ?? undefined,
  }));

  return buildPayload(
    message.content || undefined,
    message.embeds.map(embed => embed.toJSON()) as APIEmbed[],
    files,
  );
}

function buildPayloadFromSnapshot(sourceMessage: Record<string, unknown>): BattleConditionsSourcePayload | null {
  const rawSnapshots = sourceMessage.messageSnapshots
  if (!rawSnapshots || typeof rawSnapshots !== 'object' || !('values' in rawSnapshots) || typeof rawSnapshots.values !== 'function') {
    return null
  }

  for (const snapshot of rawSnapshots.values() as Iterable<Record<string, unknown>>) {
    const snapshotMessage = (snapshot?.message ?? snapshot) as Record<string, unknown> | undefined
    if (!snapshotMessage) {
      continue
    }

    const embeds = Array.isArray(snapshotMessage.embeds)
      ? snapshotMessage.embeds as APIEmbed[]
      : []
    const attachments = Array.isArray(snapshotMessage.attachments)
      ? snapshotMessage.attachments
          .map(attachment => {
            if (!attachment || typeof attachment !== 'object') {
              return null
            }

            const typedAttachment = attachment as Record<string, unknown>
            const attachmentUrl = typeof typedAttachment.url === 'string'
              ? typedAttachment.url
              : typeof typedAttachment.proxyURL === 'string'
                ? typedAttachment.proxyURL
                : null

            if (!attachmentUrl) {
              return null
            }

            return {
              attachment: attachmentUrl,
              name: typeof typedAttachment.name === 'string' ? typedAttachment.name : undefined,
            } as BattleConditionsForwardFile
          })
          .filter((attachment): attachment is BattleConditionsForwardFile => attachment !== null)
      : []

    const payload = buildPayload(
      typeof snapshotMessage.content === 'string' && snapshotMessage.content.length > 0 ? snapshotMessage.content : undefined,
      embeds,
      attachments,
    )

    if (payload) {
      return payload
    }
  }

  return null
}

export async function buildBattleConditionsSourcePayload (
  client: ToolsBotClient,
  record: BattleConditionsRecord,
): Promise<BattleConditionsSourcePayload | null> {
  const sourceMessage = await fetchGuildMessage(client, record.sourceGuildId, record.sourceChannelId, record.sourceMessageId);
  if (!sourceMessage) {
    return null;
  }

  const livePayload = hasRenderableMessagePayload(sourceMessage)
    ? buildPayloadFromLiveMessage(sourceMessage)
    : null
  if (livePayload) {
    return livePayload
  }

  const snapshotPayload = buildPayloadFromSnapshot(sourceMessage as unknown as Record<string, unknown>)
  if (snapshotPayload) {
    return snapshotPayload
  }

  if (sourceMessage.reference?.guildId && sourceMessage.reference.channelId && sourceMessage.reference.messageId) {
    const referencedMessage = await fetchGuildMessage(
      client,
      sourceMessage.reference.guildId,
      sourceMessage.reference.channelId,
      sourceMessage.reference.messageId,
    );

    if (referencedMessage && hasRenderableMessagePayload(referencedMessage)) {
      return buildPayloadFromLiveMessage(referencedMessage)
    }
  }

  return null
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

  await (channel as GuildTextBasedChannel).send(forwardPayload);
  return { ok: true };
}