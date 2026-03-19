import {
  ChatInputCommandInteraction,
  MessageContextMenuCommandInteraction,
  RESTPostAPIApplicationCommandsJSONBody,
} from 'discord.js';

export type SupportedCommandInteraction = ChatInputCommandInteraction | MessageContextMenuCommandInteraction;
type ExecuteHandler<TInteraction extends SupportedCommandInteraction> = {
  bivarianceHack(interaction: TInteraction): Promise<void>;
}['bivarianceHack'];

export interface CommandModule<TInteraction extends SupportedCommandInteraction = SupportedCommandInteraction> {
  data: RESTPostAPIApplicationCommandsJSONBody;
  execute: ExecuteHandler<TInteraction>;
  cooldownSeconds?: number;
}
