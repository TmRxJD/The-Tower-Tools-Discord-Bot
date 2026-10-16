import { buildDefineResponse } from '../services/define-response';
import {
  ApplicationCommandType,
  ContextMenuCommandBuilder,
} from 'discord.js';
import type { CommandModule } from '../core/command-types';
import { quoteText } from '../utils/acronym-expansion';
import { getBotConfig } from '../config/bot-config';
import { expandManagedAcronymsInText } from '../services/acronym-registry';

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

    await interaction.deferReply({ ephemeral: true });
    const source = interaction.targetMessage?.content ?? '';
    const { text: expanded, changed } = await expandManagedAcronymsInText(source);
    const quoted = quoteText(source);

    if (!changed) {
      await interaction.editReply(buildDefineResponse(quoted || defineMessageConfig.noAcronyms));
      return;
    }

    await interaction.editReply(buildDefineResponse(`${quoted}\n\n${expanded}`));
  },
};
