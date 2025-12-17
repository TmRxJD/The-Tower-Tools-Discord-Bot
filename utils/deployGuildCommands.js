const { REST, Routes } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
const { token, clientId } = require('../config.json');

async function buildCommands() {
    const commands = [];
    const foldersPath = path.join(__dirname, '..', 'commands');
    const commandFolders = fs.readdirSync(foldersPath);

    for (const folder of commandFolders) {
        const commandsPath = path.join(foldersPath, folder);
        const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));
        for (const file of commandFiles) {
            const command = require(path.join(commandsPath, file));
            if (command && command.data && typeof command.data.toJSON === 'function') {
                commands.push(command.data.toJSON());
            }
        }
    }
    return commands;
}

async function deployToGuild(guildId) {
    const rest = new REST().setToken(token);
    const commands = await buildCommands();
    try {
        const data = await rest.put(
            Routes.applicationGuildCommands(clientId, guildId),
            { body: commands }
        );
        console.log(`Deployed ${data.length} commands to guild ${guildId}`);
        return data;
    } catch (err) {
        console.error(`Failed to deploy commands to guild ${guildId}:`, err);
        throw err;
    }
}

module.exports = { deployToGuild };
