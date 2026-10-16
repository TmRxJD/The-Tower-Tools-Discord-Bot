import {
  AutocompleteInteraction,
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
  autocomplete?: (interaction: AutocompleteInteraction) => Promise<void>;
  cooldownSeconds?: number;
  /** Skip the optional Appwrite identity lookup when the command does not use that mapping. */
  skipAppwriteIdentityResolution?: boolean;
}
