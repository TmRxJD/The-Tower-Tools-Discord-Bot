import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { CommandModule } from '../core/command-types';
import { getBotConfig } from '../config/bot-config';

const userConfig = getBotConfig().commands.user;

const data = new SlashCommandBuilder()
  .setName(userConfig.name)
  .setDescription(userConfig.description);

export const userCommand: CommandModule = {
  data: data.toJSON(),
  async execute(interaction: ChatInputCommandInteraction) {
    const joinedAt = interaction.member && typeof interaction.member === 'object' && 'joinedAt' in interaction.member
      ? interaction.member.joinedAt
      : null;
    const joinedText = joinedAt ? joinedAt.toISOString() : userConfig.unknownDate;
    await interaction.reply({
      content: userConfig.responseTemplate
        .replace('{username}', interaction.user.username)
        .replace('{joinedText}', joinedText),
      ephemeral: true,
    });
  },
};
