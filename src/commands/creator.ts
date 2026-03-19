import { EmbedBuilder, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { CommandModule } from '../core/command-types';
import { getBotConfig } from '../config/bot-config';
import { formatCreatorEntriesDescription, sortCreatorEntriesByCode } from '@tmrxjd/platform/tools';

const creatorConfig = getBotConfig().commands.creator;

const data = new SlashCommandBuilder()
  .setName(creatorConfig.name)
  .setDescription(creatorConfig.description);

export const creatorCommand: CommandModule = {
  data: data.toJSON(),
  async execute(interaction: ChatInputCommandInteraction) {
    const sortedCreators = sortCreatorEntriesByCode(creatorConfig.creators);
    const description = formatCreatorEntriesDescription(sortedCreators, creatorConfig.knownForPrefix);

    const embed = new EmbedBuilder()
      .setTitle(creatorConfig.title)
      .setDescription(description)
      .setColor(creatorConfig.color)
      .setFooter({ text: creatorConfig.footer });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
