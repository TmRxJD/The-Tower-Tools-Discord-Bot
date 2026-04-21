import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { CommandModule } from '../core/command-types';
import { quoteText } from '../utils/acronym-expansion';
import { getBotConfig } from '../config/bot-config';
import { expandManagedAcronymsInText } from '../services/acronym-registry';

const defineConfig = getBotConfig().commands.define;

const data = new SlashCommandBuilder()
  .setName(defineConfig.name)
  .setDescription(defineConfig.description)
  .addStringOption(option =>
    option
      .setName(defineConfig.options.text.name)
      .setDescription(defineConfig.options.text.description)
      .setRequired(true)
  )
  .addBooleanOption(option =>
    option
      .setName(defineConfig.options.public.name)
      .setDescription(defineConfig.options.public.description)
      .setRequired(false)
  );

export const defineCommand: CommandModule = {
  data: data.toJSON(),
  async execute(interaction) {
    if (!interaction.isChatInputCommand()) {
      return;
    }

    const textInput = interaction.options.getString(defineConfig.options.text.name, true).trim();
    const isPublic = interaction.options.getBoolean(defineConfig.options.public.name) ?? false;
    const { text: expanded, changed } = await expandManagedAcronymsInText(textInput);

    const allowPublic = isPublic && changed;
    const ephemeral = !allowPublic;
    await interaction.deferReply({ ephemeral });

    const quoted = quoteText(textInput);
    if (!changed) {
      const content = quoted ? `${quoted}\n\n${defineConfig.noAcronyms}` : defineConfig.noAcronyms;
      await interaction.editReply({ content });
      return;
    }

    await interaction.editReply({ content: `${quoted}\n\n${expanded}` });
  },
};
