import { Events } from 'discord.js';
import { ToolsBotClient } from '../core/tools-bot-client';
import { logger } from '../core/logger';
import { startBattleConditionsScheduler } from '../services/battle-conditions-scheduler';
import { startReminderScheduler } from '../services/reminder-scheduler';

export function registerEvents(client: ToolsBotClient) {
  client.once(Events.ClientReady, readyClient => {
    logger.info(`Ready! Logged in as ${readyClient.user.tag}`);
    startReminderScheduler(client);
    startBattleConditionsScheduler(client);
  });
}
