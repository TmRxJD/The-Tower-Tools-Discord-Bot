import {
  ActionRowBuilder,
  type APIEmbed,
  type APIEmbedField,
  type ChatInputCommandInteraction,
  ModalBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextChannel,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import type { CommandModule } from '../core/command-types';
import type { ToolsBotClient } from '../core/tools-bot-client';
import { endSingleGiveaway } from '../features/giveaway/giveaway-end-single';
import {
  GIVEAWAY_CREATE_MODAL_ID,
  GIVEAWAY_DURATION_FIELD_ID,
  GIVEAWAY_PRIZE_FIELD_ID,
  GIVEAWAY_TITLE_FIELD_ID,
  GIVEAWAY_WINNERS_FIELD_ID,
} from '@tmrxjd/platform/tools';
import { type GiveawayEntry, giveawayRepo } from '../persistence/repositories/giveaway.repo';

const SPONSOR_SESSION_TTL_MS = 10 * 60 * 1000;
const sponsorSessionMap = new Map<string, { sponsorId: string; expiresAt: number }>();

export function setGiveawaySponsorSession(userId: string, sponsorId: string): void {
  sponsorSessionMap.set(userId, { sponsorId, expiresAt: Date.now() + SPONSOR_SESSION_TTL_MS });
}

export function consumeGiveawaySponsorSession(userId: string): string | undefined {
  const session = sponsorSessionMap.get(userId);
  if (!session) return undefined;
  sponsorSessionMap.delete(userId);
  if (Date.now() > session.expiresAt) return undefined;
  return session.sponsorId;
}

type GiveawayInteraction = ChatInputCommandInteraction;

async function handleReroll(interaction: GiveawayInteraction): Promise<void> {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({ content: 'You do not have permission to reroll giveaways.', ephemeral: true });
    return;
  }

  const messageId = interaction.options.getString('message-id', true);
  const targetUser = interaction.options.getUser('user', false);

  await interaction.deferReply({ ephemeral: true });

  const giveaway = await giveawayRepo.findByMessageId(messageId);
  if (!giveaway) {
    await interaction.editReply({ content: 'Giveaway not found for that message id.' });
    return;
  }

  const entriesRes = await giveawayRepo.getEntriesForGiveaway(giveaway);
  const uniqueEntries: GiveawayEntry[] = Array.from(
    new Map(entriesRes.documents.map((e: GiveawayEntry) => [e.playerId, e])).values(),
  );
  const entrants = uniqueEntries.map((e: GiveawayEntry) => ({ userId: e.userId, playerId: e.playerId }));

  const pickWinners = (excludeIds: string[], count: number) => {
    const pool = entrants.filter(e => !excludeIds.includes(e.userId));
    return pool.sort(() => Math.random() - 0.5).slice(0, count).map(e => e.userId);
  };

  let newWinnerIds: string[] = [...(giveaway.winnerIds || [])];
  if (targetUser) {
    if (!newWinnerIds.includes(targetUser.id)) {
      await interaction.editReply({ content: 'That user is not a winner for this giveaway.' });
      return;
    }
    const exclude = new Set(newWinnerIds);
    exclude.add(targetUser.id);
    const replacement = pickWinners(Array.from(exclude), 1);
    if (replacement.length === 0) {
      await interaction.editReply({ content: 'No eligible replacement found.' });
      return;
    }
    const index = newWinnerIds.indexOf(targetUser.id);
    newWinnerIds[index] = replacement[0];
  } else {
    const exclude = giveaway.winnerIds || [];
    const replacements = pickWinners(exclude, giveaway.winners || 1);
    if (replacements.length === 0) {
      await interaction.editReply({ content: 'No eligible replacements found for reroll.' });
      return;
    }
    newWinnerIds = replacements;
  }

  await giveawayRepo.updateGiveaway(giveaway.$id, { winnerIds: newWinnerIds });

  try {
    const channel = await interaction.client.channels.fetch(giveaway.channelId);
    if (channel && channel instanceof TextChannel) {
      const msg = await channel.messages.fetch(giveaway.messageId);
      if (msg) {
        const apiEmbed = msg.embeds[0] as APIEmbed | undefined;
        if (apiEmbed) {
          const fields = (apiEmbed.fields || []).filter((f: APIEmbedField) => f.name !== 'Winners');
          fields.push({
            name: 'Winners',
            value: newWinnerIds.length ? newWinnerIds.map(id => `<@${id}>`).join(', ') : 'No winners',
            inline: false,
          } as APIEmbedField);
          const newEmbed: APIEmbed = { ...apiEmbed, fields };
          await msg.edit({ embeds: [newEmbed] });
        }
      }
      await channel.send({
        content: `🔁 Giveaway rerolled! New winners: ${newWinnerIds.length ? newWinnerIds.map(id => `<@${id}>`).join(', ') : 'No winners'}`,
      });
    }
  } catch {
    // best-effort announce
  }

  await interaction.editReply({ content: `Rerolled winners: ${newWinnerIds.map(id => `<@${id}>`).join(', ')}` });
}

async function handlePick(interaction: GiveawayInteraction, client: ToolsBotClient): Promise<void> {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({ content: 'You do not have permission to pick giveaway winners.', ephemeral: true });
    return;
  }

  const messageId = interaction.options.getString('message-id', true);
  await interaction.deferReply({ ephemeral: true });

  const giveaway = await giveawayRepo.findByMessageId(messageId);
  if (!giveaway) {
    await interaction.editReply({ content: 'Giveaway not found for that message id.' });
    return;
  }

  await endSingleGiveaway(client, giveaway.$id);

  const refreshed = await giveawayRepo.getGiveaway(giveaway.$id).catch(() => null);
  if (!refreshed) {
    await interaction.editReply({ content: 'Giveaway could not be reloaded after picking winners.' });
    return;
  }

  if (refreshed.announcementSent) {
    const winners = refreshed.winnerIds?.length ? refreshed.winnerIds.map(id => `<@${id}>`).join(', ') : 'No winners';
    await interaction.editReply({ content: `Giveaway processed. Winners: ${winners}` });
    return;
  }

  if (refreshed.winnerIds?.length) {
    await interaction.editReply({
      content: `Winners were selected (${refreshed.winnerIds.map(id => `<@${id}>`).join(', ')}), but the channel announcement still failed. The scheduler will retry automatically.`,
    });
    return;
  }

  await interaction.editReply({
    content: 'No winners were selected. Check whether the giveaway has entries and whether its end time has passed.',
  });
}

async function handleStatus(interaction: GiveawayInteraction): Promise<void> {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({ content: 'You do not have permission to inspect giveaway status.', ephemeral: true });
    return;
  }

  const messageId = interaction.options.getString('message-id', true);
  await interaction.deferReply({ ephemeral: true });

  const giveaway = await giveawayRepo.findByMessageId(messageId);
  if (!giveaway) {
    await interaction.editReply({ content: 'Giveaway not found for that message id.' });
    return;
  }

  const entries = await giveawayRepo.getEntriesForGiveaway(giveaway);
  const uniqueEntries: GiveawayEntry[] = Array.from(
    new Map(entries.documents.map((e: GiveawayEntry) => [e.playerId, e])).values(),
  );
  const endTime = Number(giveaway.endTime);
  const normalizedEndTime = endTime > 0 && endTime < 1e12 ? endTime * 1000 : endTime;
  const storedWinners = giveaway.winnerIds?.length ? giveaway.winnerIds.map(id => `<@${id}>`).join(', ') : 'None';
  const sponsorInfo = giveaway.sponsorId ? `<@${giveaway.sponsorId}>` : `<@${giveaway.creatorId}>`;

  await interaction.editReply({
    content: [
      `Giveaway: **${giveaway.title}**`,
      `Prize: **${giveaway.prize}**`,
      `Sponsor: ${sponsorInfo}`,
      `Giveaway ID: \`${giveaway.$id}\``,
      `Message ID: \`${giveaway.messageId}\``,
      `Channel ID: \`${giveaway.channelId}\``,
      `Configured winners: **${giveaway.winners}**`,
      `Stored entries: **${giveaway.entries ?? entries.total ?? entries.documents.length}**`,
      `Unique player entries: **${uniqueEntries.length}**`,
      `End time: <t:${Math.floor(normalizedEndTime / 1000)}:F>`,
      `Ended: **${normalizedEndTime <= Date.now() ? 'yes' : 'no'}**`,
      `Announcement sent: **${giveaway.announcementSent ? 'yes' : 'no'}**`,
      `Stored winners: ${storedWinners}`,
    ].join('\n'),
  });
}

export const giveawayCommand: CommandModule = {
  data: new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Create or manage giveaways')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
      sub
        .setName('create')
        .setDescription('Create a new giveaway')
        .addUserOption(o =>
          o
            .setName('sponsor')
            .setDescription('User to credit as the sponsor (defaults to you)')
            .setRequired(false),
        ),
    )
    .addSubcommand(sub =>
      sub
        .setName('reroll')
        .setDescription('Reroll giveaway winners')
        .addStringOption(o => o.setName('message-id').setDescription('The giveaway message id').setRequired(true))
        .addUserOption(o => o.setName('user').setDescription('Specific winner to replace').setRequired(false)),
    )
    .addSubcommand(sub =>
      sub
        .setName('pick')
        .setDescription('Manually pick and announce giveaway winners from the original giveaway post')
        .addStringOption(o =>
          o.setName('message-id').setDescription('The original giveaway message id').setRequired(true),
        ),
    )
    .addSubcommand(sub =>
      sub
        .setName('status')
        .setDescription('Show persisted giveaway status from the original giveaway post')
        .addStringOption(o =>
          o.setName('message-id').setDescription('The original giveaway message id').setRequired(true),
        ),
    )
    .toJSON(),
  async execute(interaction) {
    if (!interaction.isChatInputCommand()) return;

    const sub = interaction.options.getSubcommand(false);
    if (!sub || sub === 'create') {
      const sponsorUser = interaction.options.getUser('sponsor', false);
      const sponsorId = sponsorUser?.id ?? interaction.user.id;
      setGiveawaySponsorSession(interaction.user.id, sponsorId);

      const modal = new ModalBuilder()
        .setCustomId(GIVEAWAY_CREATE_MODAL_ID)
        .setTitle('Create Giveaway')
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId(GIVEAWAY_TITLE_FIELD_ID)
              .setLabel('Giveaway Title')
              .setStyle(TextInputStyle.Short)
              .setMaxLength(100)
              .setRequired(true),
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId(GIVEAWAY_PRIZE_FIELD_ID)
              .setLabel('Prize')
              .setStyle(TextInputStyle.Short)
              .setMaxLength(100)
              .setRequired(true),
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId(GIVEAWAY_WINNERS_FIELD_ID)
              .setLabel('Number of Winners')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('e.g. 3')
              .setRequired(true),
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId(GIVEAWAY_DURATION_FIELD_ID)
              .setLabel('Duration (days)')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('e.g. 7 or "test"')
              .setRequired(true),
          ),
        );
      await interaction.showModal(modal);
      return;
    }

    if (sub === 'reroll') {
      await handleReroll(interaction);
      return;
    }

    if (sub === 'pick') {
      await handlePick(interaction, interaction.client as ToolsBotClient);
      return;
    }

    if (sub === 'status') {
      await handleStatus(interaction);
    }
  },
};
