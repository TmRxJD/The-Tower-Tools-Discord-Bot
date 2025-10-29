const { EmbedBuilder } = require('discord.js');
const Database = require('better-sqlite3');
const path = require('path');
const puppeteer = require('puppeteer');

// Define the database path
const dbFilePath = path.resolve(__dirname, '../../guildPlayerDatabase.db');

// Initialize the SQLite database
const db = new Database(dbFilePath);
// Ensure the database has the necessary tables
db.exec(`
    CREATE TABLE IF NOT EXISTS guild_config (
        guild_id TEXT PRIMARY KEY,
        channel_id TEXT,
        last_check INTEGER,
        last_update INTEGER,
        last_data_hash TEXT,
        settings_json TEXT
    );

    CREATE TABLE IF NOT EXISTS guild_members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        discord_id TEXT NOT NULL,
        username TEXT NOT NULL,
        display_name TEXT NOT NULL,
        global_name TEXT NOT NULL,
        player_id TEXT NOT NULL,
        player_name TEXT NOT NULL,
        verified INTEGER DEFAULT 1,
        UNIQUE(guild_id, discord_id)
    );

    CREATE TABLE IF NOT EXISTS guild_poi (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        discord_id TEXT,
        player_id TEXT NOT NULL,
        player_name TEXT NOT NULL,
        display_name TEXT,
        verified INTEGER DEFAULT 1,
        UNIQUE(guild_id, discord_id)
    );

    CREATE TABLE IF NOT EXISTS tournament_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        player_id TEXT NOT NULL,
        discord_id TEXT,
        tournament_date INTEGER NOT NULL,
        tournament_name TEXT,
        waves INTEGER,
        rank INTEGER,
        league TEXT,
        patch TEXT,
        battle_conditions TEXT,
        timestamp INTEGER NOT NULL,
        UNIQUE(guild_id, player_id, tournament_date)
    );

    CREATE INDEX IF NOT EXISTS idx_guild_members ON guild_members(guild_id);
    CREATE INDEX IF NOT EXISTS idx_guild_poi ON guild_poi(guild_id);
    CREATE INDEX IF NOT EXISTS idx_tournament_history ON tournament_history(guild_id, player_id);
`);

/**
 * Verify a player ID by checking on the website
 */
async function verifyPlayerID(playerID) {
    console.log(`Verifying player ID: ${playerID}`);
    try {
        const browser = await puppeteer.launch({
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        });
        
        const page = await browser.newPage();
        await page.goto(`https://thetower.lol/player?player=${playerID}`, {
            waitUntil: ['networkidle2', 'domcontentloaded'],
            timeout: 60000
        });
        
        // Wait for page content to load
        await page.waitForSelector('table', { timeout: 60000 }).catch(() => null);
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Check for error messages on the page
        const hasError = await page.evaluate(() => {
            return document.body.innerText.includes('Player not found');
        });
        
        if (hasError) {
            await browser.close();
            return { success: false, message: 'Player ID not found on The Tower website.' };
        }
        
        // Extract player name
        const playerInfo = await page.evaluate(() => {
            const nameElement = document.querySelector('table.top span');
            const name = nameElement ? nameElement.textContent.trim() : null;
            return { name };
        });
        
        await browser.close();
        
        return {
            success: true,
            playerName: playerInfo.name || 'Unknown Player'
        };
        
    } catch (error) {
        console.error('Verification error:', error);
        return {
            success: false,
            message: 'Error connecting to The Tower website. Please try again later.'
        };
    }
}

/**
 * Add a player ID with verification
 */
async function addPlayerID(interaction, playerID, guildId) {
    await interaction.deferReply({ ephemeral: true });
    
    try {
        // Create verification status embed
        const verifyingEmbed = new EmbedBuilder()
            .setTitle('🔍 Verifying Your Player ID')
            .setColor(0x3498DB)
            .setDescription(`Please wait while your Player ID is verifed...`)
            .addFields(
                { name: 'Player ID', value: playerID, inline: true },
                { name: 'Status', value: 'Verification in progress...', inline: true }
            )
            .setFooter({ text: 'This may take a few moments to complete' })
            .setTimestamp();
            
        await interaction.editReply({ embeds: [verifyingEmbed] });
        
        // Verify the player ID
        const verification = await verifyPlayerID(playerID);
        
        if (!verification.success) {
            const failedEmbed = new EmbedBuilder()
                .setTitle('❌ Verification Failed')
                .setColor(0xFF0000)
                .setDescription(verification.message)
                .setTimestamp();
                
            return interaction.editReply({ embeds: [failedEmbed] });
        }
        
        // Add to database with player name and Discord user info
        const db = new Database(path.resolve(__dirname, '../../guildPlayerDatabase.db'));
        const discordId = interaction.user.id;
        const playerName = verification.playerName;
        
        // Get Discord username information
        const username = interaction.user.username;
        const globalName = interaction.member.user.globalName;
        const displayName = interaction.member.displayName;
        
        db.prepare(`
            INSERT OR REPLACE INTO guild_members 
            (guild_id, discord_id, player_id, player_name, username, display_name, global_name, verified) 
            VALUES (?, ?, ?, ?, ?, ?, ?, 1)
        `).run(guildId, discordId, playerID, playerName, username, displayName, globalName);
        
        db.close();
        
        // Create success embed
        const successEmbed = new EmbedBuilder()
            .setTitle('✅ Player ID Successfully Linked')
            .setColor(0x00FF00)
            .setDescription(`Your account has been successfully linked to your Tower Player ID.`)
            .addFields(
                { name: 'Player Name', value: playerName, inline: true },
                { name: 'Player ID', value: playerID, inline: true }
            )
            .setFooter({ text: 'You now have access to all tournament features' })
            .setTimestamp();
        console.log(`Added player ID: ${playerName} (${playerID})`);
        return interaction.editReply({ embeds: [successEmbed] });
        
    } catch (error) {
        console.error('Error adding player ID:', error);
        return interaction.editReply({ 
            content: '❌ An error occurred while adding your Player ID. Please try again later.',
            embeds: []
        });
    }
}

/**
 * Add a player of interest with optional display name
 */
async function addPlayerOfInterest(interaction, playerId, displayName) {
    await interaction.deferReply({ ephemeral: true });
    
    try {
        // Verify the player ID first
        const verifyingEmbed = new EmbedBuilder()
            .setTitle('🔍 Verifying Player ID')
            .setColor(0x3498DB)
            .setDescription('Please wait while this player ID is verified...')
            .addFields(
                { name: 'Player ID', value: playerId, inline: true },
                { name: 'Status', value: 'Verification in progress...', inline: true }
            )
            .setTimestamp();
        
        await interaction.editReply({ embeds: [verifyingEmbed] });
        
        // Verify the player ID
        const verification = await verifyPlayerID(playerId);
        
        if (!verification.success) {
            const failedEmbed = new EmbedBuilder()
                .setTitle('❌ Verification Failed')
                .setColor(0xFF0000)
                .setDescription(verification.message)
                .setTimestamp();
            
            return interaction.editReply({ embeds: [failedEmbed] });
        }
        
        // Use the name from verification if none provided
        const finalPlayerName = verification.playerName;
        
        // Use the provided display name or default to player name
        const finalDisplayName = displayName || finalPlayerName;
        
        // Add to database
        const db = new Database(path.resolve(__dirname, '../../guildPlayerDatabase.db'));
        const guildId = interaction.guild.id;
        
        // Check if already exists - use player_id as the unique identifier
        const existing = db.prepare(
            'SELECT player_id FROM guild_poi WHERE guild_id = ? AND player_id = ?'
        ).get(guildId, playerId);
        
        if (existing) {
            // Update name if it exists - now including display_name
            db.prepare(
                'UPDATE guild_poi SET display_name = ? WHERE guild_id = ? AND player_id = ?'
            ).run(finalDisplayName, guildId, playerId);
        } else {
            // Add new POI with display_name
            db.prepare(
                'INSERT INTO guild_poi (guild_id, player_id, player_name, display_name, verified) VALUES (?, ?, ?, ?, 1)'
            ).run(guildId, playerId, finalPlayerName, finalDisplayName);
        }
        
        db.close();
        
        // Create success embed - now showing both names if they differ
        const successEmbed = new EmbedBuilder()
            .setTitle('✅ Player of Interest Added')
            .setColor(0x00FF00)
            .setDescription(`Player has been added to the Players of Interest list.`)
            .addFields(
                { name: 'Player Name', value: finalPlayerName, inline: true },
                { name: 'Player ID', value: playerId, inline: true }
            )
            .setTimestamp();
        
        // Add display name field if it differs from player name
        if (finalDisplayName !== finalPlayerName) {
            successEmbed.addFields({ 
                name: 'Display Name', 
                value: finalDisplayName, 
                inline: true 
            });
        }
        
        successEmbed.addFields({ 
            name: 'Added By', 
            value: interaction.user.tag, 
            inline: false 
        });
        
        console.log(`Added player of interest: ${finalPlayerName} (${playerId}) with display name: ${finalDisplayName}`);
        await interaction.editReply({ embeds: [successEmbed] });
    } catch (error) {
        console.error('Error adding player of interest:', error);
        await interaction.editReply('Error adding player of interest.');
    }
}

/**
 * Remove a player ID from the database
 */
async function removePlayerID(interaction) {
    await interaction.deferReply({ ephemeral: true });
    
    try {
        const db = new Database(path.resolve(__dirname, '../../guildPlayerDatabase.db'));
        const guildId = interaction.guild.id;
        const discordId = interaction.user.id;
        
        // Check if the player exists
        const player = db.prepare(
            'SELECT player_id, player_name FROM guild_members WHERE guild_id = ? AND discord_id = ?'
        ).get(guildId, discordId);
        
        if (!player) {
            db.close();
            return interaction.editReply({ 
                content: '❌ You don\'t have a player ID registered on this server.'
            });
        }
        
        // Remove the player
        db.prepare(
            'DELETE FROM guild_members WHERE guild_id = ? AND discord_id = ?'
        ).run(guildId, discordId);
        
        db.close();
        
        // Create success embed
        const embed = new EmbedBuilder()
            .setTitle('Player ID Removed')
            .setColor(0xFF0000)
            .setDescription('Your player ID has been successfully removed from this server.')
            .addFields(
                { name: 'Player Name', value: player.player_name || 'Unknown', inline: true },
                { name: 'Player ID', value: player.player_id, inline: true }
            )
            .setTimestamp();
        
        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        console.error('Error removing player ID:', error);
        await interaction.editReply('Error removing your player ID.');
    }
}

/**
 * List players from the database
 */
async function listPlayers(interaction) {
    await interaction.deferReply({ ephemeral: true });
    
    try {
        const db = new Database(path.resolve(__dirname, '../../guildPlayerDatabase.db'));
        const guildId = interaction.guild.id;
        
        // Get all regular members with name fields
        const members = db.prepare(
            'SELECT discord_id, player_id, player_name, username, display_name, global_name FROM guild_members WHERE guild_id = ?'
        ).all(guildId);

        // Get all players of interest with name fields
        const poi = db.prepare(
            'SELECT discord_id, player_id, player_name FROM guild_poi WHERE guild_id = ?'
        ).all(guildId);

        db.close();

        // Build a set of POI player_ids for filtering
        const poiPlayerIds = new Set(poi.map(player => player.player_id));

        // Filter out members who are also POI
        const filteredMembers = members.filter(member => !poiPlayerIds.has(member.player_id));

        // Create embed
        const embed = new EmbedBuilder()
            .setTitle('Tower Tournament Tracker - Player List')
            .setColor(0x3498DB)
            .setDescription(`There are ${filteredMembers.length} tracked members and ${poi.length} players of interest`)
            .setTimestamp();

        // Add regular members field
        if (filteredMembers.length > 0) {
            let memberList = '';
            filteredMembers.forEach(member => {
                // Check if the member still exists in the server
                const guildMember = interaction.guild.members.cache.get(member.discord_id);

                // Use mentions in the value field (these work fine)
                // But use a friendly name in case the mention fails
                const friendlyName = member.global_name || member.display_name || member.username || member.player_name || 'Unknown';
                const displayName = guildMember ? `<@${member.discord_id}> (${friendlyName})` : `${friendlyName}`;
                memberList += `${displayName} - ID: ${member.player_id}\n\n`;
            });

            embed.addFields({
                name: '👥 Tracked Members',
                value: memberList || 'No members tracked'
            });
        } else {
            embed.addFields({
                name: '👥 Tracked Members',
                value: 'No members tracked'
            });
        }

        // Add players of interest field
        if (poi.length > 0) {
            let poiList = '';
            poi.forEach(player => {
                const friendlyName = player.global_name || player.display_name || player.username || player.player_name || 'Unknown';
                poiList += `${friendlyName} - ID: ${player.player_id}\n`;
            });

            embed.addFields({
                name: '🔍 Players of Interest',
                value: poiList || 'No players of interest'
            });
        } else {
            embed.addFields({
                name: '🔍 Players of Interest',
                value: 'No players of interest'
            });
        }

        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        console.error('Error listing players:', error);
        await interaction.editReply('Error retrieving player list.');
    }
}

/**
 * Get a user's player ID from the guild-specific database
 */
async function getPlayerID(interaction) {
    await interaction.deferReply({ ephemeral: true });
    
    try {
        const db = new Database(path.resolve(__dirname, '../../guildPlayerDatabase.db'));
        const member = db.prepare(
            'SELECT player_id, player_name FROM guild_members WHERE guild_id = ? AND discord_id = ?'
        ).get(interaction.guild.id, interaction.user.id);
        db.close();
        
        if (!member) {
            return interaction.editReply({ 
                content: 'You don\'t have a player ID registered on this server. Use `/playerid add` to add your ID.'
            });
        }
        
        const embed = new EmbedBuilder()
            .setTitle('Your Tower Player ID')
            .setColor(0x00FF00)
            .addFields(
                { name: 'Player Name', value: member.player_name || 'Unknown', inline: true },
                { name: 'Player ID', value: member.player_id, inline: true }
            )
            .setTimestamp();
        
        return interaction.editReply({ embeds: [embed] });
    } catch (error) {
        console.error('Error getting player ID:', error);
        return interaction.editReply('Error retrieving your player ID.');
    }
}

/**
 * Import existing data from the old database
 */
async function importExistingData(interaction, targetGuildId) {
    await interaction.deferReply({ ephemeral: true });
    
    try {
        const oldDb = new Database(path.resolve(__dirname, '../../playerDatabase.db'));
        const newDb = new Database(path.resolve(__dirname, '../../guildPlayerDatabase.db'));
        
        // Count entries to import
        const memberCount = oldDb.prepare('SELECT COUNT(*) as count FROM members').get().count;
        const poiCount = oldDb.prepare('SELECT COUNT(*) as count FROM players_of_interest').get().count;
        
        // Import regular members
        const members = oldDb.prepare('SELECT discord_id, player_id FROM members').all();
        const memberInsert = newDb.prepare(`
            INSERT OR IGNORE INTO guild_members (guild_id, discord_id, player_id, verified)
            VALUES (?, ?, ?, 1)
        `);
        
        members.forEach(member => {
            memberInsert.run(targetGuildId, member.discord_id, member.player_id);
        });
        
        // Import players of interest
        const poi = oldDb.prepare('SELECT discord_id, player_id FROM players_of_interest').all();
        const poiInsert = newDb.prepare(`
            INSERT OR IGNORE INTO guild_poi (guild_id, discord_id, player_id, verified)
            VALUES (?, ?, ?, 1)
        `);
        
        poi.forEach(player => {
            poiInsert.run(targetGuildId, player.discord_id, player.player_id);
        });
        
        // Create success embed
        const embed = new EmbedBuilder()
            .setTitle('Database Migration Complete')
            .setColor(0x00FF00)
            .setDescription(`Successfully imported data to new multi-server format.`)
            .addFields(
                { name: '👥 Members Imported', value: `${members.length} of ${memberCount}`, inline: true },
                { name: '🔍 Players of Interest', value: `${poi.length} of ${poiCount}`, inline: true }
            )
            .setFooter({ text: 'All imported players are marked as verified' })
            .setTimestamp();
        
        await interaction.editReply({ embeds: [embed] });
        
        oldDb.close();
        newDb.close();
        
    } catch (error) {
        console.error('Import error:', error);
        await interaction.editReply('Error importing data: ' + error.message);
    }
}

// Export the utility functions
module.exports = {
    verifyPlayerID,
    addPlayerID,
    addPlayerOfInterest,
    removePlayerID,
    listPlayers,
    getPlayerID,
    importExistingData
};