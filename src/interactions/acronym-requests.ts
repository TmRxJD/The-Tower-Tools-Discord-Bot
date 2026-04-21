import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
} from 'discord.js';
import type { ToolsBotClient } from '../core/tools-bot-client';
import { hasAcronymModerationPermission } from '../features/acronyms/acronym-permissions';
import {
  ACRONYM_REQUEST_APPROVE_PREFIX,
  ACRONYM_REQUEST_DENY_PREFIX,
  createAcronymRequestApproveCustomId,
  createAcronymRequestDenyCustomId,
  parseAcronymRequestApproveCustomId,
  parseAcronymRequestDenyCustomId,
} from '../features/acronyms/acronym-interaction-ids';
import {
  applyAcronymMutation,
  getAcronymProposal,
  updateAcronymProposalStatus,
} from '../services/acronym-registry';
import { logger } from '../core/logger';

const COLOR_SUCCESS = 0x22c55e;
const COLOR_DANGER = 0xef4444;

function buildDisabledActionRow(proposalId: string, approved: boolean): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(createAcronymRequestApproveCustomId(proposalId))
      .setLabel(approved ? 'Approved' : 'Approve')
      .setStyle(ButtonStyle.Success)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(createAcronymRequestDenyCustomId(proposalId))
      .setLabel(approved ? 'Deny' : 'Denied')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(true),
  );
}

function buildResolvedEmbed(source: EmbedBuilder, reviewerId: string, status: 'approved' | 'denied'): EmbedBuilder {
  const resolvedEmbed = EmbedBuilder.from(source);
  const keptFields = (resolvedEmbed.data.fields ?? []).filter(field => field.name !== 'Status' && field.name !== 'Reviewed By');
  resolvedEmbed.setFields(keptFields);
  resolvedEmbed.addFields(
    { name: 'Status', value: status === 'approved' ? 'Approved' : 'Denied', inline: true },
    { name: 'Reviewed By', value: `<@${reviewerId}>`, inline: true },
  );
  resolvedEmbed.setColor(status === 'approved' ? COLOR_SUCCESS : COLOR_DANGER);
  return resolvedEmbed;
}

async function handleResolution(interaction: Parameters<ToolsBotClient['components']['registerButton']>[1] extends (arg: infer T) => Promise<void> ? T : never, status: 'approved' | 'denied') {
  if (!interaction.inGuild()) {
    await interaction.reply({ content: 'This action can only be used in a server.', ephemeral: true });
    return;
  }

  if (!hasAcronymModerationPermission(interaction.memberPermissions)) {
    await interaction.reply({ content: 'You do not have permission to approve acronym requests.', ephemeral: true });
    return;
  }

  const proposalId = status === 'approved'
    ? parseAcronymRequestApproveCustomId(interaction.customId)
    : parseAcronymRequestDenyCustomId(interaction.customId);
  const proposal = await getAcronymProposal(proposalId);

  if (!proposal) {
    await interaction.reply({ content: 'That acronym request no longer exists.', ephemeral: true });
    return;
  }

  if (proposal.status !== 'pending') {
    await interaction.reply({ content: `This acronym request was already ${proposal.status}.`, ephemeral: true });
    return;
  }

  await interaction.deferUpdate();

  if (status === 'approved') {
    await applyAcronymMutation({
      action: proposal.action,
      acronym: proposal.key,
      expansion: proposal.expansion ?? null,
      actorUserId: interaction.user.id,
    });
  }

  const updatedProposal = await updateAcronymProposalStatus({
    proposalId,
    status,
    reviewedByUserId: interaction.user.id,
  });

  const baseEmbed = interaction.message.embeds[0]
    ? EmbedBuilder.from(interaction.message.embeds[0])
    : new EmbedBuilder().setTitle('Acronym Request');
  const resolvedEmbed = buildResolvedEmbed(baseEmbed, interaction.user.id, status);
  await interaction.editReply({
    embeds: [resolvedEmbed],
    components: [buildDisabledActionRow(proposalId, status === 'approved')],
  });

  const replyText = status === 'approved'
    ? `Approved ${proposal.key} and updated the active acronym list.`
    : `Denied the request for ${proposal.key}.`;
  await interaction.followUp({ content: replyText, flags: MessageFlags.Ephemeral }).catch(() => null);

  if (!updatedProposal) {
    logger.warn(`Acronym proposal ${proposalId} disappeared while processing ${status}.`);
  }
}

export function registerAcronymRequestInteractions(client: ToolsBotClient) {
  client.components.registerButton(ACRONYM_REQUEST_APPROVE_PREFIX, interaction => handleResolution(interaction, 'approved'), 'prefix');
  client.components.registerButton(ACRONYM_REQUEST_DENY_PREFIX, interaction => handleResolution(interaction, 'denied'), 'prefix');
}