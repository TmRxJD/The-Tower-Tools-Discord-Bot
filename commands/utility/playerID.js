const { SlashCommandBuilder } = require('discord.js');
const Database = require('better-sqlite3');
const path = require('path');

// Define the database path relative to the chad-bot folder
const dbFilePath = path.resolve(__dirname, '../../playerDatabase.db');

// Initialize the SQLite database
const db = new Database(dbFilePath);
// Ensure the database has the necessary tables
db.exec(`
    CREATE TABLE IF NOT EXISTS members (
        discord_id TEXT PRIMARY KEY,
        player_id TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS players_of_interest (
        discord_id TEXT PRIMARY KEY,
        player_id TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS players (
        discord_id TEXT PRIMARY KEY,
        player_id TEXT NOT NULL
    );
`);

// Function to retrieve player ID
function getPlayerID(user) {
    console.log(`getPlayerID called for: ${user.username}`);
    const stmt = db.prepare('SELECT player_id FROM members WHERE discord_id = ?');
    const row = stmt.get(user.username);

    if (row) {
        console.log(`ID Retrieved for ${user.username}: ${row.player_id}`);
        return { success: true, message: `Your PlayerID: ${row.player_id}` };
    } else {
        console.log(`No ID found in database for ${user.username}.`);
        return { success: false, message: `No ID found for ${user.username}.` };
    }
}

// Function to add a player ID
function addPlayerID(discordID, playerID) {
    console.log(`addPlayerID called for ${discordID} with Player ID ${playerID}`);
    const stmt = db.prepare('INSERT INTO members (discord_id, player_id) VALUES (?, ?)');
    try {
        stmt.run(discordID, playerID);
        return { success: true, message: `Player ID for ${discordID} added successfully.` };
    } catch (error) {
        if (error.code === 'SQLITE_CONSTRAINT') {
            return { success: false, message: `User ${discordID} is already in the database.` };
        }
        console.error(`Error adding player: ${error.message}`);
        return { success: false, message: 'Failed to update the database.' };
    }
}

// Function to create a new player entry
function newPlayerEntry(discordID, playerID, table = 'members') {
    console.log(`newPlayerEntry called with Discord ID: ${discordID} and Player ID: ${playerID}, Table: ${table}`);
    
    // Default to members if no valid table specified
    if (table !== 'members' && table !== 'players_of_interest' && table !== 'players') {
        table = 'members';
    }

    try {
        const addStmt = db.prepare(`INSERT INTO ${table} (discord_id, player_id) VALUES (?, ?)`);
        addStmt.run(discordID, playerID);
        
        const tableName = table === 'members' ? 'Members' : 
                         (table === 'players_of_interest' ? 'Players of Interest' : 'Players');
        
        return { success: true, message: `${discordID} added to '${tableName}'` };
    } catch (error) {
        if (error.code === 'SQLITE_CONSTRAINT') {
            return { success: false, message: `User ${discordID} already exists in the database.` };
        }
        console.error(`Error creating new player entry: ${error.message}`);
        return { success: false, message: 'Failed to update the database.' };
    }
}

// Function to move players between tables
function movePlayer(discordID, targetTable) {
    console.log(`Processing player with Discord ID: ${discordID}, moving to ${targetTable}`);

    // Check which table the player is currently in
    const checkPlayerStmt = db.prepare('SELECT * FROM members WHERE discord_id = ?');
    const playerInMembers = checkPlayerStmt.get(discordID);

    const checkPoiStmt = db.prepare('SELECT * FROM players_of_interest WHERE discord_id = ?');
    const playerInPoi = checkPoiStmt.get(discordID);
    
    const checkFetchStmt = db.prepare('SELECT * FROM players WHERE discord_id = ?');
    const playerInFetch = checkFetchStmt.get(discordID);

    // Check if the target table is valid
    if (targetTable !== 'members' && targetTable !== 'players_of_interest' && targetTable !== 'players') {
        return { success: false, message: 'Invalid target table specified.' };
    }

    // If the player is already in the target table, return a message indicating so
    if ((targetTable === 'members' && playerInMembers) || 
        (targetTable === 'players_of_interest' && playerInPoi) ||
        (targetTable === 'players' && playerInFetch)) {
        const tableName = targetTable === 'members' ? 'Members' : 
                         (targetTable === 'players_of_interest' ? 'Players of Interest' : 'Players');
        return { success: false, message: `Player ${discordID} is already in ${tableName}.` };
    }

    // Determine source table and prepare statements
    let addTargetStmt;
    let deleteSourceStmt;
    let sourceTable = '';

    if (playerInMembers) {
        addTargetStmt = db.prepare(`INSERT INTO ${targetTable} (discord_id, player_id) SELECT discord_id, player_id FROM members WHERE discord_id = ?`);
        deleteSourceStmt = db.prepare('DELETE FROM members WHERE discord_id = ?');
        sourceTable = 'Members';
    } else if (playerInPoi) {
        addTargetStmt = db.prepare(`INSERT INTO ${targetTable} (discord_id, player_id) SELECT discord_id, player_id FROM players_of_interest WHERE discord_id = ?`);
        deleteSourceStmt = db.prepare('DELETE FROM players_of_interest WHERE discord_id = ?');
        sourceTable = 'Players of Interest';
    } else if (playerInFetch) {
        addTargetStmt = db.prepare(`INSERT INTO ${targetTable} (discord_id, player_id) SELECT discord_id, player_id FROM players WHERE discord_id = ?`);
        deleteSourceStmt = db.prepare('DELETE FROM players WHERE discord_id = ?');
        sourceTable = 'Players';
    } else {
        return { success: false, message: `Player ${discordID} not found in any table.` };
    }

    // Map target table name to display name
    const targetTableName = targetTable === 'members' ? 'Members' : 
                          (targetTable === 'players_of_interest' ? 'Players of Interest' : 'Players');

    // Move the player
    try {
        addTargetStmt.run(discordID);
        deleteSourceStmt.run(discordID);
        return { success: true, message: `Player ${discordID} was successfully moved from ${sourceTable} to ${targetTableName}.` };
    } catch (error) {
        console.error(`Error moving player: ${error.message}`);
        return { success: false, message: 'Failed to move player.' };
    }
}


// Function to remove a player
function removePlayer(discordID) {
    console.log(`Removing player with Discord ID: ${discordID}`);

    // Prepare the SQL statements for removal from all tables
    const deletePlayerStmt = db.prepare('DELETE FROM members WHERE discord_id = ?');
    const deletePoiStmt = db.prepare('DELETE FROM players_of_interest WHERE discord_id = ?');
    const deleteFetchStmt = db.prepare('DELETE FROM players WHERE discord_id = ?');

    const playerResult = deletePlayerStmt.run(discordID);
    const poiResult = deletePoiStmt.run(discordID);
    const fetchResult = deleteFetchStmt.run(discordID);

    let message = '';
    if (playerResult.changes > 0) {
        message += `Player ${discordID} was removed from Members. `;
    }
    if (poiResult.changes > 0) {
        message += `Player ${discordID} was removed from Players of Interest. `;
    }
    if (fetchResult.changes > 0) {
        message += `Player ${discordID} was removed from Players. `;
    }

    if (playerResult.changes === 0 && poiResult.changes === 0 && fetchResult.changes === 0) {
        return { success: false, message: `Player ${discordID} not found in any table.` };
    }

    return { success: true, message: message.trim() };
}

// Function to get all players or specific types
// 
function getAllPlayers(type) {
    console.log('getAllPlayers called to retrieve player data');
    
    // Prepare database statements
    const membersStmt = db.prepare('SELECT discord_id, player_id FROM members');
    const poiStmt = db.prepare('SELECT discord_id, player_id FROM players_of_interest');
    const fetchStmt = db.prepare('SELECT discord_id, player_id FROM players');

    let data = '';

    // Check what type of data to fetch
    if (type === 'all') {
        const members = membersStmt.all().map(row => `${row.discord_id}: ${row.player_id}`).join('\n');
        const playersOfInterest = poiStmt.all().map(row => `${row.discord_id}: ${row.player_id}`).join('\n');
        const fetchPlayers = fetchStmt.all().map(row => `${row.discord_id}: ${row.player_id}`).join('\n');
        data = `## Main Players:\n${members}\n\n## Players of Interest:\n${playersOfInterest}\n\n## Players:\n${fetchPlayers}`;
    } else if (type === 'members') {
        const members = membersStmt.all().map(row => `${row.discord_id}: ${row.player_id}`).join('\n');
        data = `## Main Players:\n${members}`;
    } else if (type === 'players_of_interest') {
        const playersOfInterest = poiStmt.all().map(row => `${row.discord_id}: ${row.player_id}`).join('\n');
        data = `## Players of Interest:\n${playersOfInterest}`;
    } else if (type === 'players') {
        const fetchPlayers = fetchStmt.all().map(row => `${row.discord_id}: ${row.player_id}`).join('\n');
        data = `## Players:\n${fetchPlayers}`;
    } else {
        return {
            success: false,
            message: 'Invalid type specified. Please choose "all", "members", "players_of_interest", or "players".'
        };
    }

    return { success: true, data: data };
}

// Export command
module.exports = {
    category: 'utility',
    data: new SlashCommandBuilder()
        .setName('playerid_old')
        .setDescription('Retrieve, add, remove, or create new player ID entries.')
        .addSubcommand(subcommand =>
            subcommand
                .setName('get')
                .setDescription('Retrieve your registered player ID.')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Add your player ID to the database.')
                .addStringOption(option =>
                    option.setName('player_id')
                        .setDescription('The player ID to add.')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('new')
                .setDescription('Create a new player ID entry.')
                .addStringOption(option =>
                    option.setName('discord_id')
                        .setDescription('The Discord username to add.')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('player_id')
                        .setDescription('The player ID to add.')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('table')
                    .setDescription('Which table to add the player to')
                    .setRequired(false)
                    .addChoices(
                        { name: 'Members', value: 'members' },
                        { name: 'Players of Interest (POI)', value: 'players_of_interest' },
                        { name: 'Players', value: 'players' }
                    )
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Remove or move a player between tables')
                .addStringOption(option =>
                    option
                        .setName('discord_id')
                        .setDescription('Discord ID of the player to remove or move')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName('move_to_table')
                        .setDescription('Target table to move the player to')
                        .setRequired(false)
                        .addChoices(
                            { name: 'Members', value: 'members' },
                            { name: 'Players of Interest (POI)', value: 'players_of_interest' },
                            { name: 'Players', value: 'players' }
                        )
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('print-database')
                .setDescription('Display all players and IDs in the database.')
                .addStringOption(option =>
                    option
                        .setName('type')
                        .setDescription('Specify the type of data to retrieve')
                        .setRequired(false)
                        .addChoices(
                            { name: 'All', value: 'all' },
                            { name: 'Members', value: 'members' },
                            { name: 'Players of Interest (POI)', value: 'players_of_interest' },
                            { name: 'Players', value: 'players' }
                        )
                )
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'get') {
            try {
                const result = await getPlayerID(interaction.user);
                await interaction.reply(result.message);
            } catch (error) {
                console.error(error);
                await interaction.reply('There was an error while retrieving your player ID.');
            }

        } else if (subcommand === 'add') {
            const playerId = interaction.options.getString('player_id');
            const discordId = interaction.user.username;
            try {
                const result = await addPlayerID(discordId, playerId);
                await interaction.reply(result.message);
            } catch (error) {
                console.error(error);
                await interaction.reply('There was an error while adding the player ID.');
            }

        } else if (subcommand === 'new') {
            const discordId = interaction.options.getString('discord_id');
            const playerId = interaction.options.getString('player_id');
            const table = interaction.options.getString('table') || 'members';
            
            try {
                const result = await newPlayerEntry(discordId, playerId, table);
                await interaction.reply(result.message);
            } catch (error) {
                console.error(error);
                await interaction.reply('There was an error while creating the new player entry.');
            }
        } else if (subcommand === 'remove') {
            const discordID = interaction.options.getString('discord_id');
            const moveToTable = interaction.options.getString('move_to_table');  // Optional for move

            try {
                let result;

                if (moveToTable) {
                    // Call the movePlayer function when moveToTable is provided
                    result = await movePlayer(discordID, moveToTable);
                } else {
                    // Call removePlayer if no moveToTable is provided
                    result = await removePlayer(discordID);
                }

                await interaction.reply(result.message);
            } catch (error) {
                console.error(error);
                await interaction.reply('There was an error while removing or moving the player.');
            }

        } else if (subcommand === 'print-database') {
            const type = await interaction.options.getString('type') || 'all';
            try {
                const result = getAllPlayers(type); // Call without await since the function is synchronous
                if (result.success) {
                    await interaction.reply(result.data);
                } else {
                    await interaction.reply(result.message);
                }
            } catch (error) {
                console.error(error);
                await interaction.reply('There was an error while fetching the player database.');
            }
        }
    }
};
