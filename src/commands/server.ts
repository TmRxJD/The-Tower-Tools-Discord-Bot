import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { CommandModule } from '../core/command-types';
import { getBotConfig } from '../config/bot-config';

const serverConfig = getBotConfig().commands.server;

const data = new SlashCommandBuilder()
  .setName(serverConfig.name)
  .setDescription(serverConfig.description);

export const serverCommand: CommandModule = {
  data: data.toJSON(),
  async execute(interaction: ChatInputCommandInteraction) {
    const guildName = interaction.guild?.name ?? serverConfig.unknownServer;
    const memberCount = interaction.guild?.memberCount ?? 0;
    await interaction.reply({
      content: serverConfig.responseTemplate
        .replace('{guildName}', guildName)
        .replace('{memberCount}', String(memberCount)),
      ephemeral: true,
    });
  },
};
