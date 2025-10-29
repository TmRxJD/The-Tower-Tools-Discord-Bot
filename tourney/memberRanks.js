const { SlashCommandBuilder, EmbedBuilder, PermissionsBitField, ChannelType } = require('discord.js');
const schedule = require('node-schedule');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const memberID = require('./memberID.js');

// Database setup
const dbFilePath = path.resolve(__dirname, '../../guildPlayerDatabase.db');
const db = new Database(dbFilePath);

// Tournament schedule configuration
const tournamentSchedule = {
    start: [
        { dayOfWeek: 2, hour: 0, minute: 0 },  // Tuesday
        { dayOfWeek: 5, hour: 0, minute: 0 }   // Friday
    ],
    duration: 28 * 60 * 60 * 1000, // 28 hours in milliseconds
    checkDelay: 8 * 60 * 60 * 1000 // 8 hours in milliseconds
};

// Delay helper
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Ensure the tournament results channel exists
 */
async function ensureTourneyChannel(guild) {
    // Check if we have a channel ID stored
    const db = new Database(path.resolve(__dirname, '../../guildPlayerDatabase.db'));
    const config = db.prepare('SELECT channel_id FROM guild_config WHERE guild_id = ?').get(guild.id);
    db.close();
    
    // If we already have a channel ID, try to use it
    if (config && config.channel_id) {
        try {
            const channel = await guild.channels.fetch(config.channel_id);
            if (channel) return channel;
        } catch (error) {
            console.log(`Channel with ID ${config.channel_id} no longer exists for guild ${guild.id}`);
        }
    }
    
    // Create a new channel
    try {
        const channel = await guild.channels.create({
            name: 'tourney-results',
            type: ChannelType.GuildText,
            topic: 'Automated tournament results from The Tower',
            reason: 'Created for tournament result updates'
        });
        
        // Store the channel ID
        const db = new Database(path.resolve(__dirname, '../../guildPlayerDatabase.db'));
        db.prepare('INSERT OR REPLACE INTO guild_config (guild_id, channel_id) VALUES (?, ?)')
          .run(guild.id, channel.id);
        db.close();
        
        // Send welcome message
        await channel.send({
            embeds: [
                new EmbedBuilder()
                    .setTitle('Tournament Result Channel Created')
                    .setDescription('This channel will display automatic tournament results for tracked players.')
                    .setColor(0x00FF00)
                    .addFields(
                        { name: 'Setup', value: 'Use `/playerid add` to add your player ID' },
                        { name: 'Manual Updates', value: 'Use `/member_ranks` to manually trigger updates' }
                    )
                    .setTimestamp()
            ]
        });
        
        return channel;
    } catch (error) {
        console.error(`Failed to create channel for guild ${guild.id}:`, error);
        return null;
    }
}

async function fetchTop10Players(page) {
    const top10Players = [];
    try {
        console.log('Fetching Top 10 players...');
        await page.goto('https://thetower.lol/results', { waitUntil: 'networkidle2' });
        await page.waitForSelector('table tr', { visible: true, timeout: 10000 });
        
        const players = await page.evaluate(() => {
            const rows = document.querySelectorAll('table tr');
            const data = [];
            
            // Skip header row
            for (let i = 1; i < Math.min(rows.length, 11); i++) {
                const cells = rows[i].querySelectorAll('td');
                if (cells.length >= 6) {
                    data.push({
                        rank: cells[0]?.textContent.trim(),
                        name: cells[3]?.textContent.trim(),
                        waves: cells[5]?.textContent.trim(),
                    });
                }
            }
            return data;
        });
        
        return players || [];
    } catch (error) {
        console.error('Error fetching top 10 players:', error);
        return [];
    }
}

/**
 * Fetch and format tournament results in a nice embed
 */
async function fetchTournamentResults(guildId, client) {
    let db = new Database(path.resolve(__dirname, '../../guildPlayerDatabase.db'));
    
    try {
        // Get guild configuration
        const guildConfig = db.prepare('SELECT * FROM guild_config WHERE guild_id = ?').get(guildId);
        if (!guildConfig) {
            throw new Error(`No configuration found for guild ${guildId}`);
        }
        
        // Get channel
        const channel = await client.channels.fetch(guildConfig.channel_id);
        if (!channel) {
            throw new Error(`Cannot find channel ${guildConfig.channel_id} for guild ${guildId}`);
        }
        
        // Launch browser
        const browser = await puppeteer.launch({
            headless: false,
            userDataDir: 'C:/Users/Josh/AppData/Local/Google/Chrome/User Data', // Real Chrome profile
            executablePath: 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
            args: ['--start-maximized']
            //args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
          }); 

        const tournamentTimestamp = Date.now();
        const tournamentDate = new Date().toDateString();
        
        const page = await browser.newPage();
        
        // Fetch top 10 players
        const top10Players = await fetchTop10Players(page);
        
        // Get players from this guild
        const members = db.prepare(
            'SELECT discord_id, player_id, player_name, username, display_name, global_name FROM guild_members WHERE guild_id = ?'
        ).all(guildId);
        const poi = db.prepare('SELECT discord_id, player_id, player_name FROM guild_poi WHERE guild_id = ?').all(guildId);

        // Combine and deduplicate player IDs
        const allPlayers = [...members, ...poi];
        const playerIds = [...new Set(allPlayers.map(p => p.player_id))];

        // Group player IDs into batches for concurrent processing
        const concurrencyLimit = 1;  // Process 5 player IDs at a time
        const staggerDelay = 5000;  // 5 second delay between batches
        const playerData = [];

        // Split player IDs into groups based on concurrency limit
        const groups = [];
        for (let i = 0; i < playerIds.length; i += concurrencyLimit) {
            groups.push(playerIds.slice(i, i + concurrencyLimit));
        }

        // Process each group with staggered requests
        for (let group of groups) {
            console.log(`Processing batch of ${group.length} players`);
            
            // Create a new page for each player in the batch
            const pages = await Promise.all(
                Array(group.length).fill(0).map(() => browser.newPage())
            );
            
            // Process each player with its own page
            const groupPromises = group.map(async (playerId, index) => {
                try {
                    // Use the corresponding page for this player
                    const playerPage = pages[index];
                    
                    console.log(`Fetching data for player ${playerId}...`);
                    
                    // Go to player page
                    await playerPage.goto(`https://thetower.lol/player?player=${playerId}`, { 
                        waitUntil: 'networkidle2', 
                        timeout: 60000
                    });
                    
                    // Wait for data to load
                    await playerPage.waitForSelector('table', { timeout: 60000 })
                        .catch(() => console.log('Table selector timeout, continuing anyway'));
                    
                    // Wait a moment to ensure data is loaded
                    await delay(2000);
                    
                    // Check if player exists
                    const playerExists = await playerPage.evaluate(() => {
                        return !document.body.innerText.includes('Player not found');
                    });
                    
                    if (!playerExists) {
                        console.log(`Player ${playerId} not found`);
                        return;
                    }
                    
                    // Extract player data
                    const data = await playerPage.evaluate(() => {
                        try {
                            // Get player name
                            const nameElement = document.querySelector('table.top span');
                            const name = nameElement ? nameElement.textContent.trim() : 'Unknown';
                            
                            // Find tournament data in the table
                            const tournamentRows = document.querySelectorAll('table tr');
                            if (tournamentRows.length <= 1) {
                                return { name, noTournament: true };
                            }
                            
                            // Find the first row with tournament data
                            let tournamentData = null;
                            let tournamentName = '';
                            let waves = 'N/A';
                            let rank = 'N/A'; 
                            let league = 'Unknown';
                            let patch = 'Unknown';
                            let battle = '';
                            
                            // Extract from tournament table
                            for (let i = 0; i < tournamentRows.length; i++) {
                                const cells = tournamentRows[i].querySelectorAll('td');
                                if (cells.length >= 5) {
                                    tournamentName = cells[0] ? cells[0].textContent.trim() : 'Unknown';
                                    waves = cells[1] ? cells[1].textContent.trim() : 'N/A';
                                    rank = cells[2] ? cells[2].textContent.trim() : 'N/A';
                                    patch = cells[4] ? cells[4].textContent.trim() : 'Unknown';
                                    league = cells[6] ? cells[6].textContent.trim() : 'Unknown';
                                    battle = cells[5] ? cells[5].textContent.trim() : '';
                                    
                                    // Found our data, break out
                                    tournamentData = {
                                        tournamentName,
                                        waves,
                                        rank,
                                        patch,
                                        league,
                                        battle
                                    };
                                    break;
                                }
                            }
                            
                            if (!tournamentData) {
                                return { name, noTournament: true };
                            }
                            
                            return {
                                name: name,
                                waves: tournamentData.waves,
                                rank: tournamentData.rank,
                                league: tournamentData.league,
                                patch: tournamentData.patch,
                                battleConditions: tournamentData.battle,
                                playerId: window.location.search.split('=')[1],
                                tournamentName: tournamentData.tournamentName,
                                noTournament: false
                            };
                        } catch (e) {
                            console.error('Error in page evaluation:', e);
                            return { name: 'Error', noTournament: true };
                        }
                    });
                    
                    console.log(`Data for ${playerId}:`, data);
                    
                    // Only add valid data
                    if (data) {
                        playerData.push(data);
                    }
                    
                    // Close this page when done
                    await playerPage.close();
                    
                } catch (error) {
                    console.error(`Error processing player ${playerId}:`, error);
                }
            });

            // Wait for all promises in this group to resolve
            await Promise.all(groupPromises);
            
            // Add delay between batches
            if (groups.indexOf(group) < groups.length - 1) {
                console.log(`Waiting ${staggerDelay/1000} seconds before next batch...`);
                await delay(staggerDelay);
            }
        }

        await browser.close();

        let currentPatch = null;
        let battleConditions = [];

        // Extract tournament patch and battle conditions from player data
        playerData.forEach(player => {
            if (player.noTournament) return;
            
            // Get patch from any player
            if (!currentPatch && player.patch) {
                currentPatch = player.patch;
            }
            
            // Get battle conditions from any player
            if (player.battleConditions && player.battleConditions.length > 0) {
                const bc = player.battleConditions.split('/').map(x => x.trim());
                if (bc.length > 0 && battleConditions.length === 0) {
                    battleConditions = bc;
                }
            }
        });

        // Group players by league after getting the patch info
        const playersByLeague = {};
        playerData.forEach(player => {
            if (player.noTournament || player.isPOI) return; // Skip POI players
            
            const league = player.league || 'Unknown';
            
            if (!playersByLeague[league]) {
                playersByLeague[league] = [];
            }
            playersByLeague[league].push(player);
        });
        
        // Ensure the db is still open
        if (!db.open) {
            db = new Database(path.resolve(__dirname, '../../guildPlayerDatabase.db'));
        }

        // Then do the database transaction
        const insertStmt = db.prepare(`
            INSERT OR REPLACE INTO tournament_history 
            (guild_id, player_id, discord_id, tournament_date, tournament_name, waves, rank, league, patch, battle_conditions, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        // Begin transaction for better performance with multiple inserts
        const insertMany = db.transaction((players) => {
            for (const player of players) {
                if (player.noTournament) continue;
                
                // Find discord ID if available
                const memberEntry = allPlayers.find(p => p.player_id === player.playerId);
                const discordId = memberEntry ? memberEntry.discord_id : null;
                
                // Convert waves and rank to integers for proper sorting
                const wavesInt = parseInt(player.waves) || 0;
                const rankInt = parseInt(player.rank) || 999;
                
                // Store the data 
                insertStmt.run(
                    guildId,
                    player.playerId,
                    discordId,
                    tournamentDate,
                    player.tournamentName || 'Unknown Tournament',
                    wavesInt,
                    rankInt,
                    player.league || 'Unknown',
                    currentPatch || 'Unknown',
                    (battleConditions || []).join(' / '),
                    tournamentTimestamp
                );
            }
        });

        // Execute the transaction
        insertMany(playerData);
        console.log(`Saved tournament data for ${playerData.length} players`);

        // Mark POI players after initialization
        const poiIds = new Set(poi.map(p => p.player_id));
        playerData.forEach(player => {
            player.isPOI = poiIds.has(player.playerId);
        });

        // Get POI players list after initialization
        const poiPlayers = playerData.filter(player => player.isPOI);


        // Create multiple embeds to handle the field limit, separating by league
        function createTournamentEmbeds() {
            const embeds = [];
            
            // Create the main embed with top 10 players
            const mainEmbed = new EmbedBuilder()
                .setTitle(`Tower Tournament Results - ${tournamentDate}`)
                .setColor(0xF1C40F)
            
            // Add Top 10 field to main embed
            if (top10Players.length > 0) {
                let top10Text = '';
                top10Players.forEach(player => {
                    top10Text += `**${player.rank}.** ${player.name} - ${player.waves} waves\n`;
                });
                mainEmbed.addFields({ name: '🏆 Top 10 Players', value: top10Text });
            }
            
            // Add the main embed to the list
            embeds.push(mainEmbed);
            
            // Extract league-specific battle conditions
            const leagueInfo = {};
            
            // Group players by league and collect league-specific battle conditions
            playerData.forEach(player => {
                if (player.noTournament) return;
                
                const league = player.league || 'Unknown';
                
                if (!leagueInfo[league]) {
                    leagueInfo[league] = {
                        patch: player.patch || currentPatch || 'Unknown',
                        battleConditions: player.battleConditions || ''
                    };
                }
            });
            
            // Process each league separately
            for (const league of Object.keys(playersByLeague).sort()) {
                if (playersByLeague[league].length === 0) continue;
                
                // League name formatting
                const leagueName = {
                    'Legends': '🏅 Legendary Chads',
                    'Champions': '🏆 Chadpions',
                    'Platinum': '✨ Chadtinums',
                }[league] || league;
                
                // Sort players by rank
                const sortedPlayers = playersByLeague[league]
                    .filter(p => !p.noTournament)
                    .sort((a, b) => parseInt(a.rank || '999') - parseInt(b.rank || '999'));
                
                if (sortedPlayers.length === 0) continue;
                
                // League-specific battle conditions
                const leagueBCs = leagueInfo[league]?.battleConditions || '';
                const bcText = leagueBCs ? `**Battle Conditions:**\n${leagueBCs}` : '';
                
                // Create a new embed for this league
                const leagueEmbed = new EmbedBuilder()
                    .setTitle(`${leagueName} - Tournament Results`)
                    .setDescription(`**Patch:** ${leagueInfo[league]?.patch || currentPatch || 'Unknown'}\n${bcText}`)
                    .setColor(0xF1C40F)
                
                // Add each player to this league's embed
                let fieldCount = 0;
                let currentEmbed = leagueEmbed;
                const MAX_FIELDS = 25;
                
                for (const player of sortedPlayers) {
                    // If we're at the field limit, create a new embed for this league continuation
                    if (fieldCount >= MAX_FIELDS) {
                        embeds.push(currentEmbed);
                        currentEmbed = new EmbedBuilder()
                            .setTitle(`${leagueName} - Tournament Results (Continued)`)
                            .setColor(0xF1C40F)
                        fieldCount = 0;
                    }
                    
                    const member = allPlayers.find(p => p.player_id.toUpperCase() === player.playerId.toUpperCase());
                    let discordName;

                    // Try to get the best available name using preference order
                    if (member) {
                        discordName = member.global_name || member.display_name || member.username || player.name;
                    }

                    const fieldName = `#${fieldCount + 1}: ${discordName}`;
                    const fieldValue = `Rank ${player.rank || '?'}: ${player.tournamentName} ${player.waves || '0'} waves`;
                    
                    currentEmbed.addFields({ name: fieldName, value: fieldValue, inline: false });
                    fieldCount++;
                }
                
                // Add the league embed
                embeds.push(currentEmbed);
            }
            
            // Handle POI section in its own embed if there are any
            if (poiPlayers.length > 0) {
                const sortedPOI = poiPlayers
                    .filter(p => !p.noTournament)
                    .sort((a, b) => parseInt(a.rank || '999') - parseInt(b.rank || '999'));
                
                if (sortedPOI.length > 0) {
                    // Create POI embed
                    const poiEmbed = new EmbedBuilder()
                        .setTitle(`Players of Interest - Tournament Results`)
                        .setDescription(`Patch: ${currentPatch || 'Unknown'}`)
                        .setColor(0xF1C40F)
                        .setTimestamp();
                        
                    let fieldCount = 0;
                    let currentEmbed = poiEmbed;
                    const MAX_FIELDS = 25;
                    
                    for (const player of sortedPOI) {
                        // If we're at the field limit, create a new embed for POI continuation
                        if (fieldCount >= MAX_FIELDS) {
                            embeds.push(currentEmbed);
                            currentEmbed = new EmbedBuilder()
                                .setTitle(`Players of Interest - Tournament Results (Continued)`)
                                .setColor(0xF1C40F)
                                .setTimestamp();
                            fieldCount = 0;
                        }
                        
                        const member = poi.find(p => p.player_id.toUpperCase() === player.playerId.toUpperCase());
                        let discordName = player.name;
                        const league = player.league || 'Unknown';
                        
                        // Try to get the best available name using preference order
                        if (member) {
                            discordName = member.global_name || member.display_name || member.username || player.name;
                        }

                        const fieldName = `Rank ${player.rank || '?'}: ${discordName}`;
                        const fieldValue = `${player.waves || '0'} waves (${league})`;
                        
                        currentEmbed.addFields({ name: fieldName, value: fieldValue, inline: false });
                        fieldCount++;
                    }
                    
                    // Add the POI embed
                    embeds.push(currentEmbed);
                }
            }
            
            return embeds;
        }

        // Create the embeds and send them
        const tournamentEmbeds = createTournamentEmbeds();

        // Send all embeds
        for (const embed of tournamentEmbeds) {
            await channel.send({ embeds: [embed] });
        }
        
        return true;
    } catch (error) {
        console.error(`Error fetching tournament results for guild ${guildId}:`, error);
        return false;
    } finally {
        // Always close the db connection in the finally block
        if (db && db.open) {
            db.close();
        }
    }
}

/**
 * Handle manual fetch command
 */
async function handleManualFetch(interaction) {
    await interaction.deferReply();
    
    try {
        const guildId = interaction.guild.id;
        
        // Check if guild is configured
        const db = new Database(path.resolve(__dirname, '../../guildPlayerDatabase.db'));
        const config = db.prepare('SELECT * FROM guild_config WHERE guild_id = ?').get(guildId);
        
        if (!config) {
            db.close();
            return interaction.editReply({
                content: '❌ This server is not set up for tournament tracking yet. Use `/member_ranks setup` first.',
                ephemeral: true
            });
        }
        
        // Start the fetch process
        await interaction.editReply({
            content: '🔍 Fetching tournament data... This may take a few moments.',
            ephemeral: true
        });
        
        // Check if we have new tournament data by comparing top 10
        const browser = await puppeteer.launch({
            headless: false,
            userDataDir: 'C:/Users/Josh/AppData/Local/Google/Chrome/User Data', // Real Chrome profile
            executablePath: 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
            args: ['--start-maximized']
            //args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
          }); 
        
        const page = await browser.newPage();
        const top10Players = await fetchTop10Players(page);
        await browser.close();
        
        const currentTop10Hash = calculateTop10Hash(top10Players);
        
        // Add option for manual fetch to force update regardless of hash
        const success = await fetchTournamentResults(guildId, interaction.client);
        
        if (success) {
            // Update the stored hash
            db.prepare('UPDATE guild_config SET last_data_hash = ?, last_update = ? WHERE guild_id = ?')
              .run(currentTop10Hash, Date.now(), guildId);
              
            db.close();
            
            await interaction.editReply({
                content: '✅ Tournament data has been successfully fetched and posted!',
                ephemeral: true
            });
        } else {
            db.close();
            await interaction.editReply({
                content: '❌ Failed to fetch tournament data. Please try again later.',
                ephemeral: true
            });
        }
    } catch (error) {
        console.error('Error in manual fetch:', error);
        await interaction.editReply({
            content: '❌ An error occurred while fetching tournament data.',
            ephemeral: true
        });
    }
}

/**
 * Handle setup command
 */
async function handleSetup(interaction) {
    await interaction.deferReply();
    
    try {
        const guildId = interaction.guild.id;
        const channelOption = interaction.options.getChannel('channel');
        
        let channel;
        
        // Use provided channel or create one
        if (channelOption) {
            if (!channelOption.isTextBased()) {
                return interaction.editReply({
                    content: '❌ The provided channel must be a text channel.'
                });
            }
            channel = channelOption;
        } else {
            // Create or find channel
            channel = await ensureTourneyChannel(interaction.guild);
            
            if (!channel) {
                return interaction.editReply({
                    content: '❌ Failed to create or find tournament results channel.'
                });
            }
        }
        
        // Update database with channel
        const db = new Database(path.resolve(__dirname, '../../guildPlayerDatabase.db'));
        
        const existing = db.prepare('SELECT * FROM guild_config WHERE guild_id = ?').get(guildId);
        
        if (existing) {
            db.prepare('UPDATE guild_config SET channel_id = ? WHERE guild_id = ?')
              .run(channel.id, guildId);
        } else {
            db.prepare('INSERT INTO guild_config (guild_id, channel_id, last_check, last_update) VALUES (?, ?, 0, 0)')
              .run(guildId, channel.id);
        }
        
        db.close();
        
        // Send success message
        const embed = new EmbedBuilder()
            .setTitle('✅ Tournament Tracker Setup Complete')
            .setColor(0x00FF00)
            .setDescription(`Tournament results will be posted in ${channel}.`)
            .addFields(
                { name: 'Next Steps', value: 'Ask members to use `/playerid add` to track their tournament results.' },
                { name: 'Manual Updates', value: 'Use `/member_ranks fetch` to manually trigger updates.' }
            )
            .setTimestamp();
        
        await interaction.editReply({ embeds: [embed] });
        
        // Post welcome message in the channel
        await channel.send({
            embeds: [
                new EmbedBuilder()
                    .setTitle('Tower Tournament Tracker Activated')
                    .setDescription('This channel will display tournament results for tracked players.')
                    .setColor(0x00FF00)
                    .addFields(
                        { name: 'Players', value: 'Use `/playerid add` to add your Tower player ID.' },
                        { name: 'Updates', value: 'Results will update automatically after tournaments end.' }
                    )
                    .setTimestamp()
            ]
        });
    } catch (error) {
        console.error('Error in setup:', error);
        await interaction.editReply({
            content: '❌ An error occurred during setup.'
        });
    }
}

function calculateTop10Hash(top10Players) {
    // Create a consistent string representation of the top 10 data
    const dataString = top10Players.map(p => `${p.rank}:${p.name}:${p.waves}`).join('|');
    
    // Use a simple hash function
    let hash = 0;
    for (let i = 0; i < dataString.length; i++) {
        const char = dataString.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString();
}

// Then modify the checkForTournamentUpdates function:
async function checkForTournamentUpdates(client, guildId) {
    try {
        const db = new Database(path.resolve(__dirname, '../../guildPlayerDatabase.db'));
        const config = db.prepare('SELECT * FROM guild_config WHERE guild_id = ?').get(guildId);
        
        if (!config) {
            console.log(`No configuration found for guild ${guildId}`);
            db.close();
            return false;
        }
        
        // Launch minimal browser just to check Top 10
        const browser = await puppeteer.launch({
            headless: false,
            userDataDir: 'C:/Users/Josh/AppData/Local/Google/Chrome/User Data', // Real Chrome profile
            executablePath: 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
            args: ['--start-maximized']
            //args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
          }); 
        
        const page = await browser.newPage();
        const top10Players = await fetchTop10Players(page);
        await browser.close();
        
        // Calculate hash of current top 10
        const currentTop10Hash = calculateTop10Hash(top10Players);
        
        // If hash matches the stored hash, no new tournament results
        if (config.last_data_hash === currentTop10Hash) {
            console.log(`No new tournament data for guild ${guildId} - Top 10 unchanged`);
            db.close();
            return false;
        }
        
        console.log(`New tournament data detected for guild ${guildId} - Top 10 changed`);
        console.log(`Previous hash: ${config.last_data_hash}, Current hash: ${currentTop10Hash}`);
        
        // New tournament data detected, run the full fetch
        const success = await fetchTournamentResults(guildId, client);
        
        if (success) {
            // Update the stored hash
            db.prepare('UPDATE guild_config SET last_data_hash = ?, last_update = ? WHERE guild_id = ?')
              .run(currentTop10Hash, Date.now(), guildId);
        }
        
        db.close();
        return success;
        
    } catch (error) {
        console.error(`Error checking for tournament updates for guild ${guildId}:`, error);
        return false;
    }
}

/**
 * Get the most recent tournament end time
 */
function getLastTournamentEndTime() {
    const now = new Date();
    let lastEnd = null;
    
    // Check the last possible tournament times
    for (let i = 0; i < 8; i++) {
        const checkDate = new Date(now.getTime() - (i * 24 * 60 * 60 * 1000));
        
        for (const startTime of tournamentSchedule.start) {
            if (checkDate.getDay() === startTime.dayOfWeek) {
                const tournamentStart = new Date(
                    checkDate.getFullYear(),
                    checkDate.getMonth(),
                    checkDate.getDate(),
                    startTime.hour,
                    startTime.minute
                );
                
                const tournamentEnd = new Date(tournamentStart.getTime() + tournamentSchedule.duration);
                
                // If this tournament has ended
                if (tournamentEnd <= now) {
                    if (!lastEnd || tournamentEnd > lastEnd) {
                        lastEnd = tournamentEnd;
                    }
                }
            }
        }
        
        if (lastEnd) break;
    }
    
    return lastEnd ? lastEnd.getTime() : 0;
}

function getNextTournamentStartTime() {
    const now = new Date();
    let nextStart = null;
    
    // Check the next possible tournament times
    for (let i = 0; i < 8; i++) {
        const checkDate = new Date(now.getTime() + (i * 24 * 60 * 60 * 1000));
        
        for (const startTime of tournamentSchedule.start) {
            if (checkDate.getDay() === startTime.dayOfWeek) {
                const tournamentStart = new Date(
                    checkDate.getFullYear(),
                    checkDate.getMonth(),
                    checkDate.getDate(),
                    startTime.hour,
                    startTime.minute
                );
                
                // If this tournament hasn't started yet
                if (tournamentStart > now) {
                    if (!nextStart || tournamentStart < nextStart) {
                        nextStart = tournamentStart;
                    }
                }
            }
        }
        
        if (nextStart) break;
    }
    
    return nextStart ? nextStart.getTime() : Number.MAX_SAFE_INTEGER;
}

/**
 * Initialize tournament update scheduler
 */
function initScheduler(client) {
    /*
    schedule.scheduleJob('0 * * * *', async () => {
        try {
            const db = new Database(path.resolve(__dirname, '../../guildPlayerDatabase.db'));
            const guilds = db.prepare('SELECT * FROM guild_config').all();
            const now = Date.now();
            
            const nextTournamentStart = getNextTournamentStartTime();
            const lastTournamentEnd = getLastTournamentEndTime();
            
            // Create an array of promises for eligible guilds
            const updatePromises = [];
            
            for (const guild of guilds) {
                const guildId = guild.guild_id;
                const lastCheck = guild.last_check || 0;
                const lastUpdate = guild.last_update || 0;
                
                // Same eligibility criteria
                if (now >= (lastTournamentEnd + tournamentSchedule.checkDelay) && 
                    lastUpdate < lastTournamentEnd &&
                    now < nextTournamentStart &&
                    now - lastCheck >= 3600000) {
                    
                    console.log(`Queueing tournament update check for guild ${guildId}`);
                    
                    // Update last check time immediately
                    db.prepare('UPDATE guild_config SET last_check = ? WHERE guild_id = ?')
                      .run(now, guildId);
                    
                    // Add to our promise array (don't await here)
                    updatePromises.push(
                        checkForTournamentUpdates(client, guildId)
                          .catch(err => console.error(`Error in update for guild ${guildId}:`, err))
                    );
                }
            }
            
            db.close();
            
            // Log how many guilds we're checking
            if (updatePromises.length > 0) {
                console.log(`Processing tournament updates for ${updatePromises.length} guilds`);
                
                // Process all updates concurrently with rate limiting
                // Using Promise.all would be more aggressive, this approach adds a small delay
                for (const promise of updatePromises) {
                    await promise;
                    // Small delay between guild processing to prevent overwhelming the API
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
                
                console.log('Completed all tournament update checks');
            }
          
        } catch (error) {
            console.error('Scheduler error:', error);
        }
    });
    */  
}

/**
 * Handle player history request
 */
async function handlePlayerHistory(interaction) {
    await interaction.deferReply();
    
    try {
        const targetUser = interaction.options.getUser('user') || interaction.user;
        const limit = interaction.options.getInteger('tournaments') || 5;
        const guildId = interaction.guild.id;
        
        // Get the player ID for the user
        const db = new Database(path.resolve(__dirname, '../../guildPlayerDatabase.db'));
        
        // First check if the user has a player ID
        const member = db.prepare(
            'SELECT player_id, player_name FROM guild_members WHERE guild_id = ? AND discord_id = ?'
        ).get(guildId, targetUser.id);
        
        if (!member) {
            return interaction.editReply({
                content: `${targetUser.username} doesn't have a registered player ID on this server.`
            });
        }
        
        // Get tournament history for this player
        const history = db.prepare(`
            SELECT * FROM tournament_history 
            WHERE guild_id = ? AND player_id = ?
            ORDER BY timestamp DESC
            LIMIT ?
        `).all(guildId, member.player_id, limit);
        
        db.close();
        
        if (history.length === 0) {
            return interaction.editReply({
                content: `No tournament history found for ${targetUser.username}.`
            });
        }
        
        // Create an embed to display the history
        const embed = new EmbedBuilder()
            .setTitle(`Tournament History for ${targetUser.username}`)
            .setColor(0x00BFFF)
            .setDescription(`Player ID: ${member.player_id}`)
            .setThumbnail(targetUser.displayAvatarURL())
            .setTimestamp();
        
        // Add fields for each tournament
        history.forEach((record, index) => {
            embed.addFields({
                name: `Tournament ${index + 1}: ${record.tournament_name || 'Unknown'} (${record.tournament_date})`,
                value: `Waves: **${record.waves}**\nRank: **${record.rank}**\nLeague: **${record.league}**\nPatch: ${record.patch}`,
                inline: index % 2 === 0 // Alternating inline fields
            });
        });
        
        // Add a footer with total tournaments tracked
        embed.setFooter({ 
            text: `Showing ${history.length} of ${limit} requested tournaments` 
        });
        
        await interaction.editReply({ embeds: [embed] });
        
    } catch (error) {
        console.error('Error retrieving player history:', error);
        await interaction.editReply({
            content: 'Error retrieving player tournament history.'
        });
    }
}

/**
 * Handle player stats request - shows progress over time
 */
async function handlePlayerStats(interaction) {
    await interaction.deferReply();
    
    try {
        const targetUser = interaction.options.getUser('user') || interaction.user;
        const guildId = interaction.guild.id;
        
        // Get the player ID for the user
        const db = new Database(path.resolve(__dirname, '../../guildPlayerDatabase.db'));
        
        // First check if the user has a player ID
        const member = db.prepare(
            'SELECT player_id, player_name FROM guild_members WHERE guild_id = ? AND discord_id = ?'
        ).get(guildId, targetUser.id);
        
        if (!member) {
            return interaction.editReply({
                content: `${targetUser.username} doesn't have a registered player ID on this server.`
            });
        }
        
        // Get tournament stats for this player
        const stats = db.prepare(`
            SELECT 
                COUNT(*) as total_tournaments,
                MAX(waves) as highest_waves,
                MIN(rank) as best_rank,
                AVG(waves) as avg_waves,
                AVG(rank) as avg_rank,
                (SELECT league FROM tournament_history 
                    WHERE guild_id = ? AND player_id = ? 
                    ORDER BY timestamp DESC LIMIT 1) as current_league
            FROM tournament_history 
            WHERE guild_id = ? AND player_id = ?
        `).get(guildId, member.player_id, guildId, member.player_id);
        
        // Get improvement trend (last 5 tournaments)
        const recentResults = db.prepare(`
            SELECT waves, rank, tournament_date
            FROM tournament_history 
            WHERE guild_id = ? AND player_id = ?
            ORDER BY tournament_date DESC, timestamp DESC
            LIMIT 5
        `).all(guildId, member.player_id);
        
        db.close();
        
        if (stats.total_tournaments === 0) {
            return interaction.editReply({
                content: `No tournament history found for ${targetUser.username}.`
            });
        }
        
        // Calculate improvement trends
        let waveTrend = '↔️';  // Default: no change
        let rankTrend = '↔️';  // Default: no change
        
        if (recentResults.length >= 2) {
            // Wave trend
            const oldestWaves = recentResults[recentResults.length-1].waves;
            const newestWaves = recentResults[0].waves;
            if (newestWaves > oldestWaves) waveTrend = '📈';
            else if (newestWaves < oldestWaves) waveTrend = '📉';
            
            // Rank trend (lower rank number is better)
            const oldestRank = recentResults[recentResults.length-1].rank;
            const newestRank = recentResults[0].rank;
            if (newestRank < oldestRank) rankTrend = '📈';
            else if (newestRank > oldestRank) rankTrend = '📉';
        }
        
        // Create an embed to display the stats
        const embed = new EmbedBuilder()
            .setTitle(`Tournament Stats for ${targetUser.username}`)
            .setColor(0x00BFFF)
            .setDescription(`Player ID: ${member.player_id}`)
            .setThumbnail(targetUser.displayAvatarURL())
            .addFields(
                { 
                    name: 'Summary', 
                    value: `Tournaments: **${stats.total_tournaments}**\nCurrent League: **${stats.current_league || 'Unknown'}**` 
                },
                { 
                    name: `Waves ${waveTrend}`, 
                    value: `Best: **${stats.highest_waves}**\nAverage: **${Math.round(stats.avg_waves)}**` 
                },
                { 
                    name: `Rank ${rankTrend}`, 
                    value: `Best: **${stats.best_rank}**\nAverage: **${Math.round(stats.avg_rank)}**` 
                }
            )
            .setTimestamp();
        
        // Add recent tournament results
        if (recentResults.length > 0) {
            const recentHistory = recentResults
                .map(r => `${r.tournament_date}: **${r.waves}** waves (Rank ${r.rank})`)
                .join('\n');
                
            embed.addFields({ 
                name: 'Recent Tournaments', 
                value: recentHistory 
            });
        }
        
        await interaction.editReply({ embeds: [embed] });
        
    } catch (error) {
        console.error('Error retrieving player stats:', error);
        await interaction.editReply({
            content: 'Error retrieving player tournament stats.'
        });
    }
}

module.exports = {
    data: new SlashCommandBuilder()
    .setName('member_ranks')
    .setDescription('Fetches player data from thetower.lol and posts results')
    .addSubcommand(subcommand =>
        subcommand
            .setName('fetch')
            .setDescription('Manually fetch and post current tournament rankings')
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('setup')
            .setDescription('Set up tournament tracking for this server')
            .addChannelOption(option =>
                option
                    .setName('channel')
                    .setDescription('Channel to post tournament results')
                    .setRequired(false)
            )
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('history')
            .setDescription('Show tournament history for a player')
            .addUserOption(option => 
                option
                    .setName('user')
                    .setDescription('User to show history for (defaults to you)')
                    .setRequired(false)
            )
            .addIntegerOption(option =>
                option
                    .setName('tournaments')
                    .setDescription('Number of tournaments to show (default: 5)')
                    .setMinValue(1)
                    .setMaxValue(10)
                    .setRequired(false)
            )
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('stats')
            .setDescription('Show tournament statistics for a player')
            .addUserOption(option => 
                option
                    .setName('user')
                    .setDescription('User to show stats for (defaults to you)')
                    .setRequired(false)
            )
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('import')
            .setDescription('Import data from old database format (admin only)')
    ),

    async execute(interaction) {
        try {
            const subcommand = interaction.options.getSubcommand();
            
            // Check permissions for configuration commands
            if (subcommand === 'setup' || subcommand === 'import') {
                if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
                    return interaction.reply({ 
                        content: '❌ You need Manage Server permission to use this command', 
                        ephemeral: true 
                    });
                }
            }
            
            switch(subcommand) {
                case 'fetch':
                    await handleManualFetch(interaction);
                    break;
                case 'setup':
                    await handleSetup(interaction);
                    break;
                case 'history':
                    await handlePlayerHistory(interaction);
                    break;
                case 'stats':
                    await handlePlayerStats(interaction);
                    break;
                case 'import':
                    await memberID.importExistingData(interaction, interaction.guild.id);
                    break;
            }
        } catch (error) {
            console.error('Command error:', error);
            await interaction.reply({ 
                content: 'An error occurred while processing the command', 
                ephemeral: true 
            });
        }
    },

    initScheduler,
    checkForTournamentUpdates,      
};