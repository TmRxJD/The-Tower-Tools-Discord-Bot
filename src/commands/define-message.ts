import {
  ApplicationCommandType,
  ContextMenuCommandBuilder,
  type MessageContextMenuCommandInteraction,
} from 'discord.js';
import { expandAcronymsInText } from '@tmrxjd/platform/ai';
import type { CommandModule } from '../core/command-types';
import { quoteText } from '../utils/acronym-expansion';
import { getBotConfig } from '../config/bot-config';

const defineMessageConfig = getBotConfig().commands.defineMessage;

const data = new ContextMenuCommandBuilder()
  .setName(defineMessageConfig.name)
  .setType(ApplicationCommandType.Message);

export const defineMessageCommand: CommandModule = {
  data: data.toJSON(),
  async execute(interaction) {
    if (!interaction.isMessageContextMenuCommand()) {
      return;
    }

    const messageInteraction = interaction as MessageContextMenuCommandInteraction;
    const source = messageInteraction.targetMessage?.content ?? '';
    const { text: expanded, changed } = expandAcronymsInText(source);
    const quoted = quoteText(source);

    if (!changed) {
      await messageInteraction.reply({ content: quoted || defineMessageConfig.noAcronyms, ephemeral: true });
      return;
    }

    await messageInteraction.reply({ content: `${quoted}\n\n${expanded}`, ephemeral: true });
  },
};
