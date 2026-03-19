import { ToolsBotClient } from '../core/tools-bot-client';
import type { MessageComponentInteraction } from 'discord.js';
import { handleStopReminderInteraction } from '../services/reminder-service';
import { getBotConfig } from '../config/bot-config';

const remindStopPrefix = getBotConfig().commands.remind.ids.stopPrefix;

export function registerComponentHandlers(client: ToolsBotClient) {
  client.components.register(remindStopPrefix, async interaction => {
    if (!interaction.isButton()) {
      return;
    }
    await handleStopReminderInteraction(interaction);
  });
}
