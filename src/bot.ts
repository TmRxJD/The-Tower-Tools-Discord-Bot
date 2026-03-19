import { GatewayIntentBits } from 'discord.js';
import { loadConfig, getAppConfig } from './config';
import { ToolsBotClient } from './core/tools-bot-client';
import { logger } from './core/logger';
import { registerInteractionRouter } from './core/interaction-router';
import { registerEvents } from './events';
import { commandModules } from './commands';
import { registerComponentHandlers } from './interactions';
import { assertToolsBotPersistentStorage, getToolsBotStorageStatus } from './services/idb';
import { createPersistence } from './persistence';
import { prewarmTrackerAiAskRuntime } from './services/trackerai-ask';

async function bootstrap() {
  loadConfig();
  const appConfig = getAppConfig();

  await assertToolsBotPersistentStorage();
  const storageStatus = await getToolsBotStorageStatus();
  logger.info('ToolsBot sqlite storage initialized', storageStatus);
  void prewarmTrackerAiAskRuntime();

  const client = new ToolsBotClient(
    {
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
    },
    appConfig
  );

  client.persistence = createPersistence();

  client.commands.registerMany(commandModules);
  registerEvents(client);
  registerComponentHandlers(client);
  registerInteractionRouter(client);

  await client.login(appConfig.discord.token);
}

void bootstrap().catch(error => {
  logger.error('Failed to bootstrap tools bot', error);
  process.exitCode = 1;
});
