import { REST, Routes } from 'discord.js';
import { getAppConfig, loadConfig } from '../config';
import { logger } from '../core/logger';

async function registerCommands() {
  loadConfig();
  const { commandModules } = await import('../commands');
  const appConfig = getAppConfig();

  const rest = new REST({ version: '10' }).setToken(appConfig.discord.token);
  const body = commandModules.map(command => command.data);
  const targetGuildId = appConfig.discord.guildId;

  if (targetGuildId) {
    logger.info(`Registering ${body.length} guild commands to ${targetGuildId}`);
    await rest.put(Routes.applicationGuildCommands(appConfig.discord.clientId, targetGuildId), { body });
  } else {
    logger.info(`Registering ${body.length} global commands`);
    await rest.put(Routes.applicationCommands(appConfig.discord.clientId), { body });
  }

  logger.info('Slash commands refreshed');
}

void registerCommands().catch(error => {
  logger.error('Failed to register commands', error);
  console.error('Failed to register commands:', error);
  process.exitCode = 1;
});
