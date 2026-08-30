import { createHash } from 'node:crypto';
import { GatewayIntentBits } from 'discord.js';
import { loadConfig, getAppConfig } from './config';
import { createBotBootstrapContext } from './core/bootstrap-contract';
import { acquireSharedDiscordTokenLock, acquireSingleInstanceLock } from './core/single-instance-lock';
import { ToolsBotClient } from './core/tools-bot-client';
import { logger } from './core/logger';
import { registerInteractionRouter } from './core/interaction-router';
import { registerEvents } from './events';
import { commandModules } from './commands';
import { registerComponentHandlers } from './interactions';
import { stopBattleConditionsBridgeServer } from './services/battle-conditions-bridge';
import { stopBattleConditionsScheduler } from './services/battle-conditions-scheduler';
import { assertToolsBotPersistentStorage, getToolsBotStorageStatus } from './services/idb';
import { ensureTrackerRunNodeRxDBStorage } from '@tmrxjd/platform/node';
import { logToolsUserStateInboundChanges } from './rxdb/reactive-sync';
import { createPersistence } from './persistence';
import { prewarmTrackerAiAskRuntime } from './services/trackerai-ask';
import { stopReminderScheduler } from './services/reminder-scheduler';
import { stopCloudSyncOutboxDrainScheduler } from './services/cloud-sync-outbox-drain';

function registerShutdownHandlers(cleanup: (reason: string, error?: unknown) => Promise<void>): void {
  process.once('SIGINT', () => {
    void cleanup('SIGINT');
  });
  process.once('SIGTERM', () => {
    void cleanup('SIGTERM');
  });
  process.once('unhandledRejection', (reason) => {
    void cleanup('unhandledRejection', reason);
  });
  process.once('uncaughtException', (error) => {
    void cleanup('uncaughtException', error);
  });
}

async function bootstrap() {
  loadConfig();
  const appConfig = getAppConfig();
  const releaseInstanceLock = await acquireSingleInstanceLock();
  const tokenLockKey = createHash('sha256').update(appConfig.discord.token).digest('hex').slice(0, 16);
  const releaseSharedTokenLock = await acquireSharedDiscordTokenLock(tokenLockKey, `A local Discord bot process using client ${appConfig.discord.clientId}`);
  let cleanupStarted = false;

  const cleanup = async (reason: string, error?: unknown) => {
    if (cleanupStarted) {
      return;
    }

    cleanupStarted = true;
    stopReminderScheduler();
    stopBattleConditionsBridgeServer();
    stopBattleConditionsScheduler();
    stopCloudSyncOutboxDrainScheduler();
    if (error) {
      logger.error(`ToolsBot shutting down after ${reason}`, error);
      process.exitCode = 1;
    }

    await releaseSharedTokenLock().catch(() => null);
    await releaseInstanceLock().catch(() => null);
  };

  registerShutdownHandlers(cleanup);

  try {
    await assertToolsBotPersistentStorage();
    ensureTrackerRunNodeRxDBStorage({ dbFileName: 'tools-bot-user-state-rxdb.sqlite' });
    logToolsUserStateInboundChanges();
    const storageStatus = await getToolsBotStorageStatus();
    logger.info('ToolsBot sqlite storage initialized', storageStatus);
    void prewarmTrackerAiAskRuntime();

    const client = new ToolsBotClient(
      {
        intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
      },
      appConfig
    );
    const startup = createBotBootstrapContext(client, appConfig);

    startup.client.persistence = createPersistence();

    startup.client.commands.registerMany(commandModules);
    registerEvents(startup.client);
    registerComponentHandlers(startup.client);
    registerInteractionRouter(startup.client);

    await startup.client.login(startup.runtime.loginToken);

    startup.client.once('shardDisconnect', () => {
      void cleanup('shardDisconnect');
    });
  } catch (error) {
    await cleanup('bootstrap failure', error);
    throw error;
  }
}

void bootstrap().catch(error => {
  logger.error('Failed to bootstrap tools bot', error);
  process.exitCode = 1;
});
