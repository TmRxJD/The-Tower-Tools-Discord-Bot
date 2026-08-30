import { ToolsBotClient } from '../core/tools-bot-client';
import type { MessageComponentInteraction } from 'discord.js';
import { handleStopReminderInteraction } from '../services/reminder-service';
import { getBotConfig } from '../config/bot-config';
import { registerAcronymRequestInteractions } from './acronym-requests';
import { registerGiveawayInteractions } from './giveaway';

const remindStopPrefix = getBotConfig().commands.remind.ids.stopPrefix;

export function registerComponentHandlers(client: ToolsBotClient) {
  registerAcronymRequestInteractions(client);
  registerGiveawayInteractions(client);

  client.components.register(remindStopPrefix, async interaction => {
    if (!interaction.isButton()) {
      return;
    }
    await handleStopReminderInteraction(interaction);
  });
}
