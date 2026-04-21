import {
  battleConditionsRankOrAllSchema,
  battleConditionsRankOrder,
  battleConditionsSourceGuildId,
  getBattleConditionsRankConfig,
} from '@tmrxjd/platform/tools';
import {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type AutocompleteInteraction,
} from 'discord.js';
import type { CommandModule } from '../core/command-types';
import {
  getBattleConditionsByDate,
  getLatestBattleConditions,
  listRecentBattleConditions,
} from '../services/battle-conditions-cloud';
import {
  buildBattleConditionsSourcePayload,
  sendBattleConditionsRecordToChannel,
  type SendBattleConditionsRecordResult,
} from '../services/battle-conditions-discord';
import {
  getBattleConditionsSubscription,
  updateBattleConditionsSubscriptionChannels,
} from '../services/battle-conditions-db';

const COMMAND_NAME = 'battle_conditions';
const SUBCOMMAND_VIEW = 'view';
const SUBCOMMAND_SETUP = 'setup';
const OPTION_RANK = 'rank';
const OPTION_DATE = 'date';
const OPTION_PUBLIC = 'public';
const OPTION_CHANNEL = 'channel';

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

type LocalBattleConditionsRank = 'legends' | 'champ' | 'plat' | 'gold' | 'silver';
type LocalBattleConditionsRankOrAll = LocalBattleConditionsRank | 'all';

function isBattleConditionsModerator(permissions: Readonly<{ has: (permission: bigint) => boolean }> | null | undefined): boolean {
  return permissions?.has(PermissionFlagsBits.Administrator)
    || permissions?.has(PermissionFlagsBits.ManageGuild)
    || permissions?.has(PermissionFlagsBits.ManageChannels)
    || permissions?.has(PermissionFlagsBits.ManageMessages)
    || permissions?.has(PermissionFlagsBits.ModerateMembers)
    || false;
}

function parseRankValue(value: string): LocalBattleConditionsRank {
  return value as LocalBattleConditionsRank;
}

function parseRankOrAllValue(value: string): LocalBattleConditionsRankOrAll {
  return battleConditionsRankOrAllSchema.parse(value) as LocalBattleConditionsRankOrAll;
}

function getRankChoices() {
  return (battleConditionsRankOrder as LocalBattleConditionsRank[]).map(rank => ({
    name: getBattleConditionsRankConfig(rank).label,
    value: rank,
  }));
}

function getSetupRankChoices() {
  return [
    { name: 'All Ranks', value: 'all' },
    ...getRankChoices(),
  ];
}

function formatSubscriptionSummary(subscription: Awaited<ReturnType<typeof getBattleConditionsSubscription>>): string {
  if (!subscription) {
    return 'No repost channels are configured yet.';
  }

  const lines = (battleConditionsRankOrder as LocalBattleConditionsRank[])
    .map(rank => {
      const channelId = subscription.channels[rank];
      return `${getBattleConditionsRankConfig(rank).label}: ${channelId ? `<#${channelId}>` : 'not configured'}`;
    });

  return lines.join('\n');
}

function getConfiguredRanks(rank: LocalBattleConditionsRankOrAll): LocalBattleConditionsRank[] {
  if (rank === 'all') {
    return [...battleConditionsRankOrder] as LocalBattleConditionsRank[];
  }

  return [rank];
}

function formatValidationStatus(result: SendBattleConditionsRecordResult): string {
  if (result.ok) {
    return 'posted latest entry successfully';
  }

  switch (result.reason) {
    case 'guild-unavailable':
      return 'server could not be resolved';
    case 'channel-unavailable':
      return 'channel could not be resolved as a text channel';
    case 'missing-permissions':
      return 'bot is missing channel permissions';
    case 'source-payload-unavailable':
      return 'latest stored entry exists, but the original Discord payload could not be reconstructed';
  }
}

async function autocompleteDates(interaction: AutocompleteInteraction) {
  const rankValue = interaction.options.getString(OPTION_RANK);
  if (!rankValue) {
    await interaction.respond([]);
    return;
  }

  const rank = parseRankValue(rankValue);
  const focused = interaction.options.getFocused().trim().toLowerCase();
  const records = await listRecentBattleConditions(rank, 25);
  const choices = records
    .map(record => record.tournamentDate)
    .filter((value, index, array) => array.indexOf(value) === index)
    .filter(value => !focused || value.toLowerCase().includes(focused))
    .slice(0, 25)
    .map(value => ({ name: value, value }));

  await interaction.respond(choices);
}

export const battleConditionsCommand: CommandModule = {
  data: new SlashCommandBuilder()
    .setName(COMMAND_NAME)
    .setDescription('View and configure battle condition reposts')
    .addSubcommand(subcommand =>
      subcommand
        .setName(SUBCOMMAND_VIEW)
        .setDescription('View battle conditions for a rank')
        .addStringOption(option =>
          option
            .setName(OPTION_RANK)
            .setDescription('League rank to view')
            .setRequired(true)
            .addChoices(...getRankChoices())
        )
        .addStringOption(option =>
          option
            .setName(OPTION_DATE)
            .setDescription('Tournament date to view, defaults to the latest available')
            .setRequired(false)
            .setAutocomplete(true)
        )
        .addBooleanOption(option =>
          option
            .setName(OPTION_PUBLIC)
            .setDescription('Show the result publicly instead of ephemerally')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName(SUBCOMMAND_SETUP)
        .setDescription('Configure repost channels for this server')
        .addStringOption(option =>
          option
            .setName(OPTION_RANK)
            .setDescription('Rank to configure, or all ranks')
            .setRequired(true)
            .addChoices(...getSetupRankChoices())
        )
        .addChannelOption(option =>
          option
            .setName(OPTION_CHANNEL)
            .setDescription('Channel that should receive reposts')
            .setRequired(true)
            .addChannelTypes(
              ChannelType.GuildText,
              ChannelType.GuildAnnouncement,
              ChannelType.PublicThread,
              ChannelType.AnnouncementThread,
              ChannelType.PrivateThread,
            )
        )
    )
    .toJSON(),
  async autocomplete(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const focusedOption = interaction.options.getFocused(true);

    if (subcommand === SUBCOMMAND_VIEW && focusedOption.name === OPTION_DATE) {
      await autocompleteDates(interaction);
      return;
    }

    await interaction.respond([]);
  },
  async execute(interaction) {
    if (!interaction.isChatInputCommand()) {
      return;
    }

    const subcommand = interaction.options.getSubcommand(true);
    if (subcommand === SUBCOMMAND_VIEW) {
      const rank = parseRankValue(interaction.options.getString(OPTION_RANK, true));
      const tournamentDate = interaction.options.getString(OPTION_DATE);
      const isPublic = interaction.options.getBoolean(OPTION_PUBLIC) ?? false;
      const record = tournamentDate
        ? await getBattleConditionsByDate(rank, tournamentDate)
        : await getLatestBattleConditions(rank);

      if (!record) {
        await interaction.reply({ content: 'No battle conditions were found for that selection.', ephemeral: true });
        return;
      }

      const sourcePayload = await buildBattleConditionsSourcePayload(interaction.client as unknown as import('../core/tools-bot-client').ToolsBotClient, record);
      if (!sourcePayload) {
        await interaction.reply({
          content: 'The original battle conditions message could not be reconstructed exactly from Discord source data.',
          ephemeral: true,
        });
        return;
      }

      await interaction.reply({ ...sourcePayload, ephemeral: !isPublic });
      return;
    }

    if (!interaction.inGuild() || !interaction.guildId) {
      await interaction.reply({ content: 'This command can only be configured from a server.', ephemeral: true });
      return;
    }

    const guild = interaction.guild;
    if (!guild) {
      await interaction.reply({ content: 'This command can only be configured from a server.', ephemeral: true });
      return;
    }

    if (!isBattleConditionsModerator(interaction.memberPermissions)) {
      await interaction.reply({ content: 'Ask a moderator to configure channels for this command.', ephemeral: true });
      return;
    }

    if (interaction.guildId === battleConditionsSourceGuildId) {
      await interaction.reply({ content: 'Battle condition repost channels cannot be configured in the source guild.', ephemeral: true });
      return;
    }

    const rank = parseRankOrAllValue(interaction.options.getString(OPTION_RANK, true));
    const selectedChannel = interaction.options.getChannel(OPTION_CHANNEL, true);
    const channel = guild.channels.cache.get(selectedChannel.id) ?? await guild.channels.fetch(selectedChannel.id).catch(() => null);

    if (!channel || !isAllowedBattleConditionsTargetChannelType(channel.type)) {
      await interaction.reply({ content: 'Select a text channel or thread in this server.', ephemeral: true });
      return;
    }

    const requiredSendPermission = getBattleConditionsSendPermission(channel.type);
    const userPermissions = channel.permissionsFor(interaction.user.id);
    const botPermissions = guild.members.me ? channel.permissionsFor(guild.members.me) : null;
    if (!userPermissions?.has(PermissionFlagsBits.ViewChannel) || !botPermissions?.has(PermissionFlagsBits.ViewChannel) || !botPermissions.has(requiredSendPermission)) {
      await interaction.reply({ content: 'Both you and the bot must be able to access and post in that channel or thread.', ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const updated = await updateBattleConditionsSubscriptionChannels({
      guildId: interaction.guildId,
      rank,
      channelId: channel.id,
    });

    const validationLines: string[] = [];
    for (const configuredRank of getConfiguredRanks(rank)) {
      const latestRecord = await getLatestBattleConditions(configuredRank);
      if (!latestRecord) {
        validationLines.push(`${getBattleConditionsRankConfig(configuredRank).label}: no stored battle conditions found to validate with yet.`);
        continue;
      }

      const validationResult = await sendBattleConditionsRecordToChannel(
        interaction.client as unknown as import('../core/tools-bot-client').ToolsBotClient,
        interaction.guildId,
        channel.id,
        latestRecord,
      );
      validationLines.push(`${getBattleConditionsRankConfig(configuredRank).label}: ${formatValidationStatus(validationResult)}.`);
    }

    await interaction.editReply({
      content: [
        `Updated battle condition repost channels for ${rank === 'all' ? 'all ranks' : getBattleConditionsRankConfig(rank).label}.`,
        '',
        formatSubscriptionSummary(updated),
        '',
        'Validation:',
        ...validationLines,
      ].join('\n'),
    });
  },
};