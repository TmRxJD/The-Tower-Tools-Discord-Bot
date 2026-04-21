import { PermissionFlagsBits, type Client, type PermissionsBitField } from 'discord.js';

export const ACRONYM_REVIEW_GUILD_ID = '850137217828388904';

const ACRONYM_MODERATION_PERMISSIONS = [
  PermissionFlagsBits.Administrator,
  PermissionFlagsBits.ManageGuild,
  PermissionFlagsBits.ManageMessages,
  PermissionFlagsBits.ModerateMembers,
] as const;

export function hasAcronymModerationPermission(
  permissions: Readonly<PermissionsBitField> | null | undefined,
): boolean {
  return ACRONYM_MODERATION_PERMISSIONS.some(permission => permissions?.has(permission));
}

export function isAcronymReviewGuild(guildId: string | null | undefined): boolean {
  return guildId === ACRONYM_REVIEW_GUILD_ID;
}

export async function hasAcronymReviewGuildModerationPermission(
  client: Client,
  userId: string,
): Promise<boolean> {
  const guild = client.guilds.cache.get(ACRONYM_REVIEW_GUILD_ID) ?? await client.guilds.fetch(ACRONYM_REVIEW_GUILD_ID).catch(() => null);
  if (!guild) {
    return false;
  }

  const member = guild.members.cache.get(userId) ?? await guild.members.fetch(userId).catch(() => null);
  if (!member) {
    return false;
  }

  return hasAcronymModerationPermission(member.permissions);
}