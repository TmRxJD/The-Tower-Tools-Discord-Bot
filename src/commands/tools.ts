import { SlashCommandBuilder } from 'discord.js';
import { buildBotToolsHubDescription } from '@tmrxjd/platform/tools';
import { getBotConfig } from '../config/bot-config';
import { createChatInputCommand } from '../core/command-factory';
import { createCommandEmbed } from '../core/command-ui';

const toolsConfig = getBotConfig().commands.tools;
const toolsHubConfig = getBotConfig().common.toolsHub;

function createToolsEmbed(guildId?: string | null) {
  const description = buildBotToolsHubDescription(toolsHubConfig.siteUrl, guildId)

  return createCommandEmbed({
    title: toolsHubConfig.title,
    description,
    color: toolsHubConfig.embedColor,
    footerText: toolsHubConfig.footer,
    url: `${toolsHubConfig.siteUrl}${toolsHubConfig.toolsPath}`,
    includeTimestamp: false,
  });
}

const data = new SlashCommandBuilder()
  .setName(toolsConfig.name)
  .setDescription(toolsConfig.description);

export const toolsCommand = createChatInputCommand(
  data,
  async interaction => {
    const embed = createToolsEmbed(interaction.guildId);
    await interaction.reply({ embeds: [embed] });
  },
);
