import { randomUUID } from 'node:crypto';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  EmbedBuilder,
  SlashCommandBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type GuildTextBasedChannel,
} from 'discord.js';
import type { CommandModule } from '../core/command-types';
import type { ToolsBotClient } from '../core/tools-bot-client';
import {
  applyAcronymMutation,
  getManagedAcronymPreview,
  normalizeAcronymKey,
  normalizeExpansionValue,
  saveAcronymProposal,
} from '../services/acronym-registry';
import type { AcronymProposalRecord } from '../services/idb';
import {
  ACRONYM_REVIEW_GUILD_ID,
  hasAcronymReviewGuildModerationPermission,
  isAcronymReviewGuild,
} from '../features/acronyms/acronym-permissions';
import {
  createAcronymRequestApproveCustomId,
  createAcronymRequestDenyCustomId,
} from '../features/acronyms/acronym-interaction-ids';

const REVIEW_TIMEOUT_MS = 60_000;
const COMMAND_NAME = 'acronym';
const OPTION_ACRONYM = 'acronym';
const OPTION_EXPANSION = 'expansion';
const SUBCOMMAND_ADD = 'add';
const SUBCOMMAND_REMOVE = 'remove';
const REVIEW_CONFIRM_PREFIX = 'acronym-review:confirm:';
const REVIEW_CANCEL_PREFIX = 'acronym-review:cancel:';
const COLOR_INFO = 0x3b82f6;
const COLOR_SUCCESS = 0x22c55e;
const COLOR_WARNING = 0xf59e0b;
const COLOR_DANGER = 0xef4444;

function buildReviewActionRow(confirmCustomId: string, cancelCustomId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(confirmCustomId).setLabel('Confirm').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(cancelCustomId).setLabel('Cancel').setStyle(ButtonStyle.Secondary),
  );
}

function buildHelpersActionRow(proposalId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(createAcronymRequestApproveCustomId(proposalId))
      .setLabel('Approve')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(createAcronymRequestDenyCustomId(proposalId))
      .setLabel('Deny')
      .setStyle(ButtonStyle.Danger),
  );
}

function buildStatusEmbed(title: string, description: string, color: number): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(color)
    .setTimestamp();
}

function buildReviewEmbed(input: {
  action: 'add' | 'remove';
  acronym: string;
  existingExpansion: string | null;
  nextExpansion: string | null;
  requiresApproval: boolean;
}): EmbedBuilder {
  const verb = input.action === SUBCOMMAND_ADD ? 'Add Acronym' : 'Remove Acronym';
  const embed = new EmbedBuilder()
    .setTitle(verb)
    .setColor(input.requiresApproval ? COLOR_WARNING : COLOR_INFO)
    .setDescription(
      input.requiresApproval
        ? 'Confirm to send this request to the helpers chat for moderator approval.'
        : 'Confirm to apply this change immediately.'
    )
    .addFields(
      { name: 'Action', value: input.action === SUBCOMMAND_ADD ? 'Add or update' : 'Remove', inline: true },
      { name: 'Acronym', value: input.acronym, inline: true },
    )
    .setTimestamp();

  if (input.existingExpansion) {
    embed.addFields({ name: 'Current Expansion', value: input.existingExpansion, inline: false });
  }

  if (input.nextExpansion) {
    embed.addFields({ name: 'New Expansion', value: input.nextExpansion, inline: false });
  }

  return embed;
}

function buildHelpersRequestEmbed(input: {
  action: 'add' | 'remove';
  acronym: string;
  requesterId: string;
  sourceGuildName: string;
  sourceChannelLabel: string;
  existingExpansion: string | null;
  nextExpansion: string | null;
}): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(input.action === SUBCOMMAND_ADD ? 'Acronym Add Request' : 'Acronym Remove Request')
    .setDescription('Moderator review required before this acronym change is applied.')
    .setColor(COLOR_WARNING)
    .addFields(
      { name: 'Requested By', value: `<@${input.requesterId}>`, inline: true },
      { name: 'Source Server', value: input.sourceGuildName, inline: true },
      { name: 'Source Channel', value: input.sourceChannelLabel, inline: true },
      { name: 'Acronym', value: input.acronym, inline: true },
    )
    .setTimestamp();

  if (input.existingExpansion) {
    embed.addFields({ name: 'Current Expansion', value: input.existingExpansion, inline: false });
  }

  if (input.nextExpansion) {
    embed.addFields({ name: 'Requested Expansion', value: input.nextExpansion, inline: false });
  }

  return embed;
}

function buildReviewExpiredEmbed(): EmbedBuilder {
  return buildStatusEmbed('Review Expired', 'This acronym review timed out. Run the command again if you still want to continue.', COLOR_WARNING);
}

function buildCancelledEmbed(): EmbedBuilder {
  return buildStatusEmbed('Review Cancelled', 'No acronym changes were made.', COLOR_WARNING);
}

function buildAppliedEmbed(action: 'add' | 'remove', acronym: string, expansion: string | null): EmbedBuilder {
  const description = action === SUBCOMMAND_ADD
    ? `Applied ${acronym} -> ${expansion ?? 'unknown expansion'}`
    : `Removed ${acronym} from the active acronym list.`;
  return buildStatusEmbed('Acronym Updated', description, COLOR_SUCCESS);
}

function buildSubmittedEmbed(requestUrl: string): EmbedBuilder {
  return buildStatusEmbed(
    'Approval Requested',
    `Your acronym request was submitted for moderator review. Request link: ${requestUrl}`,
    COLOR_INFO,
  );
}

function getHelpersRequestUrl(guildId: string, channelId: string, messageId: string): string {
  return `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;
}

async function awaitReviewChoice(
  interaction: ChatInputCommandInteraction,
  confirmCustomId: string,
  cancelCustomId: string,
): Promise<ButtonInteraction | null> {
  const reply = await interaction.fetchReply();
  if (!('awaitMessageComponent' in reply)) {
    return null;
  }

  try {
    return await reply.awaitMessageComponent({
      componentType: ComponentType.Button,
      filter: componentInteraction => (
        componentInteraction.user.id === interaction.user.id
        && (componentInteraction.customId === confirmCustomId || componentInteraction.customId === cancelCustomId)
      ),
      time: REVIEW_TIMEOUT_MS,
    });
  } catch {
    return null;
  }
}

export const acronymCommand: CommandModule = {
  data: new SlashCommandBuilder()
    .setName(COMMAND_NAME)
    .setDescription('Add or remove managed acronyms for /define')
    .addSubcommand(subcommand =>
      subcommand
        .setName(SUBCOMMAND_ADD)
        .setDescription('Add or update an acronym expansion')
        .addStringOption(option =>
          option
            .setName(OPTION_ACRONYM)
            .setDescription('Acronym to add or update')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName(OPTION_EXPANSION)
            .setDescription('Expansion text to use for this acronym')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName(SUBCOMMAND_REMOVE)
        .setDescription('Remove an acronym from the active list')
        .addStringOption(option =>
          option
            .setName(OPTION_ACRONYM)
            .setDescription('Acronym to remove')
            .setRequired(true)
        )
    )
    .toJSON(),
  async execute(interaction) {
    if (!interaction.isChatInputCommand()) {
      return;
    }

    if (!interaction.inGuild() || !interaction.guildId) {
      await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
      return;
    }

    const action = interaction.options.getSubcommand(true) as 'add' | 'remove';
    const normalizedAcronym = normalizeAcronymKey(interaction.options.getString(OPTION_ACRONYM, true));
    const requestedExpansion = action === SUBCOMMAND_ADD
      ? normalizeExpansionValue(interaction.options.getString(OPTION_EXPANSION, true))
      : null;

    if (!normalizedAcronym) {
      await interaction.reply({ content: 'Acronym text cannot be empty.', ephemeral: true });
      return;
    }

    if (action === SUBCOMMAND_ADD && !requestedExpansion) {
      await interaction.reply({ content: 'Expansion text cannot be empty.', ephemeral: true });
      return;
    }

    const preview = await getManagedAcronymPreview(action, normalizedAcronym, requestedExpansion ?? undefined);
    if (action === SUBCOMMAND_REMOVE && !preview.existingExpansion) {
      await interaction.reply({ content: `No active acronym entry exists for ${preview.acronym}.`, ephemeral: true });
      return;
    }

    if (action === SUBCOMMAND_ADD && preview.existingExpansion === preview.nextExpansion) {
      await interaction.reply({ content: `${preview.acronym} is already mapped to that expansion.`, ephemeral: true });
      return;
    }

    const canAutoApprove = await hasAcronymReviewGuildModerationPermission(interaction.client, interaction.user.id);
    const confirmCustomId = `${REVIEW_CONFIRM_PREFIX}${interaction.id}`;
    const cancelCustomId = `${REVIEW_CANCEL_PREFIX}${interaction.id}`;

    await interaction.reply({
      embeds: [buildReviewEmbed({ ...preview, requiresApproval: !canAutoApprove })],
      components: [buildReviewActionRow(confirmCustomId, cancelCustomId)],
      ephemeral: true,
    });

    const choice = await awaitReviewChoice(interaction, confirmCustomId, cancelCustomId);
    if (!choice) {
      await interaction.editReply({ embeds: [buildReviewExpiredEmbed()], components: [] }).catch(() => null);
      return;
    }

    if (choice.customId === cancelCustomId) {
      await choice.update({ embeds: [buildCancelledEmbed()], components: [] });
      return;
    }

    await choice.deferUpdate();

    if (canAutoApprove) {
      await applyAcronymMutation({
        action,
        acronym: preview.acronym,
        expansion: preview.nextExpansion,
        actorUserId: interaction.user.id,
      });
      await interaction.editReply({
        embeds: [buildAppliedEmbed(action, preview.acronym, preview.nextExpansion)],
        components: [],
      });
      return;
    }

    const client = interaction.client as ToolsBotClient;
    const helpersChannelId = client.appConfig.helpersChannelId ?? null;
    if (!helpersChannelId) {
      await interaction.editReply({
        embeds: [buildStatusEmbed('Approval Unavailable', 'HELPERS_CHANNEL_ID is not configured for ToolsBot, so this request cannot be submitted.', COLOR_DANGER)],
        components: [],
      });
      return;
    }

    const helpersChannel = await interaction.client.channels.fetch(helpersChannelId).catch(() => null);
    if (!helpersChannel || !helpersChannel.isTextBased() || !('guildId' in helpersChannel) || !isAcronymReviewGuild(helpersChannel.guildId)) {
      await interaction.editReply({
        embeds: [buildStatusEmbed('Approval Unavailable', `The configured helpers channel must be in the main acronym review server (${ACRONYM_REVIEW_GUILD_ID}).`, COLOR_DANGER)],
        components: [],
      });
      return;
    }

    const proposalId = randomUUID();
    const helpersTextChannel = helpersChannel as GuildTextBasedChannel;
    const requestMessage = await helpersTextChannel.send({
      embeds: [buildHelpersRequestEmbed({
        action,
        acronym: preview.acronym,
        requesterId: interaction.user.id,
        sourceGuildName: interaction.guild?.name ?? interaction.guildId,
        sourceChannelLabel: interaction.channel && 'name' in interaction.channel && typeof interaction.channel.name === 'string'
          ? `#${interaction.channel.name}`
          : `Channel ID: ${interaction.channelId}`,
        existingExpansion: preview.existingExpansion,
        nextExpansion: preview.nextExpansion,
      })],
      components: [buildHelpersActionRow(proposalId)],
    });

    const proposal: AcronymProposalRecord = {
      id: proposalId,
      guildId: interaction.guildId,
      requesterUserId: interaction.user.id,
      requestChannelId: interaction.channelId,
      helpersChannelId: helpersTextChannel.id,
      action,
      key: preview.acronym,
      expansion: preview.nextExpansion ?? undefined,
      existingExpansion: preview.existingExpansion ?? undefined,
      status: 'pending',
      createdAt: Date.now(),
      helpersMessageId: requestMessage.id,
    };
    await saveAcronymProposal(proposal);

    await interaction.editReply({
      embeds: [buildSubmittedEmbed(getHelpersRequestUrl(helpersTextChannel.guildId, helpersTextChannel.id, requestMessage.id))],
      components: [],
    });
  },
};