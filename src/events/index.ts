import { Events } from 'discord.js';
import { ToolsBotClient } from '../core/tools-bot-client';
import { logger } from '../core/logger';
import { startBattleConditionsBridgeServer } from '../services/battle-conditions-bridge';
import { startBattleConditionsScheduler } from '../services/battle-conditions-scheduler';
import { startReminderScheduler } from '../services/reminder-scheduler';
import { startCloudSyncOutboxDrainScheduler } from '../services/cloud-sync-outbox-drain';
import { scheduleAllActiveGiveaways } from '../features/giveaway/giveaway-scheduler';

export function registerEvents(client: ToolsBotClient) {
  client.once(Events.ClientReady, readyClient => {
    logger.info(`Ready! Logged in as ${readyClient.user.tag}`);
    startReminderScheduler(client);
    startBattleConditionsBridgeServer(client);
    startBattleConditionsScheduler(client);
    startCloudSyncOutboxDrainScheduler();
    // Re-arm end timers for giveaways that were still active at shutdown; without
    // this they silently never end after a restart.
    void scheduleAllActiveGiveaways(client).catch(error => {
      logger.error('Failed to reschedule active giveaways on startup', error);
    });
  });
}
