import type { ModalSubmitInteraction } from 'discord.js';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import type { ToolsBotClient } from '../core/tools-bot-client';
import { giveawayRepo } from '../persistence/repositories/giveaway.repo';
import { scheduleGiveawayEnd } from '../features/giveaway/giveaway-scheduler';
import { consumeGiveawaySponsorSession } from '../commands/giveaway';
import {
  GIVEAWAY_CREATE_MODAL_ID,
  GIVEAWAY_DURATION_FIELD_ID,
  GIVEAWAY_ENTER_BUTTON_PREFIX,
  GIVEAWAY_ENTRY_MODAL_PREFIX,
  GIVEAWAY_PLAYER_ID_FIELD_ID,
  GIVEAWAY_PRIZE_FIELD_ID,
  GIVEAWAY_REMOVE_BUTTON_PREFIX,
  GIVEAWAY_TITLE_FIELD_ID,
  GIVEAWAY_WINNERS_FIELD_ID,
  buildGiveawayEnterButtonCustomId,
  buildGiveawayEntryModalCustomId,
  buildGiveawayRemoveButtonCustomId,
  parseGiveawayEnterButtonCustomId,
  parseGiveawayEntryModalCustomId,
  parseGiveawayRemoveButtonCustomId,
} from '@tmrxjd/platform/tools';

function buildGiveawayActionRow(messageId: string) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(buildGiveawayEnterButtonCustomId(messageId))
      .setLabel('Enter')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(buildGiveawayRemoveButtonCustomId(messageId))
      .setLabel('Remove Entry')
      .setStyle(ButtonStyle.Secondary),
  );
}

export function registerGiveawayInteractions(client: ToolsBotClient): void {
  // Create giveaway modal
  client.components.registerModal(GIVEAWAY_CREATE_MODAL_ID, async (interaction: ModalSubmitInteraction) => {
    const title = interaction.fields.getTextInputValue(GIVEAWAY_TITLE_FIELD_ID);
    const prize = interaction.fields.getTextInputValue(GIVEAWAY_PRIZE_FIELD_ID);
    const winners = parseInt(interaction.fields.getTextInputValue(GIVEAWAY_WINNERS_FIELD_ID), 10);
    const durationInput = interaction.fields.getTextInputValue(GIVEAWAY_DURATION_FIELD_ID);

    let duration: number;
    let endTime: number;
    if (durationInput.trim().toLowerCase() === 'test') {
      duration = 0;
      endTime = Date.now() + 60 * 1000;
    } else {
      duration = parseInt(durationInput, 10);
      if (isNaN(duration) || duration < 1) {
        await interaction.reply({ content: 'Invalid duration. Please enter a number of days or "test".', ephemeral: true });
        return;
      }
      endTime = Date.now() + duration * 24 * 60 * 60 * 1000;
    }

    if (!title || !prize || isNaN(winners) || winners < 1) {
      await interaction.reply({ content: 'Invalid input. Please try again.', ephemeral: true });
      return;
    }
    if (!interaction.channelId) {
      await interaction.reply({ content: 'Giveaways can only be created from a guild text channel.', ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const sponsorId = consumeGiveawaySponsorSession(interaction.user.id) ?? interaction.user.id;

    const giveaway = await giveawayRepo.createGiveaway({
      title,
      prize,
      winners,
      duration,
      creatorId: interaction.user.id,
      sponsorId,
      channelId: interaction.channelId,
      messageId: '',
      endTime,
    });

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(`Prize: **${prize}**\nEnds: <t:${Math.floor(endTime / 1000)}:R>\nWinners: **${winners}**`)
      .addFields(
        { name: 'Entries', value: '0', inline: true },
        { name: 'Sponsored by', value: `<@${sponsorId}>`, inline: false },
      )
      .setTimestamp(Date.now());

    const channel = interaction.channel;
    if (!channel || !('send' in channel) || typeof channel.send !== 'function') {
      await interaction.editReply({ content: 'Could not send giveaway embed in this channel.' });
      return;
    }

    const msg = await channel.send({ embeds: [embed] });
    await giveawayRepo.updateGiveaway(giveaway.$id, { messageId: msg.id });
    await msg.edit({ components: [buildGiveawayActionRow(msg.id)] });
    await scheduleGiveawayEnd(client, { ...giveaway, messageId: msg.id });
    await interaction.editReply({ content: 'Giveaway created!' });
  });

  // Enter button — shows player ID modal
  client.components.register(GIVEAWAY_ENTER_BUTTON_PREFIX, async interaction => {
    if (!interaction.isButton()) return;
    const giveawayId = parseGiveawayEnterButtonCustomId(interaction.customId);
    if (!giveawayId) return;

    // Use the message ID as the giveaway lookup key — embed it in the modal custom ID
    // so we don't need an Appwrite round-trip before responding (Discord 3s deadline)
    const entryModal = new ModalBuilder()
      .setCustomId(buildGiveawayEntryModalCustomId(giveawayId))
      .setTitle('Enter Giveaway')
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId(GIVEAWAY_PLAYER_ID_FIELD_ID)
            .setLabel('Your Player ID')
            .setStyle(TextInputStyle.Short)
            .setMaxLength(64)
            .setRequired(true),
        ),
      );
    await interaction.showModal(entryModal);
  }, { kind: 'button', match: 'prefix' });

  // Entry modal submit
  client.components.registerModal(GIVEAWAY_ENTRY_MODAL_PREFIX, async (interaction: ModalSubmitInteraction) => {
    const giveawayId = parseGiveawayEntryModalCustomId(interaction.customId);
    if (!giveawayId) return;

    const playerId = interaction.fields.getTextInputValue(GIVEAWAY_PLAYER_ID_FIELD_ID).trim();
    if (!/^[0-9a-fA-F]+$/.test(playerId)) {
      await interaction.reply({ content: 'Invalid player ID. Must be a hex string.', ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const giveaway = await giveawayRepo.findByMessageId(giveawayId).catch(() => null);
    if (!giveaway) {
      await interaction.editReply({ content: 'Giveaway not found.' });
      return;
    }

    const existing = await giveawayRepo.findEntryForGiveaway(giveaway, interaction.user.id);
    if (existing) {
      await interaction.editReply({ content: 'You have already entered this giveaway.' });
      return;
    }

    await giveawayRepo.createEntry({
      giveawayId: giveaway.$id,
      giveawayMessageId: giveaway.messageId || undefined,
      userId: interaction.user.id,
      playerId,
    });

    const newEntries = (giveaway.entries ?? 0) + 1;
    await giveawayRepo.updateGiveaway(giveaway.$id, { entries: newEntries });

    // Update embed entry count
    try {
      const channel = await interaction.client.channels.fetch(giveaway.channelId);
      if (channel && 'messages' in channel) {
        const msg = await (channel as import('discord.js').TextChannel).messages.fetch(giveaway.messageId);
        if (msg && msg.embeds[0]) {
          const embed = EmbedBuilder.from(msg.embeds[0]);
          const fields = (embed.data.fields ?? []).map(f =>
            f.name === 'Entries' ? { ...f, value: String(newEntries) } : f,
          );
          embed.setFields(fields);
          await msg.edit({ embeds: [embed] });
        }
      }
    } catch {
      // best-effort embed update
    }

    await interaction.editReply({ content: 'You have successfully entered the giveaway!' });
  }, 'prefix');

  // Remove entry button
  client.components.register(GIVEAWAY_REMOVE_BUTTON_PREFIX, async interaction => {
    if (!interaction.isButton()) return;
    const giveawayId = parseGiveawayRemoveButtonCustomId(interaction.customId);
    if (!giveawayId) return;

    await interaction.deferReply({ ephemeral: true });

    const giveaway = await giveawayRepo.findByMessageId(interaction.message.id);
    if (!giveaway) {
      await interaction.editReply({ content: 'Giveaway not found.' });
      return;
    }

    const entry = await giveawayRepo.findEntryForGiveaway(giveaway, interaction.user.id);
    if (!entry) {
      await interaction.editReply({ content: 'You do not have an entry in this giveaway.' });
      return;
    }

    await giveawayRepo.deleteEntry(entry.$id);
    const newEntries = Math.max(0, (giveaway.entries ?? 1) - 1);
    await giveawayRepo.updateGiveaway(giveaway.$id, { entries: newEntries });

    // Update embed entry count
    try {
      const channel = await interaction.client.channels.fetch(giveaway.channelId);
      if (channel && 'messages' in channel) {
        const msg = await (channel as import('discord.js').TextChannel).messages.fetch(giveaway.messageId);
        if (msg && msg.embeds[0]) {
          const embed = EmbedBuilder.from(msg.embeds[0]);
          const fields = (embed.data.fields ?? []).map(f =>
            f.name === 'Entries' ? { ...f, value: String(newEntries) } : f,
          );
          embed.setFields(fields);
          await msg.edit({ embeds: [embed] });
        }
      }
    } catch {
      // best-effort embed update
    }

    await interaction.editReply({ content: 'Your entry has been removed.' });
  }, { kind: 'button', match: 'prefix' });
}
