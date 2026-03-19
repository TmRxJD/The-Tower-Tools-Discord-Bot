import { SlashCommandBuilder } from 'discord.js';
import type { CommandModule } from '../core/command-types';
import type { ToolsBotClient } from '../core/tools-bot-client';
import { getBotConfig } from '../config/bot-config';

const reloadConfig = getBotConfig().commands.reload;

const data = new SlashCommandBuilder()
  .setName(reloadConfig.name)
  .setDescription(reloadConfig.description)
  .addStringOption(option =>
    option
      .setName(reloadConfig.options.command.name)
      .setDescription(reloadConfig.options.command.description)
      .setRequired(true)
  );

export const reloadCommand: CommandModule = {
  data: data.toJSON(),
  async execute(interaction) {
    if (!interaction.isChatInputCommand()) {
      return;
    }

    const commandName = interaction.options.getString(reloadConfig.options.command.name, true).toLowerCase();
    const client = interaction.client as ToolsBotClient;
    const command = client.commands.get(commandName);

    if (!command) {
      await interaction.reply({
        content: reloadConfig.notFoundTemplate.replace('{commandName}', commandName),
        ephemeral: true,
      });
      return;
    }

    await interaction.reply({
      content: reloadConfig.registeredTemplate.replace('{commandName}', commandName),
      ephemeral: true,
    });
  },
};
