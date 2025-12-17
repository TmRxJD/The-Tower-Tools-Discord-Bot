const { REST, Routes } = require('discord.js');
const { clientId, token } = require('./config.json'); // guild list now comes from guilds.db
const fs = require('node:fs');
const path = require('node:path');
const guildStore = require('./utils/guildStore');

// Ensure DB initialized and migrate existing config guilds if present
guildStore.init();
guildStore.migrateFromConfig(path.join(__dirname, 'config.json'));

const commands = [];
// Grab all the command folders from the commands directory
const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
    // Grab all the command files from the commands directory
    const commandsPath = path.join(foldersPath, folder);
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

    // Grab the SlashCommandBuilder#toJSON() output of each command's data for deployment
    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        if ('data' in command && 'execute' in command) {
            commands.push(command.data.toJSON());
        } else {
            console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
        }
    }
}

// Construct and prepare an instance of the REST module
const rest = new REST().setToken(token);

// Deploy your commands to all guilds recorded in the DB
(async () => {
    try {
        console.log(`Started refreshing ${commands.length} application (/) commands.`);
        const guildIds = guildStore.getAllGuilds();
        for (const guildId of guildIds) {
            try {
                const data = await rest.put(
                    Routes.applicationGuildCommands(clientId, guildId),
                    { body: commands },
                );
                console.log(`Successfully reloaded ${data.length} application (/) commands in guild ${guildId}.`);
            } catch (err) {
                console.error(`Failed to deploy commands to ${guildId}:`, err.message || err);
            }
        }
    } catch (error) {
        console.error(error);
    }
})();
