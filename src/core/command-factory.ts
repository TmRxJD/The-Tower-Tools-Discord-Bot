import { type ChatInputCommandInteraction, type RESTPostAPIApplicationCommandsJSONBody } from 'discord.js';
import type { CommandModule } from './command-types';

type ChatInputExecute = (interaction: ChatInputCommandInteraction) => Promise<void>;

export function createChatInputCommand(
  data: { toJSON: () => RESTPostAPIApplicationCommandsJSONBody },
  execute: ChatInputExecute,
): CommandModule {
  return {
    data: data.toJSON(),
    async execute(interaction) {
      if (!interaction.isChatInputCommand()) {
        return;
      }
      await execute(interaction);
    },
  };
}
