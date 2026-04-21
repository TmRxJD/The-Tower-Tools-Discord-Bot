import { PermissionFlagsBits, type PermissionsBitField } from 'discord.js';

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