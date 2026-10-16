import { isDeepStrictEqual } from 'node:util';
import { Client, GatewayIntentBits, REST, Routes } from 'discord.js';
import { getAppConfig, loadConfig } from '../config';
import { validateBotBootstrapConfig } from '../core/bootstrap-contract';
import { logger } from '../core/logger';
import {
  hashCommandPayload,
  commandOptionsMatch,
  isRegistrationCurrent,
  registrationStatePath,
  writeRegistrationState,
} from './command-registration-state';

type RegisterCommandOptions = {
  deploymentMode?: 'dev' | 'prod';
  guildId?: string;
  commandName?: string;
  /** Register even if the command payload matches the last successful registration. */
  force?: boolean;
};

function parseRegisterCommandOptions(argv: string[]): RegisterCommandOptions {
  const options: RegisterCommandOptions = {
  };

  for (const arg of argv) {
    if (arg.startsWith('--command=')) {
      options.commandName = arg.slice('--command='.length);
      continue;
    }

    if (arg === '--prod') {
      options.deploymentMode = 'prod';
      continue;
    }

    if (arg === '--dev') {
      options.deploymentMode = 'dev';
      continue;
    }

    if (arg.startsWith('--mode=')) {
      const mode = arg.slice('--mode='.length);
      if (mode === 'dev' || mode === 'prod') {
        options.deploymentMode = mode;
      }
      continue;
    }

    if (arg === '--force') {
      options.force = true;
      continue;
    }

    if (arg.startsWith('--guild-id=')) {
      const guildId = arg.slice('--guild-id='.length).trim();
      if (guildId) {
        options.guildId = guildId;
      }
    }
  }

  return options;
}

async function registerCommands() {
  const options = parseRegisterCommandOptions(process.argv.slice(2));
  if (options.deploymentMode) {
    process.env.DEPLOYMENT_MODE = options.deploymentMode;
  }

  loadConfig();
  const { commandModules } = await import('../commands');
  const appConfig = getAppConfig();
  const runtime = validateBotBootstrapConfig(appConfig);

  const rest = new REST({ version: '10' }).setToken(runtime.loginToken);
  const body = commandModules.map(command => command.data);
  const isProd = runtime.deploymentMode === 'prod';

  // Targeted production updates preserve every unrelated global and guild registration.
  if (options.commandName) {
    if (!isProd || options.guildId) throw new Error('--command requires production global registration');
    const desired = body.find(command => command.name === options.commandName);
    if (!desired) throw new Error('Unknown command name');
    type Registered = { id: string; name: string; type: number; options?: unknown };
    const route = Routes.applicationCommands(runtime.clientId);
    const before = await rest.get(route) as Registered[];
    const existing = before.find(command => command.name === desired.name && command.type === (desired.type ?? 1));
    if (!existing) throw new Error('Target command is not registered; use full deployment for initial registration');
    await rest.patch(Routes.applicationCommand(runtime.clientId, existing.id), { body: desired });
    const after = await rest.get(route) as Registered[];
    const updated = after.find(command => command.id === existing.id);
    if (!updated || !commandOptionsMatch(desired.options, updated.options)) {
      throw new Error('Command option readback mismatch');
    }
    const others = (commands: Registered[]) => commands.filter(command => command.id !== existing.id).sort((a, b) => a.id.localeCompare(b.id));
    if (!isDeepStrictEqual(others(before), others(after))) throw new Error('Unrelated registration changed during update');
    console.log('Updated ' + desired.name + '; options verified by readback; ' + (after.length - 1) + ' unrelated global commands preserved. Guild registrations untouched.');
    return;
  }

  const payloadHash = hashCommandPayload(body, `${runtime.clientId}:${runtime.deploymentMode}`);
  const statePath = registrationStatePath(runtime.deploymentMode);
  // Checked before logging in or touching any guild: with the bot in many servers, that work
  // is what makes registration slow, and most deploys change no commands. console.log rather
  // than logger because these scripts run at the error log level.
  if (!options.force && !options.guildId && await isRegistrationCurrent(statePath, payloadHash)) {
    console.log(`Slash commands unchanged since the last registration (${body.length} commands); skipping. Use --force to register anyway.`);
    return;
  }

  logger.info(`Preparing command registration for ${runtime.deploymentMode} mode`);

  if (isProd) {
    // Prod: register globally so commands work in every server the bot joins,
    // including new servers added after deployment. Clear all guild-scoped
    // overrides first to prevent duplicates.
    const targetGuildIds = await resolveTargetGuildIds(runtime.loginToken, options.guildId);
    for (const guildId of targetGuildIds) {
      logger.info(`Clearing guild-scoped commands from ${guildId}`);
      await rest.put(Routes.applicationGuildCommands(runtime.clientId, guildId), { body: [] });
    }
    logger.info(`Registering ${body.length} global commands`);
    await rest.put(Routes.applicationCommands(runtime.clientId), { body });
    logger.info('Global slash commands registered — changes propagate within ~1 hour');
  } else {
    // Dev: register guild-scoped for instant propagation. Clear global commands
    // to prevent duplicates if the app previously had global commands registered.
    logger.info('Clearing global commands to avoid duplicate guild/global command entries');
    await rest.put(Routes.applicationCommands(runtime.clientId), { body: [] });
    const targetGuildIds = await resolveTargetGuildIds(runtime.loginToken, options.guildId);
    for (const guildId of targetGuildIds) {
      logger.info(`Registering ${body.length} guild commands to ${guildId}`);
      await rest.put(Routes.applicationGuildCommands(runtime.clientId, guildId), { body });
    }
    logger.info(`Slash commands refreshed across ${targetGuildIds.length} guild(s)`);
  }

  // A single-guild run only covers that guild, so it must not mark everything as registered.
  if (!options.guildId) {
    await writeRegistrationState(statePath, payloadHash, body.length);
  }
  console.log(`Registered ${body.length} slash commands.`);
}

async function resolveTargetGuildIds(loginToken: string, explicitGuildId?: string): Promise<string[]> {
  if (explicitGuildId) {
    return [explicitGuildId];
  }

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  try {
    await client.login(loginToken);
    const guilds = await client.guilds.fetch();
    const guildIds = [...guilds.keys()].sort((left, right) => left.localeCompare(right));
    if (guildIds.length === 0) {
      throw new Error('The bot is not currently in any guilds, so there are no commands to register.');
    }
    return guildIds;
  } finally {
    client.destroy();
  }
}

void registerCommands().catch(error => {
  logger.error('Failed to register commands', error);
  process.exitCode = 1;
});
