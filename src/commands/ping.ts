import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { CommandModule } from '../core/command-types';
import { getBotConfig } from '../config/bot-config';

const pingConfig = getBotConfig().commands.ping;

const data = new SlashCommandBuilder()
  .setName(pingConfig.name)
  .setDescription(pingConfig.description);

export const pingCommand: CommandModule = {
  data: data.toJSON(),
  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.reply({ content: pingConfig.reply, ephemeral: true });
  },
};
