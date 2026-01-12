require('dotenv').config();
// Tower Run Tracker Bot - https://github.com/TmRxJD/TheTowerRunTrackerBot
const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, Events, GatewayIntentBits, MessageFlags } = require('discord.js');
const { token } = require('./config.json');
const Database = require('better-sqlite3');

const reminderScheduler = require('./commands/services/reminderScheduler');
// Use minimal intents — slash commands need only `Guilds`.
const client = new Client({ intents: [ GatewayIntentBits.Guilds ] });

// Initialize analytics database (fail-closed if DB/table missing)
let insertUsage = { run: () => {} };
try {
	const analyticsDb = new Database('./analytics.db');
	analyticsDb.exec('CREATE TABLE IF NOT EXISTS command_usage (command_name TEXT, user_id TEXT, guild_id TEXT)');
	insertUsage = analyticsDb.prepare('INSERT INTO command_usage (command_name, user_id, guild_id) VALUES (?, ?, ?)');
} catch (err) {
	console.warn('Analytics logging disabled; continuing without analytics DB.', err.message);
}

client.cooldowns = new Collection();
client.commands = new Collection();
const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath)
	.filter(f => fs.statSync(path.join(foldersPath, f)).isDirectory())
	.filter(f => !['data', 'services'].includes(f));

for (const folder of commandFolders) {
	const commandsPath = path.join(foldersPath, folder);
	const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
	for (const file of commandFiles) {
		const filePath = path.join(commandsPath, file);
		const command = require(filePath);
		if ('data' in command && 'execute' in command) {
			client.commands.set(command.data.name, command);
		} else {
			console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
		}
	}
}

// Legacy message listeners removed to allow running without Message Content intent.

client.once(Events.ClientReady, c => {
	console.log(`Ready! Logged in as ${c.user.tag}`);
	// start reminder scheduler
	try { reminderScheduler.startScheduler(client); } catch (e) { console.error('Failed to start reminder scheduler', e); }
});

// Initialize guild store and handle guild joins
const guildStore = require('./utils/guildStore');
const deployGuildCommands = require('./utils/deployGuildCommands');

// Initialize DB and migrate existing guild IDs from config.json (if any)
guildStore.init();
const migrated = guildStore.migrateFromConfig(path.join(__dirname, 'config.json'));
if (migrated > 0) console.log(`Migrated ${migrated} guild IDs from config.json to guilds.db`);

client.on('guildCreate', async (guild) => {
	try {
		console.log(`Joined guild ${guild.id} (${guild.name}). Adding to DB and deploying commands.`);
		const added = guildStore.addGuild(guild.id);
		if (added) {
			try {
				await deployGuildCommands.deployToGuild(guild.id);
				console.log(`Commands deployed to ${guild.id}`);
			} catch (err) {
				console.error(`Error deploying commands to guild ${guild.id}:`, err);
			}
		} else {
			console.log(`Guild ${guild.id} already present in guilds.db; skipping add.`);
		}
	} catch (err) {
		console.error('Error handling guildCreate:', err);
	}
});

client.on(Events.InteractionCreate, async interaction => {
	// Diagnostic: log interaction metadata to help root-cause 'Unknown interaction'
	try {
		console.log('[interaction] id=%s appId=%s clientId=%s createdDeltaMs=%d pid=%d listeners=%d',
			interaction.id,
			interaction.applicationId,
			client.user?.id,
			Date.now() - (interaction.createdTimestamp || 0),
			process.pid,
			client.listenerCount(Events.InteractionCreate)
		);
		if (interaction.applicationId && client.user && interaction.applicationId !== client.user.id) {
			console.warn('[interaction] applicationId does not match logged-in bot id; this interaction may belong to a different app.');
		}
	} catch (diagErr) {
		console.error('Failed to log interaction diagnostics', diagErr);
	}

	if (interaction.isModalSubmit()) {
		try {
			const command = client.commands.get(interaction.customId.split('_')[0]);
			if (command && command.handleModal) {
				await command.handleModal(interaction);
			}
		} catch (error) {
			console.error(error);
			if (interaction.replied || interaction.deferred) {
				await interaction.followUp({ content: 'There was an error processing your submission!', flags: MessageFlags.Ephemeral });
			} else {
				await interaction.reply({ content: 'There was an error processing your submission!', flags: MessageFlags.Ephemeral });
			}
		}
		return;
	}
	
	// Allow chat input (slash) and context menu commands
	if (!interaction.isChatInputCommand() && !interaction.isContextMenuCommand()) return;
	const command = client.commands.get(interaction.commandName);

	if (!command) {
		console.error(`No command matching ${interaction.commandName} was found.`);
		return;
	}

	const { cooldowns } = interaction.client;

	if (!cooldowns.has(command.data.name)) {
		cooldowns.set(command.data.name, new Collection());
	}

	const now = Date.now();
	const timestamps = cooldowns.get(command.data.name);
	const defaultCooldownDuration = 5;
	const cooldownAmount = (command.cooldown ?? defaultCooldownDuration) * 1000;

	if (timestamps.has(interaction.user.id)) {
		const expirationTime = timestamps.get(interaction.user.id) + cooldownAmount;

		if (now < expirationTime) {
			const expiredTimestamp = Math.round(expirationTime / 1000);
			await safeReply(interaction, { content: `Please wait, you are on a cooldown for \`${command.data.name}\`. You can use it again <t:${expiredTimestamp}:R>.`, flags: MessageFlags.Ephemeral });
			return;
		}
	}

	timestamps.set(interaction.user.id, now);
	setTimeout(() => timestamps.delete(interaction.user.id), cooldownAmount);

	// Track command usage (non-blocking)
	setImmediate(() => insertUsage.run(interaction.commandName, interaction.user.id, interaction.guild?.id));

	try {
		await command.execute(interaction);
	} catch (error) {
		console.error(error);
		if (interaction.replied || interaction.deferred) {
			await interaction.followUp({ content: 'There was an error while executing this command!', flags: MessageFlags.Ephemeral });
		} else {
			await interaction.reply({ content: 'There was an error while executing this command!', flags: MessageFlags.Ephemeral });
		}
	}
});

client.login(token);