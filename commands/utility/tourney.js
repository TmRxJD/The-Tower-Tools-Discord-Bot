const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, AttachmentBuilder } = require('discord.js');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const moduleAlias = require('module-alias');
moduleAlias.addAlias('punyCode', 'punyCode/');
const sharp = require('sharp');
const stringSimilarity = require('string-similarity');
const playerIDModule = require('./playerID');

// Database setup
const dbFilePath = path.resolve(__dirname, '../../playerDatabase.db');

// Ensure download directory exists
const downloadPath = path.resolve(__dirname, 'downloads');
if (!fs.existsSync(downloadPath)) {
  fs.mkdirSync(downloadPath, { recursive: true });
}

// Main command module
module.exports = {
    data: new SlashCommandBuilder()
        .setName('tourney')
        .setDescription('Access tournament data and tools from The Tower'),

    async execute(interaction) {
        try {
            // Check if player has ID in database
            const hasPlayerID = await checkPlayerID(interaction.user.username);
            
            // Create main embed
            const embed = createMainEmbed(hasPlayerID);
            
            // Initial state - lookup mode is off
            let isLookupActive = false;
            
            // Create buttons based on whether user has ID
            const components = createButtons(hasPlayerID, isLookupActive);
            
            // Reply with embed and buttons
            const response = await interaction.reply({
                embeds: [embed],
                components,
                ephemeral: true,
                fetchReply: true
            });
            
            // Create a collector for button interactions
            const collector = response.createMessageComponentCollector({ 
                filter: i => i.user.id === interaction.user.id,
                time: 900000 // 15 minutes
            });
            
            // Define the button handler INSIDE execute
            async function handleButton(i) {
                const customId = i.customId;
                
                // IMPORTANT: Add this check to ignore share buttons
                if (customId.startsWith('share_')) {
                    return; // Skip processing for share buttons - they're handled by their own collectors
                }
                
                // Handle the lookup toggle button
                if (customId === 'tourney_toggle_lookup') {
                    isLookupActive = !isLookupActive; // Toggle the state
                    
                    // Update the message with new button states
                    await i.update({
                        embeds: [embed],
                        components: createButtons(hasPlayerID, isLookupActive)
                    });
                    
                    // If turning off lookup mode, just return
                    if (!isLookupActive) return;                    

                    return;
                }
            
                // Handle ID-related buttons first
                if (customId === 'tourney_add_id') {
                    return showAddIDModal(i);
                }
                
                // Check if lookup mode is active and this is a function button
                if (isLookupActive && ['tourney_overview', 'tourney_conditions', 'tourney_stats', 
                    'tourney_rank', 'tourney_bracket', 'tourney_wave_chart', 'tourney_rank_chart',
                    'tourney_join_time_chart', 'tourney_placement'].includes(customId)) {
                    
                    // Show the player lookup modal with the selected function
                    return showPlayerLookupModal(i, customId);
                }
                
                if (customId === 'tourney_cancel') {
                    collector.stop();
                    return i.update({ 
                        content: 'Tournament tools closed.',
                        embeds: [], 
                        components: [] 
                    });
                }
                
                // For other buttons, check if user has ID first
                if (!hasPlayerID) {
                    return i.reply({
                        content: 'You need to link your Tower Player ID first.',
                        ephemeral: true
                    });
                }
                
                // Handle other buttons
                await i.deferUpdate();
                
                switch (customId) {
                    case 'tourney_overview':
                        return handleOverview(i);
                    case 'tourney_conditions':
                        return handleBattleConditions(i);
                    case 'tourney_stats':
                        return handlePlayerStats(i);
                    case 'tourney_rank':
                        return handleLiveRank(i);
                    case 'tourney_bracket':
                        return handleLiveBracket(i);
                    case 'tourney_wave_chart':
                        return handleWaveComparison(i);
                    case 'tourney_rank_chart':
                        return handleRankComparison(i);
                    case 'tourney_join_time_chart':
                        return handleJoinTimeComparison(i);
                    case 'tourney_placement':
                        return handlePlacementAnalysis(i);
                    default:
                        return i.editReply({
                            content: 'Unknown option selected.',
                            embeds: [],
                            components: []
                        });
                }
            }
        
            // Define the modal handler INSIDE execute
            async function handleModal(i) {
                try {
                    if (i.customId === 'modal_add_id') {
                        const playerID = i.fields.getTextInputValue('player_id');
                        return addPlayerID(i, playerID);
                    }
                    
                    if (i.customId === 'modal_lookup_id') {
                        const discordID = i.fields.getTextInputValue('discord_id');
                        return lookupPlayerID(i, discordID);
                    }
                    
                    // Handle player lookup modals
                    if (i.customId.startsWith('modal_player_lookup_')) {
                        const functionId = i.customId.replace('modal_player_lookup_', '');
                        const playerID = i.fields.getTextInputValue('player_lookup_value');
                        
                        // Note: Moved defer into try-catch
                        try {
                            await i.deferReply({ ephemeral: true });
                        } catch (deferError) {
                            console.error('[handleModal] Failed to defer reply:', deferError);
                            // Try to respond with a fresh reply if deferring fails
                            return i.reply({ 
                                content: "❌ There was a problem with your request. Please try again.",
                                ephemeral: true 
                            }).catch(e => console.error('[handleModal] Could not handle interaction:', e));
                        }
                        
                        try {
                            // Validate player ID format
                            if (!/^[A-F0-9]+$/i.test(playerID.trim())) {
                                return i.editReply(`❌ Invalid Player ID format. Please enter a valid hexadecimal ID.`);
                            }
                            
                            // Verify the player ID exists
                            const verification = await verifyPlayerID(playerID);
                            if (!verification.success) {
                                return i.editReply(`❌ Invalid Player ID: ${verification.message}`);
                            }
                            
                            // Create player data object
                            const playerData = {
                                id: playerID,
                                name: verification.playerName
                            };
                            
                            // Reset any lookup state here
                            isLookupActive = false; // Reset lookup mode
                            
                            // Now call the appropriate function with the custom player data
                            switch (functionId) {
                                case 'tourney_stats':
                                    return handlePlayerStats(i, playerData);
                                case 'tourney_rank':
                                    return handleLiveRank(i, playerData);
                                case 'tourney_bracket':
                                    return handleLiveBracket(i, playerData);
                                case 'tourney_wave_chart':
                                    return handleWaveComparison(i, playerData);
                                case 'tourney_rank_chart':
                                    return handleRankComparison(i, playerData);
                                case 'tourney_join_time_chart':
                                    return handleJoinTimeComparison(i, playerData);
                                case 'tourney_placement':
                                    return handlePlacementAnalysis(i, playerData);
                                default:
                                    return i.editReply('Unknown function selected.');
                            }
                        } catch (error) {
                            console.error('[handleModal] Error processing player lookup:', error);
                            return i.editReply('❌ An error occurred while processing your request. Please try the lookup again.').catch(e => {
                                console.error('[handleModal] Failed to send error response:', e);
                            });
                        }
                    }
                } catch (error) {
                    console.error('[handleModal] Unexpected error in modal handling:', error);
                    
                    // Try to respond if possible
                    try {
                        if (!i.replied && !i.deferred) {
                            await i.reply({
                                content: "❌ An error occurred. Please try again.",
                                ephemeral: true
                            });
                        } else if (i.deferred) {
                            await i.editReply({
                                content: "❌ An error occurred. Please try again.",
                                embeds: [],
                                components: []
                            });
                        }
                    } catch (responseError) {
                        console.error('[handleModal] Failed to send error response after main error:', responseError);
                    }
                }
            }
            
            // Set up the button collector
            collector.on('collect', async i => {
                if (i.isButton()) {
                    await handleButton(i);
                }
            });
            
            // Set up listener for modal submissions - this is tricky since modals
            // don't work with collectors, so we need to use the client's events
            const modalHandler = async i => {
                try {
                    if (!i.isModalSubmit()) return;
                    
                    // Check if this is one of our modals and from the same user
                    const isOurModal = i.customId === 'modal_add_id' || 
                                    i.customId === 'modal_lookup_id' ||
                                    i.customId.startsWith('modal_player_lookup_');
                                    
                    if (!isOurModal || i.user.id !== interaction.user.id) return;
                    
                    await handleModal(i);
                    
                    // Only remove the listener for non-lookup modals
                    if (!i.customId.startsWith('modal_player_lookup_')) {
                        interaction.client.off('interactionCreate', modalHandler);
                    }
                } catch (error) {
                    console.error('[ModalHandler] Error handling modal interaction:', error);
                    
                    // Try to respond to the interaction if possible
                    try {
                        if (!i.replied && !i.deferred) {
                            await i.reply({ 
                                content: "❌ Something went wrong processing your request. Please try again.", 
                                ephemeral: true 
                            });
                        } else if (i.deferred) {
                            await i.editReply({
                                content: "❌ Something went wrong processing your request. Please try again.",
                                embeds: [],
                                components: []
                            });
                        }
                    } catch (replyError) {
                        // At this point we can't do anything more with this interaction
                        console.error('[ModalHandler] Failed to respond to errored interaction:', replyError);
                    }
                }
            };
            
            // Register the modal handler
            interaction.client.on('interactionCreate', modalHandler);
            
        } catch (error) {
            console.error('[TourneyCommand] An error occurred:', error);
            
            // Handle the error gracefully
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({
                    content: '❌ An error occurred while processing your request. Please try again later.',
                    embeds: [],
                    components: []
                }).catch(e => console.error('Error sending error message:', e));
            } else {
                await interaction.reply({
                    content: '❌ An error occurred while processing your request. Please try again later.',
                    ephemeral: true
                }).catch(e => console.error('Error sending error message:', e));
            }
        }
    }
};

// Check if player has ID in database
async function checkPlayerID(discordID) {
    const db = new Database(dbFilePath);
    try {
        const query = `SELECT player_id FROM members WHERE discord_id = ?`;
        const row = db.prepare(query).get(discordID);
        return !!row; // Return true if row exists, false otherwise
    } catch (error) {
        console.error('Error checking player ID:', error);
        return false;
    } finally {
        db.close();
    }
}

// Create main embed based on user registration status
function createMainEmbed(hasPlayerID) {
  const embed = new EmbedBuilder()
    .setTitle('🏆 The Tower Tournament Tools')
    .setColor(0x0099FF)
    .setTimestamp();
  
  if (hasPlayerID) {
    embed.setDescription('Select the tournament data you would like to retrieve:')
      .addFields(
        { name: '📊 Overview', value: 'Read the summary of the last tournament', inline: true },
        { name: '⚔️ Battle Conditions', value: 'View current battle conditions', inline: true },
        { name: '📈 Player Stats', value: 'See your detailed player statistics', inline: true },
        { name: '🏅 Live Rank', value: 'Check your current tournament rank', inline: true },
        { name: '🔠 Live Bracket', value: 'View your live tournament bracket', inline: true },
        { name: '📊 Comparison Charts', value: 'Compare your performance against your bracket', inline: true }
      )
      .setFooter({ text: 'Click the buttons below to access tournament data' });
  } else {
    embed.setDescription('You need to link your Tower Player ID first before accessing tournament data.')
      .addFields(
        { name: '🔗 Getting Started', value: 'Click the "Add ID" button below to link your account' },
        { name: '🔍 Looking for someone else?', value: 'Use "Lookup ID" to search for another player' }
      )
      .setFooter({ text: 'Player ID registration required' });
  }
  
  return embed;
}

async function createShareableMessage(interaction, content, options = {}) {
    // Default options
    const defaults = {
      timeout: 600000, // 10 minutes
      buttonText: 'Share to Channel',
      buttonEmoji: '📢',
      buttonId: `share_${Date.now()}`, // Unique ID to avoid collisions
      successMessage: 'Content shared to the channel!',
      parts: [] // For multi-part messages
    };
    
    // Merge options
    const config = { ...defaults, ...options };
    
    // Create share button
    const shareButton = new ButtonBuilder()
      .setCustomId(config.buttonId)
      .setLabel(config.buttonText)
      .setStyle(ButtonStyle.Success)
      .setEmoji(config.buttonEmoji);
    
    const row = new ActionRowBuilder().addComponents(shareButton);
    
    // Send or edit the message with content and button
    let message;
    if (content.followUp) {
      message = await interaction.followUp({ 
        content: content.text || null,
        embeds: content.embeds || [],
        components: [row],
        ephemeral: true
      });
    } else {
      message = await interaction.editReply({
        content: content.text || null, 
        embeds: content.embeds || [],
        components: [row]
      });
    }
    
    // Set up collector for the share button
    const filter = i => i.customId === config.buttonId && i.user.id === interaction.user.id;
    const collector = message.createMessageComponentCollector({ filter, time: config.timeout });
        
    // Handle button click
    collector.on('collect', async i => {
        try {            
            // Get the channel where the command was used
            const channel = interaction.channel;
            
            // First, assemble all parts in the correct order
            const allContent = [];
            
            // Add previous parts first (if they exist)
            if (config.parts && config.parts.length > 0) {
                allContent.push(...config.parts);
            }
            
            // Then add the current content
            if (content.text) {
                allContent.push(content.text);
            }
            
            // Now share everything in the correct order
            if (allContent.length > 0) {
                // Share first part with username prefix
                await channel.send(`**${interaction.user.username} shared:**\n\n${allContent[0]}`);
                
                // Share remaining parts without prefix
                for (let j = 1; j < allContent.length; j++) {
                    await channel.send(allContent[j]);
                }
            }
            
            // Share embeds if included
            if (content.embeds && content.embeds.length > 0) {
                await channel.send({ embeds: content.embeds });
            }
            
            // Update the message directly - CRUCIAL CHANGE HERE
            try {
                // Update the message directly using message.edit
                // This bypasses the interaction which is already acknowledged
                if (content.followUp) {
                    await message.edit({
                        content: config.successMessage,
                        components: [],
                        embeds: []
                    });
                } else {
                    await interaction.editReply({
                        content: config.successMessage,
                        components: [],
                        embeds: []
                    });
                }
            } catch (editError) {
                console.error('[ShareMessage] Error updating message:', editError);
                // Don't try to send any more messages or updates - it will likely fail
            }
            
            collector.stop();
        } catch (error) {
            console.error('[ShareMessage] Error handling share button:', error);
        }
    });
    
    // Remove the button after timeout if not clicked
    collector.on('end', async collected => {
        if (collected.size === 0) {
            try {
                // Update the message directly without using the interaction
                if (content.followUp) {
                    await message.edit({
                        content: content.text || null,
                        embeds: content.embeds || [],
                        components: []
                    });
                } else {
                    await interaction.editReply({
                        content: content.text || null,
                        embeds: content.embeds || [],
                        components: []
                    });
                }
            } catch (error) {
                console.error('Error removing share button after timeout:', error);
            }
        }
    });
    
    return message;
}

// Create button rows based on user registration status
function createButtons(hasPlayerID, isLookupActive = false) {
    if (hasPlayerID) {
      // First row of buttons for registered users
      const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('tourney_overview')
          .setLabel('Overview')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('📊'),
        new ButtonBuilder()
          .setCustomId('tourney_conditions')
          .setLabel('Battle Conditions')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('⚔️'),
        new ButtonBuilder()
          .setCustomId('tourney_stats')
          .setLabel('Player Stats')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('📈')
      );
      
      // Second row of buttons
      const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('tourney_rank')
          .setLabel('Live Rank')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('🏅'),
        new ButtonBuilder()
          .setCustomId('tourney_bracket')
          .setLabel('Live Bracket')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('🔠'),
        new ButtonBuilder()
          .setCustomId('tourney_placement')
          .setLabel('Placement Analysis')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('📋')
      );
      
      // Third row with more chart options
      const row3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('tourney_rank_chart')
          .setLabel('Rank Comparison')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('📈'),
        new ButtonBuilder()
          .setCustomId('tourney_wave_chart')
          .setLabel('Wave Comparison')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('📊'),
        new ButtonBuilder()
          .setCustomId('tourney_join_time_chart')
          .setLabel('Join Time Comparison')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('🔍')           
      );
      
      // Fourth row with utility buttons
      const row4 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('tourney_toggle_lookup')
          .setLabel('Lookup Different Player')
          // Set style to success when active, secondary when inactive
          .setStyle(isLookupActive ? ButtonStyle.Success : ButtonStyle.Secondary)
          .setEmoji('🔍'),
        new ButtonBuilder()
          .setCustomId('tourney_cancel')
          .setLabel('Close')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('❌')
      );
      
      return [row1, row2, row3, row4];
    } else {
      // For users without ID, show limited options
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('tourney_add_id')
          .setLabel('Add ID')
          .setStyle(ButtonStyle.Success)
          .setEmoji('➕'),
        new ButtonBuilder()
          .setCustomId('tourney_toggle_lookup')
          .setLabel('Lookup Player')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('🔍'),
        new ButtonBuilder()
          .setCustomId('tourney_cancel')
          .setLabel('Close')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('❌')
      );
      
      return [row];
    }
}

// Handle button interactions
async function handleButtonInteraction(interaction) {
    const customId = interaction.customId;
  
    // Handle ID-related buttons first
    if (customId === 'tourney_add_id') {
        return showAddIDModal(interaction);
    }
  
    if (customId === 'tourney_toggle_lookup') {
        // Toggle lookup mode
        isLookupActive = !isLookupActive;
        
        try {
            // Update the message with new button states
            await i.update({
                embeds: [embed],
                components: createButtons(hasPlayerID, isLookupActive)
            });
            
            // If turning off lookup mode, just return
            if (!isLookupActive) return;
            
        } catch (updateError) {
            console.error('[handleButton] Error updating lookup toggle state:', updateError);
            
            try {
                // Try to respond with a fresh ephemeral message if update fails
                await i.reply({
                    content: "❌ There was an issue toggling lookup mode. Please try again.",
                    ephemeral: true
                });
            } catch (replyError) {
                console.error('[handleButton] Failed to send error response:', replyError);
            }
        }
        return;
    }

    // And for the cancel button:
    if (customId === 'tourney_cancel') {
        try {
            // Reset state before closing
            isLookupActive = false;
            
            // Remove the modal handler to prevent memory leaks
            interaction.client.off('interactionCreate', modalHandler);
            
            // Stop the collector
            collector.stop();
            
            return i.update({ 
                content: 'Tournament tools closed.',
                embeds: [], 
                components: [] 
            });
        } catch (error) {
            console.error('[handleButton] Error closing tournament tools:', error);
            return i.reply({
                content: '❌ There was a problem closing the tournament tools.',
                ephemeral: true
            }).catch(e => console.error('[handleButton] Failed to send error message:', e));
        }
    }
  
  // For other buttons, check if user has ID first
  const hasPlayerID = await checkPlayerID(interaction.user.username);
  if (!hasPlayerID) {
    return interaction.reply({
      content: 'You need to link your Tower Player ID first.',
      ephemeral: true
    });
  }
  
  // Handle other buttons
  await interaction.deferUpdate();
  
  switch (customId) {
    case 'tourney_overview':
      return handleOverview(interaction);
    case 'tourney_conditions':
      return handleBattleConditions(interaction);
    case 'tourney_stats':
      return handlePlayerStats(interaction);
    case 'tourney_rank':
      return handleLiveRank(interaction);
    case 'tourney_bracket':
      return handleLiveBracket(interaction);
    case 'tourney_wave_chart':
      return handleWaveComparison(interaction);
    case 'tourney_rank_chart':
      return handleRankComparison(interaction);
    case 'tourney_placement':
      return handlePlacementAnalysis(interaction);
    default:
      return interaction.editReply({
        content: 'Unknown option selected.',
        embeds: [],
        components: []
      });
  }
}

async function showAddIDModal(interaction) {
  // Create the modal
  const modal = new ModalBuilder()
      .setCustomId('modal_add_id')
      .setTitle('Add Tower Player ID');
  
  // Create the Player ID input field
  const playerIdInput = new TextInputBuilder()
      .setCustomId('player_id')
      .setLabel('Enter Your Tower Player ID')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Enter your Player ID')
      .setMinLength(1)
      .setMaxLength(100)
      .setRequired(true);
  
  // Add components to rows
  const firstRow = new ActionRowBuilder().addComponents(playerIdInput);
  
  // Add rows to the modal
  modal.addComponents(firstRow);
  
  // Show the modal
  await interaction.showModal(modal);
}

async function showPlayerLookupModal(interaction, functionId) {
    const modal = new ModalBuilder()
        .setCustomId(`modal_player_lookup_${functionId}`)
        .setTitle('Look Up Different Player');
    
    const playerIdInput = new TextInputBuilder()
        .setCustomId('player_lookup_value')
        .setLabel('Enter Player ID')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Enter the player ID (hexadecimal format)')
        .setMinLength(1)
        .setMaxLength(100)
        .setRequired(true);
    
    // Add description based on the function
    let description;
    switch(functionId) {
        case 'tourney_stats':
            description = 'Enter player ID to view their stats';
            break;
        case 'tourney_rank':
            description = 'Enter player ID to check their live rank';
            break;
        case 'tourney_bracket':
            description = 'Enter player ID to view their bracket';
            break;
        case 'tourney_wave_chart':
        case 'tourney_rank_chart':
            description = 'Enter player ID to generate comparison charts';
            break;
        case 'tourney_placement':
            description = 'Enter player ID to check their placement analysis';
            break;
        default:
            description = 'Enter player ID (hexadecimal format)';
    }
    
    playerIdInput.setPlaceholder(description);
    
    const firstRow = new ActionRowBuilder().addComponents(playerIdInput);
    modal.addComponents(firstRow);
    
    await interaction.showModal(modal);
}

// Handle modal submissions
async function handleModalSubmit(interaction) {
  if (interaction.customId === 'modal_add_id') {
    const playerID = interaction.fields.getTextInputValue('player_id');
    return addPlayerID(interaction, playerID);
  }
  
  if (interaction.customId === 'modal_lookup_id') {
    const discordID = interaction.fields.getTextInputValue('discord_id');
    return lookupPlayerID(interaction, discordID);
  }
}

// Add player ID to database with verification
async function addPlayerID(interaction, playerID) {
  await interaction.deferReply({ ephemeral: true });
  
  try {
    // Show a verification status message
    const verifyingEmbed = new EmbedBuilder()
      .setTitle('🔍 Verifying Your Player ID')
      .setColor(0x3498DB)
      .setDescription(`Please wait while I verify and retrieve your player information from The Tower website...`)
      .addFields(
        { name: 'Player ID', value: playerID, inline: true },
        { name: 'Status', value: 'Verification in progress...', inline: true }
      )
      .setFooter({ text: 'This may take a few moments to complete' })
      .setTimestamp();
      
    await interaction.editReply({
      embeds: [verifyingEmbed],
      components: []
    });
    
    // Verify the player ID is valid by checking the website - retrieve name at the same time
    const verification = await verifyPlayerID(playerID);
    
    if (!verification.success) {
      return interaction.editReply(`❌ Invalid Player ID: ${verification.message}`);
    }
    
    // Use the automatically retrieved player name from the website
    const playerName = verification.playerName || 'Unknown';
    
    // Add to database
    const discordID = interaction.user.username;
    const result = await addPlayerToDB(discordID, playerID, playerName);
    
    if (!result.success) {
      return interaction.editReply(`❌ Error: ${result.message}`);
    }
    
    // Create a success embed
    const successEmbed = new EmbedBuilder()
      .setTitle('✅ Player ID Successfully Linked')
      .setColor(0x00FF00)
      .setDescription(`Your account has been successfully linked to your Tower Player ID.`)
      .addFields(
        { name: 'Player Name', value: playerName, inline: true },
        { name: 'Player ID', value: playerID, inline: true },
        { name: 'Next Steps', value: 'Please use the `/tourney` command again to access tournament tools.' }
      )
      .setFooter({ text: 'You now have access to all tournament features' })
      .setTimestamp();
    
    // Send success message with no buttons
    return interaction.editReply({
      content: null,
      embeds: [successEmbed],
      components: [] // No buttons
    });
    
  } catch (error) {
    console.error('Error adding player ID:', error);
    return interaction.editReply('❌ An error occurred while adding your Player ID. Please try again later.');
  }
}

// Verify player ID is valid and retrieve player name
async function verifyPlayerID(playerID) {
  try {
    console.log(`[verifyPlayerID] Starting verification for ID: ${playerID}`);
    const browser = await puppeteer.launch({
            headless: false,
            userDataDir: 'C:/Users/Josh/AppData/Local/Google/Chrome/User Data', // Real Chrome profile
            executablePath: 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
            args: ['--start-maximized']
            //args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
          }); 
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 1024 });
    
    // Navigate to player profile page - important to use the same URL format as stats function
    console.log(`[verifyPlayerID] Navigating to player page: ${playerID}`);
    await page.goto(`https://thetower.lol/player?player=${playerID}`, {
      waitUntil: ['networkidle2', 'domcontentloaded'],
      timeout: 60000
    });
    
    // Wait for the table to appear, just like in the player stats function
    await page.waitForSelector('table', { timeout: 60000 }).catch(() => {
      console.log(`[verifyPlayerID] No table found for ID: ${playerID}`);
    });
    
    // Give it a moment to fully render
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Check if page has error message
    const hasError = await page.evaluate(() => {
      return document.body.innerText.includes('Player not found');
    });
    
    if (hasError) {
      console.log(`[verifyPlayerID] Player ID not found: ${playerID}`);
      await browser.close();
      return {
        success: false,
        message: 'Player ID not found on The Tower website.'
      };
    }
    
    // Extract player information using the same approach as playerStats
    console.log(`[verifyPlayerID] Extracting player data...`);
    const playerInfo = await page.evaluate(() => {
      // Get player name from header - same selector as in playerStats
      const nameElement = document.querySelector('table.top span');
      const name = nameElement ? nameElement.textContent.trim() : null;
      
      if (name) {
        return { name };
      }
      
      // If that didn't work, try alternative methods
      const h1Element = document.querySelector('h1');
      if (h1Element) {
        return { name: h1Element.textContent.trim() };
      }
      
      // Try to get from title
      const titleElement = document.querySelector('title');
      if (titleElement && titleElement.textContent.includes(' | ')) {
        return { name: titleElement.textContent.split(' | ')[0].trim() };
      }
      
      // Return null if none of these worked
      return { name: null };
    });
    
    await browser.close();
    
    if (!playerInfo.name) {
      console.log(`[verifyPlayerID] Could not find player name for ID: ${playerID}`);
      return {
        success: true, // The ID is valid, we just couldn't get the name
        playerName: 'Unknown Player', // Fallback name
        message: 'Successfully verified ID, but could not fetch player name.'
      };
    }
    
    console.log(`[verifyPlayerID] Found player name: ${playerInfo.name}`);
    return {
      success: true,
      playerName: playerInfo.name
    };
    
  } catch (error) {
    console.error('[verifyPlayerID] Error:', error);
    return {
      success: false,
      message: 'Error connecting to The Tower website. Please try again later.'
    };
  }
}

// Add this function to the existing code
async function ensurePlayerNameExists(discordID) {
    const db = new Database(dbFilePath);
    
    try {
      // First check if player_name column exists
      const tableInfo = db.prepare("PRAGMA table_info(members)").all();
      const hasPlayerName = tableInfo.some(col => col.name === 'player_name');
      
      // Add the column if it doesn't exist
      if (!hasPlayerName) {
        console.log("Adding player_name column to members table");
        db.prepare("ALTER TABLE members ADD COLUMN player_name TEXT").run();
      }
      
      // Check if this user exists but has no player_name
      const user = db.prepare("SELECT player_id, player_name FROM members WHERE discord_id = ?").get(discordID);
      
      if (user && (!user.player_name || user.player_name.trim() === '')) {
        console.log(`User ${discordID} has ID but missing name - retrieving from website`);
        
        // User exists but needs name - fetch it silently from the website
        const playerID = user.player_id;
        const playerName = await fetchPlayerNameFromWebsite(playerID);
        
        if (playerName) {
          // Update the database with the fetched name
          db.prepare("UPDATE members SET player_name = ? WHERE discord_id = ?").run(playerName, discordID);
          console.log(`Silently updated name for ${discordID}: ${playerName}`);
        }
      }
      
      return true;
    } catch (error) {
      console.error('Error ensuring player name exists:', error);
      return false;
    } finally {
      db.close();
    }
}
  
// Helper function to fetch player name from website
async function fetchPlayerNameFromWebsite(playerID) {
    try {
      const browser = await puppeteer.launch({
            headless: false,
            userDataDir: 'C:/Users/Josh/AppData/Local/Google/Chrome/User Data', // Real Chrome profile
            executablePath: 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
            args: ['--start-maximized']
            //args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
          }); 
      
      const page = await browser.newPage();
      
      // Navigate to player profile page
      await page.goto(`https://thetower.lol/player/${playerID}`, {
        waitUntil: 'networkidle2',
        timeout: 60000
      });
      
      // Extract player name from the page
      const playerName = await page.evaluate(() => {
        const nameElement = document.querySelector('h1');
        return nameElement ? nameElement.innerText.trim() : null;
      });
      
      await browser.close();
      return playerName;
    } catch (error) {
      console.error('Error fetching player name from website:', error);
      return null;
    }
}

// Add player to database with name
async function addPlayerToDB(discordID, playerID, playerName) {
  const db = new Database(dbFilePath);
  
  try {
    // Check if player_name column exists
    const tableInfo = db.prepare("PRAGMA table_info(members)").all();
    const hasPlayerName = tableInfo.some(col => col.name === 'player_name');
    
    // Add the column if it doesn't exist
    if (!hasPlayerName) {
      db.prepare("ALTER TABLE members ADD COLUMN player_name TEXT").run();
    }
    
    // Check if player already exists
    const existing = db.prepare("SELECT * FROM members WHERE discord_id = ?").get(discordID);
    
    if (existing) {
      // Update existing record
      db.prepare("UPDATE members SET player_id = ?, player_name = ? WHERE discord_id = ?")
        .run(playerID, playerName, discordID);
      return { success: true, message: 'Player ID updated successfully.' };
    } else {
      // Insert new record
      db.prepare("INSERT INTO members (discord_id, player_id, player_name) VALUES (?, ?, ?)")
        .run(discordID, playerID, playerName);
      return { success: true, message: 'Player ID added successfully.' };
    }
  } catch (error) {
    console.error('Database error:', error);
    return { success: false, message: 'Database error occurred.' };
  } finally {
    db.close();
  }
}

// Lookup player ID
async function lookupPlayerID(interaction, discordID) {
  await interaction.deferReply({ ephemeral: true });
  
  try {
    const db = new Database(dbFilePath);
    const query = `SELECT player_id, player_name FROM members WHERE discord_id = ?`;
    const row = db.prepare(query).get(discordID);
    db.close();
    
    if (!row) {
      return interaction.editReply(`❌ No Player ID found for Discord user "${discordID}".`);
    }
    
    const playerLink = `https://thetower.lol/player/${row.player_id}`;
    const playerName = row.player_name || 'Unknown';
    
    const embed = new EmbedBuilder()
      .setTitle('Player Lookup Result')
      .setColor(0x00FF00)
      .addFields(
        { name: 'Discord Username', value: discordID, inline: true },
        { name: 'Player Name', value: playerName, inline: true },
        { name: 'Player ID', value: row.player_id, inline: true },
        { name: 'Player Profile', value: playerLink }
      )
      .setTimestamp();
    
    return interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('Error looking up player ID:', error);
    return interaction.editReply('❌ An error occurred while looking up the Player ID.');
  }
}

async function extractTextFromImage(imageBuffer) {
    try {
        const { default: Ocr } = await import('@gutenye/ocr-node');
        const ocr = await Ocr.create();
        const result = await ocr.detect(imageBuffer);
        return result;
    } catch (error) {
        console.error('[ERROR] OCR processing failed:', error);
        throw error;
    }
}

async function preprocessImage(buffer) {    
    try {
        let currentBuffer = buffer;
        let currentSize = currentBuffer.length;
        const MAX_SIZE = 188743680; // Approx. 180MB maximum size for OCR processing
        let reductionFactor = 1;  

        const reductionStep = 0.9; // Reduce quality by 10% each iteration if needed

        // Apply image processing to enhance text readability
        const processed = await sharp(currentBuffer)
          //  .greyscale() // Convert to grayscale to improve text contrast
          //  .negate() // Invert colors (white text on black background becomes black on white)
          //  .normalize() // Normalize contrast
          //  .gamma(1.5)  // Increase gamma for better contrast
          //  .sharpen()   // Sharpen to make text edges more defined
          //  .threshold(128) // Apply threshold to create binary black and white image
          //  .trim() // Remove excess whitespace around the edges
            .toFormat('tiff', { compression: 'lzw' }) // Convert to TIFF with LZW compression for OCR
            .toBuffer();

        currentBuffer = processed;
        currentSize = currentBuffer.length;
        
        // If the processed image is still too large, reduce its size/quality
        if (currentSize > MAX_SIZE) {
            console.log(`[DEBUG] Image too large. Current size: ${currentSize / 1024 / 1024} MB`);
            
            while (currentSize > MAX_SIZE && reductionFactor > 0.5) {
                console.log(`[DEBUG] Reducing image quality. Current size: ${currentSize / 1024 / 1024} MB`);

                const reduced = await sharp(currentBuffer)
                    .toFormat('tiff', { 
                        compression: 'lzw', 
                        quality: Math.max(50, 85 * reductionFactor)
                    })
                    .toBuffer();

                currentBuffer = reduced; 
                currentSize = currentBuffer.length; 
                reductionFactor *= reductionStep; 

                console.log(`[DEBUG] Reduced image size to: ${currentSize / 1024 / 1024} MB`);
            }
        }

        return currentBuffer;

    } catch (error) {
        console.error('[ERROR] Image preprocessing failed:', error);
        throw error;
    }
}

// Handle overview command
async function handleOverview(interaction) {
    try {
      // Show loading message first
      const loadingEmbed = new EmbedBuilder()
        .setTitle('Retrieving Tournament Overview')
        .setDescription('Please wait while I fetch the latest tournament data from thetower.lol...')
        .setColor(0x0099FF)
        .setFooter({ text: 'This may take a minute to complete' });
      
      await interaction.editReply({
        embeds: [loadingEmbed],
        content: null,
        components: [] // Clear buttons immediately
      });
      
      console.log('[Overview] Starting browser...');
      const browser = await puppeteer.launch({
            headless: false,
            userDataDir: 'C:/Users/Josh/AppData/Local/Google/Chrome/User Data', // Real Chrome profile
            executablePath: 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
            args: ['--start-maximized']
            //args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
          }); 
      
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 1024 });
      
      console.log('[Overview] Navigating to The Tower website...');
      await page.goto('https://thetower.lol/', {
        waitUntil: ['networkidle2', 'domcontentloaded'],
        timeout: 90000
      });
      
      console.log('[Overview] Waiting for Streamlit content...');
      await page.waitForSelector('[data-testid="stApp"]', { timeout: 60000 });
      
      // Extra wait to ensure content is fully loaded
      await new Promise(resolve => setTimeout(resolve, 15000));
      console.log('[Overview] Additional wait completed');
      
      // Extract tournament report with the simplest possible approach
      console.log('[Overview] Extracting tournament report...');
      const reportContent = await page.evaluate(() => {
        // Simply grab all markdown containers in sequence
        const containers = Array.from(document.querySelectorAll('[data-testid="stMarkdownContainer"]'));
        if (containers.length === 0) {
          return { success: false, error: 'No markdown containers found' };
        }
        
        // Plain text extraction - no fancy processing
        let fullReport = '';
        
        // Process each container in sequence
        containers.forEach(container => {
          // Extract all HTML content to preserve the exact structure
          const rawHTML = container.innerHTML;
          
          // Use a temporary element to help with text extraction
          const temp = document.createElement('div');
          temp.innerHTML = rawHTML;
          
          // Get all elements in sequence
          const allElements = temp.querySelectorAll('*');
          
          // Process elements in sequence
          allElements.forEach(el => {
            // Only process text nodes that are direct children (not nested in other elements)
            if (el.tagName === 'H1') {
              fullReport += `# ${el.textContent.trim()}\n\n`;
            }
            else if (el.tagName === 'H2') {
              const text = el.textContent.trim();
              if (text) {
                fullReport += `## ${text}\n\n`;
              }
            }
            else if (el.tagName === 'H3') {
              const text = el.textContent.trim();
              if (text) {
                fullReport += `### ${text}\n\n`;
              }
            }
            else if (el.tagName === 'P') {
              // Only add paragraph text if it's not empty
              const text = el.textContent.trim();
              if (text) {
                fullReport += `${text}\n\n`;
              }
            }
            else if (el.tagName === 'LI') {
              // Only add list items directly (not nested ones)
              if (el.parentElement.tagName === 'UL' || el.parentElement.tagName === 'OL') {
                fullReport += `- ${el.textContent.trim()}\n`;
              }
            }
            else if (el.tagName === 'BLOCKQUOTE') {
              const text = el.textContent.trim();
              if (text) {
                fullReport += `> ${text}\n\n`;
              }
            }
          });
        });
        
        // Cut off at Legend section if it exists
        const legendIndex = fullReport.indexOf("Legend");
        if (legendIndex > 0) {
          fullReport = fullReport.substring(0, legendIndex).trim();
        }
        
        // Remove any trailing "##" without content
        return { success: true, report: fullReport.replace(/##\s*$/, '').trim() };
      });
      
      await browser.close();
      
      if (!reportContent || reportContent.success === false) {
        const errorMsg = reportContent?.error || 'Unknown error';
        console.error('[Overview] Failed to extract content:', errorMsg);
        return interaction.editReply(`Failed to load tournament overview: ${errorMsg}`);
      }
      
      console.log(`[Overview] Successfully extracted ${reportContent.report.length} characters`);
      
      // Split into parts for Discord's message limit
      const parts = [];
      const limit = 1900; // Slightly less than 2000 for Discord's limit
      
      if (reportContent.report.length > limit) {
        console.log('[Overview] Splitting report into multiple messages');
        let currentContent = reportContent.report;
        while (currentContent.length > 0) {
          let breakPoint = limit;
          if (currentContent.length > limit) {
            // Find a good break point at a paragraph boundary
            const lastNewline = currentContent.lastIndexOf('\n\n', limit);
            if (lastNewline > limit / 2) {
              breakPoint = lastNewline;
            }
          }
          
          parts.push(currentContent.substring(0, breakPoint));
          currentContent = currentContent.substring(breakPoint).trim();
        }
      } else {
        parts.push(reportContent.report);
      }
      
      // First, send initial messages without share button
      await interaction.editReply({ 
        content: parts[0], 
        embeds: [],
        components: []
      });
      
      // Send middle parts (if any)
      for (let i = 1; i < parts.length - 1; i++) {
        await interaction.followUp({
          content: parts[i],
          ephemeral: true
        });
      }
      
      // Store all parts for sharing
      const allParts = [...parts];
      
      // If there are multiple parts, only show the share button on the last message
      if (parts.length > 1) {
        // Send the last part with share button
        await createShareableMessage(interaction, 
          { 
            text: parts[parts.length - 1],
            followUp: true 
          },
          { 
            parts: allParts.slice(0, parts.length - 1), // Include all previous parts for sharing
            buttonId: 'share_overview',
            successMessage: 'Tournament overview shared to channel!'
          }
        );
      } else {
        // Only one part, add share button to it
        await createShareableMessage(interaction, 
          { text: parts[0] },
          { 
            parts: [],
            buttonId: 'share_overview',
            successMessage: 'Tournament overview shared to channel!'
          }
        );
      }
      
    } catch (error) {
      console.error('[Overview] Error in handleOverview:', error);
      return interaction.editReply('Failed to load tournament overview: ' + error.message);
    }
}

async function handleBattleConditions(interaction) {
    try {
      // Show loading message first
      const loadingEmbed = new EmbedBuilder()
        .setTitle('Retrieving Battle Conditions')
        .setDescription('Please wait while I fetch the latest battle conditions from thetower.lol...')
        .setColor(0x0099FF)
        .setFooter({ text: 'This may take a moment to complete' });
      
      await interaction.editReply({
        embeds: [loadingEmbed],
        content: null,
        components: [] // Clear buttons immediately
      });
      
      console.log('[BattleConditions] Starting browser...');
      const browser = await puppeteer.launch({
            headless: false,
            userDataDir: 'C:/Users/Josh/AppData/Local/Google/Chrome/User Data', // Real Chrome profile
            executablePath: 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
            args: ['--start-maximized']
            //args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
          }); 
      
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 1024 });
      
      console.log('[BattleConditions] Navigating to The Tower BCs website...');
      await page.goto('https://thetower.lol/bcs', {
        waitUntil: ['networkidle2', 'domcontentloaded'],
        timeout: 90000
      });
      
      console.log('[BattleConditions] Waiting for Streamlit content...');
      await page.waitForSelector('[data-testid="stApp"]', { timeout: 60000 });
      
      // Extra wait to ensure content is fully loaded
      await new Promise(resolve => setTimeout(resolve, 10000));
      console.log('[BattleConditions] Additional wait completed');
      
      // Extract battle conditions with the simplest possible approach
      console.log('[BattleConditions] Extracting battle conditions...');
      const bcContent = await page.evaluate(() => {
        // Simply grab all markdown containers in sequence
        const containers = Array.from(document.querySelectorAll('[data-testid="stMarkdownContainer"]'));
        if (containers.length === 0) {
          return { success: false, error: 'No markdown containers found' };
        }
        
        // Extract both structured and raw text content
        let fullContent = '';
        let structuredContent = {
          title: '',
          tournament: '',
          date: '',
          conditions: [],
          notes: []
        };
        
        // Process each container in sequence
        containers.forEach(container => {
          // Extract all HTML content to preserve the exact structure
          const rawHTML = container.innerHTML;
          
          // Use a temporary element to help with text extraction
          const temp = document.createElement('div');
          temp.innerHTML = rawHTML;
          
          // Get all elements in sequence
          const allElements = temp.querySelectorAll('*');
          
          // Process elements in sequence and build structured content
          allElements.forEach(el => {
            // Only process text nodes that are direct children (not nested in other elements)
            if (el.tagName === 'H1') {
              const text = el.textContent.trim();
              fullContent += `# ${text}\n\n`;
              structuredContent.title = text;
            }
            else if (el.tagName === 'H2') {
              const text = el.textContent.trim();
              if (text) {
                fullContent += `## ${text}\n\n`;
                if (text.includes("Tournament")) {
                  structuredContent.tournament = text;
                } else if (text.includes("Next Tournament")) {
                  structuredContent.date = text.replace("Next Tournament is on ", "");
                }
              }
            }
            else if (el.tagName === 'H3') {
              const text = el.textContent.trim();
              if (text) {
                fullContent += `### ${text}\n\n`;
              }
            }
            else if (el.tagName === 'P') {
              // Only add paragraph text if it's not empty
              const text = el.textContent.trim();
              if (text) {
                fullContent += `${text}\n\n`;
                
                // Check if this is an early message or a condition
                if (text.includes("Too soon to display")) {
                  structuredContent.notes.push(text);
                } else {
                  structuredContent.conditions.push(text);
                }
              }
            }
            else if (el.tagName === 'LI') {
              // Only add list items directly (not nested ones)
              if (el.parentElement.tagName === 'UL' || el.parentElement.tagName === 'OL') {
                const text = el.textContent.trim();
                fullContent += `- ${text}\n`;
                structuredContent.conditions.push(`• ${text}`);
              }
            }
            else if (el.tagName === 'BLOCKQUOTE') {
              const text = el.textContent.trim();
              if (text) {
                fullContent += `> ${text}\n\n`;
                structuredContent.notes.push(text);
              }
            }
          });
        });
        
        // Remove any trailing "##" without content
        return { 
          success: true, 
          content: fullContent.replace(/##\s*$/, '').trim(),
          structured: structuredContent
        };
      });
      
      await browser.close();
      
      if (!bcContent || bcContent.success === false) {
        const errorMsg = bcContent?.error || 'Unknown error';
        console.error('[BattleConditions] Failed to extract content:', errorMsg);
        return interaction.editReply(`Failed to load battle conditions: ${errorMsg}`);
      }
      
      console.log(`[BattleConditions] Successfully extracted ${bcContent.content.length} characters`);
      
      // Create embed for battle conditions
      const bcEmbed = new EmbedBuilder()
        .setTitle('⚔️ ' + (bcContent.structured.title || 'Battle Conditions'))
        .setColor(0xE74C3C) // Red color for battle theme
        .setTimestamp()
        .setFooter({ text: 'Data from thetower.lol' });
        
      // Add tournament info if available
      if (bcContent.structured.date) {
        bcEmbed.setDescription(`**${bcContent.structured.date}**`);
      }
      
      // Check if we have an early message (no conditions yet)
      if (bcContent.structured.notes.length > 0 && bcContent.structured.conditions.length === 0) {
        bcEmbed.addFields({ name: 'Status', value: bcContent.structured.notes.join('\n\n') });
      } 
      // Otherwise add the conditions
      else if (bcContent.structured.conditions.length > 0) {
        // Group conditions in chunks to avoid field value limits
        const maxConditionsPerField = 5;
        const conditionGroups = [];
        
        for (let i = 0; i < bcContent.structured.conditions.length; i += maxConditionsPerField) {
          conditionGroups.push(
            bcContent.structured.conditions.slice(i, i + maxConditionsPerField).join('\n\n')
          );
        }
        
        // Add fields for each group of conditions
        conditionGroups.forEach((group, index) => {
          bcEmbed.addFields({ 
            name: index === 0 ? 'Conditions' : '\u200B', // Only first group gets a header
            value: group 
          });
        });
      }
      
      // Add any notes at the end if they exist
      if (bcContent.structured.notes.length > 0 && bcContent.structured.conditions.length > 0) {
        bcEmbed.addFields({ 
          name: 'Notes', 
          value: bcContent.structured.notes.join('\n\n') 
        });
      }
      
      // Send the embed
      await interaction.editReply({
        embeds: [bcEmbed],
        components: []
      });
      
      // Add share button to the message
      await createShareableMessage(interaction, {
        embeds: [bcEmbed]
      }, {
        buttonId: 'share_bcs',
        successMessage: 'Battle conditions shared to channel!'
      });
      
    } catch (error) {
      console.error('[BattleConditions] Error:', error);
      return interaction.editReply('Failed to load battle conditions: ' + error.message);
    }
}

async function handlePlayerStats(interaction, customPlayerData = null) {
    try {
        // Show loading message first
        const loadingEmbed = new EmbedBuilder()
            .setTitle('Retrieving Player Stats')
            .setDescription('Please wait while I fetch the player stats data from thetower.lol...')
            .setColor(0x0099FF)
            .setFooter({ text: 'This may take a moment to complete' });
        
        await interaction.editReply({
            embeds: [loadingEmbed],
            content: null,
            components: [] // Clear buttons immediately
        });
        
        // Get player data - either from custom data or database
        let playerData;
        
        if (customPlayerData) {
            playerData = customPlayerData;
            console.log(`[PlayerStats] Using custom player data: ${playerData.name} (${playerData.id})`);
        } else {
            // Get player ID from database
            const discordID = interaction.user.username;
            playerData = await fetchPlayerData(discordID);
            
            if (!playerData) {
                return interaction.editReply({
                    content: "Error: No player ID found for your Discord username. Please add your Player ID first.",
                    embeds: [],
                    components: []
                });
            }
        }
        
        console.log(`[PlayerStats] Starting browser for player ID: ${playerData.id}`);
        const browser = await puppeteer.launch({
            headless: false,
            userDataDir: 'C:/Users/Josh/AppData/Local/Google/Chrome/User Data', // Real Chrome profile
            executablePath: 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
            args: ['--start-maximized']
            //args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
          }); 
        
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 1024 });
        
        console.log(`[PlayerStats] Navigating to player page...`);
        await page.goto(`https://thetower.lol/player?player=${playerData.id}`, {
            waitUntil: ['networkidle2', 'domcontentloaded'],
            timeout: 60000
        });
        
        // Wait for the table to load
        console.log(`[PlayerStats] Waiting for player data to load...`);
        await page.waitForSelector('table', { timeout: 60000 });
        
        // Give it a moment more to fully render
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Extract player information and tournament history
        console.log(`[PlayerStats] Extracting player data...`);
        const playerInfo = await page.evaluate(() => {
            // Get player name from header
            const nameElement = document.querySelector('table.top span');
            const name = nameElement ? nameElement.textContent.trim() : 'Unknown';
            
            // Check if player joined the last tournament
            const joinedLastText = document.querySelector('table.top div:nth-child(3)');
            const joinedLast = joinedLastText ? joinedLastText.textContent.includes('✅') : false;
            
            // Get league information from the first row (most recent tournament)
            // First we need to find the tournament table (not the player info table)
            const tournamentTable = document.querySelector('table:not(.top)');
            let league = 'Unknown';
            
            if (tournamentTable) {
                // Get the first row (most recent tournament)
                const firstRow = tournamentTable.querySelector('tbody tr');
                if (firstRow) {
                    // Get the last cell in that row which contains the league
                    const leagueCell = firstRow.querySelector('td:last-child');
                    league = leagueCell ? leagueCell.textContent.trim() : 'Unknown';
                }
            }
            
            // Get tournament history data
            const tournaments = [];
            const tableRows = document.querySelectorAll('table:not(.top) tbody tr');
            
            tableRows.forEach(row => {
                const cells = row.querySelectorAll('td');
                if (cells.length >= 3) {
                    const tourneyName = cells[0].textContent.trim();
                    const wave = cells[1].textContent.trim();
                    const rank = cells[2].textContent.trim();
                    
                    tournaments.push({
                        name: tourneyName,
                        wave: wave,
                        rank: rank
                    });
                }
            });
            
            // Limit to most recent 10 tournaments
            tournaments.splice(10);
            
            return {
                name,
                joinedLast,
                league,
                tournaments
            };
        });
        
        await browser.close();
        console.log(`[PlayerStats] Successfully extracted data for ${playerInfo.name}`);

        /*
        // Update player name in database if needed
        if (playerData.name !== playerInfo.name) {
            await updatePlayerName(discordID, playerData.id, playerInfo.name);
            console.log(`[PlayerStats] Updated player name in database: ${playerInfo.name}`);
        }
        */

        // Format the tournament data using monospace formatting for consistent display
        let tournamentTable = '```\n';
        

        playerInfo.tournaments.forEach(t => {
            // Pad name to 16 chars (max length), waves to 8, and rank doesn't need padding
            const paddedName = (t.name + '                    ').substring(0, 20);
            const paddedWave = (t.wave + '      ').substring(0, 6);
            tournamentTable += `${paddedName} ${paddedWave} ${t.rank}\n`;
        });

        tournamentTable += '```';

        // Create the embed with a single field for tournament history
        const statsEmbed = new EmbedBuilder()
            .setTitle(`Player Stats for ${playerInfo.name}`)
            .setColor(0xE67E22) // Orange color for player stats
            .setDescription(`**PlayerID:** ${playerData.id}\n**League:** ${playerInfo.league}    **Joined Current:** ${playerInfo.joinedLast ? '✅' : '❌'}`)
            .addFields(
                { name: '**  Name                                             Waves       Rank**', value: tournamentTable }
            )
            .setURL(`https://thetower.lol/player?player=${playerData.id}`) // Makes title clickable with this link
            .setFooter({ text: `https://thetower.lol/player?player=${playerData.id}` })
            .setTimestamp();
        
        // Send the embed
        await interaction.editReply({
            embeds: [statsEmbed],
            components: []
        });
        
        // Add share button to the message
        await createShareableMessage(interaction, {
            embeds: [statsEmbed]
        }, {
            buttonId: 'share_player_stats',
            successMessage: 'Player stats shared to channel!'
        });
        
    } catch (error) {
        console.error('[PlayerStats] Error:', error);
        return interaction.editReply('Failed to load player stats: ' + error.message);
    }
}
async function handleLiveRank(interaction, customPlayerData = null) {
    try {
        return interaction.editReply({
            content: "The Live Rank feature is currently disabled for maintenance.",
            embeds: [],
            components: []
        });
    } catch (error) {
        console.error('[LiveRank] Error:', error);
        return interaction.editReply('Failed to process request: ' + error.message);
    }
}

async function handleLiveBracket(interaction, customPlayerData = null) {
    try {
        // Show loading message first
        const loadingEmbed = new EmbedBuilder()
            .setTitle('Retrieving Live Bracket')
            .setDescription('Please wait while I fetch the live bracket data from thetower.lol...')
            .setColor(0x0099FF)
            .setFooter({ text: 'This may take a moment to complete' });
        
        await interaction.editReply({
            embeds: [loadingEmbed],
            content: null,
            components: [] // Clear buttons immediately
        });
        
        // Get player data - either from custom data or database
        let playerData;
        
        if (customPlayerData) {
            playerData = customPlayerData;
            console.log(`[PlayerStats] Using custom player data: ${playerData.name} (${playerData.id})`);
        } else {
            // Get player ID from database
            const discordID = interaction.user.username;
            playerData = await fetchPlayerData(discordID);
            
            if (!playerData) {
                return interaction.editReply({
                    content: "Error: No player ID found for your Discord username. Please add your Player ID first.",
                    embeds: [],
                    components: []
                });
            }
        }
        
        console.log(`[LiveBracket] Starting browser for player ID: ${playerData.id}`);
        const browser = await puppeteer.launch({
            headless: false,
            userDataDir: 'C:/Users/Josh/AppData/Local/Google/Chrome/User Data', // Real Chrome profile
            executablePath: 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
            args: ['--start-maximized']
            //args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
          }); 
        
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 1024 });
        
        console.log(`[LiveBracket] Navigating to live bracket page...`);
        await page.goto(`https://thetower.lol/livebracketview?player_id=${playerData.id}`, {
            waitUntil: ['networkidle2', 'domcontentloaded'],
            timeout: 60000
        });
        
        // Wait for the table to load
        console.log(`[LiveBracket] Waiting for bracket data to load...`);
        await page.waitForSelector('table', { timeout: 60000 });
        
        // Give it a moment more to fully render
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Extract bracket information
        console.log(`[LiveBracket] Extracting bracket data...`);
        const bracketInfo = await page.evaluate(() => {
            // Get datetime information from the page if available
            let startTime = '';
            const datetimeElements = document.querySelectorAll('p');
            datetimeElements.forEach(p => {
                if (p.textContent.includes('UTC')) {
                    startTime = p.textContent.trim();
                }
            });
            
            // Get player information from the table
            const players = [];
            const tableRows = document.querySelectorAll('table tbody tr');
            
            tableRows.forEach(row => {
                const cells = row.querySelectorAll('td');
                if (cells.length >= 4) {
                    // Get player ID from the link in the first cell
                    const playerIdLink = cells[0].querySelector('a');
                    let playerId = '';
                    if (playerIdLink && playerIdLink.href) {
                        const hrefMatch = playerIdLink.href.match(/player=([A-F0-9]+)/);
                        if (hrefMatch && hrefMatch[1]) {
                            playerId = hrefMatch[1];
                        }
                    } else {
                        // If no link, try getting from text content
                        playerId = cells[0].textContent.trim();
                    }
                    
                    // Get name, real name, and waves
                    const name = cells[1] ? cells[1].textContent.trim() : '';
                    const realName = cells[2] ? cells[2].textContent.trim() : '';
                    const waves = cells[3] ? cells[3].textContent.trim() : '';
                    
                    players.push({
                        playerId,
                        name,
                        realName,
                        waves
                    });
                }
            });
            
            return {
                startTime,
                players
            };
        });
        
        await browser.close();
        console.log(`[LiveBracket] Successfully extracted bracket data with ${bracketInfo.players.length} players`);
        
        // Format the player data into columns
        let idColumn = '';
        let nameColumn = '';
        let realNameColumn = '';
        let waveColumn = '';
        
        // Sort players by wave count (descending)
        const sortedPlayers = bracketInfo.players.sort((a, b) => 
            parseInt(b.waves) - parseInt(a.waves)
        );
        
        sortedPlayers.forEach(p => {
            idColumn += `${p.playerId}\n`;
            realNameColumn += `${p.realName}\n`;
            waveColumn += `${p.waves}\n`;
        });
        
        // Create the embed
        const bracketEmbed = new EmbedBuilder()
            .setTitle(`Live Bracket for ${playerData.name}`)
            .setColor(0x3498DB) // Blue color for brackets
            .setURL(`https://thetower.lol/livebracketview?player_id=${playerData.id}`)
            .setTimestamp();
            
        // Add tournament start time if available
        if (bracketInfo.startTime) {
            bracketEmbed.setDescription(`**Bracket started at approx:** ${bracketInfo.startTime}`);
        }
        
        // Add fields for player data columns
        bracketEmbed.addFields(
            { name: 'Player ID', value: idColumn || 'No data', inline: true },
            { name: 'Real Name', value: realNameColumn || 'No data', inline: true },
            { name: 'Waves', value: waveColumn || 'No data', inline: true }
        );
        
        // Add comparison link in footer
        bracketEmbed.setFooter({ 
            text: `View Comparison: https://thetower.lol/comparison?bracket_player=${playerData.id}` 
        });
        
        // Send the embed
        await interaction.editReply({
            embeds: [bracketEmbed],
            components: []
        });
        
        // Add share button to the message
        await createShareableMessage(interaction, {
            embeds: [bracketEmbed]
        }, {
            buttonId: 'share_bracket',
            successMessage: 'Live bracket shared to channel!'
        });
        
    } catch (error) {
        console.error('[LiveBracket] Error:', error);
        return interaction.editReply('Failed to load live bracket: ' + error.message);
    }
}

async function handleWaveComparison(interaction, customPlayerData = null) {
    try {
        // Show loading message first
        const loadingEmbed = new EmbedBuilder()
            .setTitle('Retrieving Bracket Wave Comparison Chart')
            .setDescription('Please wait while I download the wave comparison chart from thetower.lol...')
            .setColor(0x0099FF)
            .setFooter({ text: 'This may take a moment to complete' });
        
        await interaction.editReply({
            embeds: [loadingEmbed],
            content: null,
            components: [] // Clear buttons immediately
        });
        
        // Get player data - either from custom data or database
        let playerData;
        
        if (customPlayerData) {
            playerData = customPlayerData;
            console.log(`[PlayerStats] Using custom player data: ${playerData.name} (${playerData.id})`);
        } else {
            // Get player ID from database
            const discordID = interaction.user.username;
            playerData = await fetchPlayerData(discordID);
            
            if (!playerData) {
                return interaction.editReply({
                    content: "Error: No player ID found for your Discord username. Please add your Player ID first.",
                    embeds: [],
                    components: []
                });
            }
        }

        const browser = await puppeteer.launch({
            headless: false,
            userDataDir: 'C:/Users/Josh/AppData/Local/Google/Chrome/User Data', // Real Chrome profile
            executablePath: 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
            args: ['--start-maximized']
            //args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
          });        
        console.log(`[WaveComparison] Starting browser for player ID: ${playerData.id}`);

        const page = await browser.newPage();        
        //await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36');
        await page.setViewport({ width: 1280, height: 1024 });
        
        // Set up folder for downloads
        const downloadPath = path.resolve(__dirname, 'downloads');
        if (!fs.existsSync(downloadPath)) {
            fs.mkdirSync(downloadPath, { recursive: true });
        }
        
        // Configure browser client for downloads
        const client = await page.target().createCDPSession();
        await client.send('Page.setDownloadBehavior', {
            behavior: 'allow',
            downloadPath: downloadPath
        });
        
        // Navigate to the comparison page
        console.log(`[WaveComparison] Navigating to comparison page...`);
        await page.goto(`https://thetower.lol/comparison?bracket_player=${playerData.id}`, {
            waitUntil: ['networkidle2', 'domcontentloaded'],
            timeout: 90000
        });
        
        // Wait for the chart to load
        console.log(`[WaveComparison] Waiting for chart to load...`);
        await page.waitForSelector('.js-plotly-plot', { timeout: 60000 });
        
        // Give extra time for chart animations to complete
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Create a unique filename (for our final saved file)
        const fileName = `bracket_waves_${playerData.id}_${Date.now()}.png`;
        const filePath = path.join(downloadPath, fileName);
        
        // Click the download button for the chart
        console.log(`[WaveComparison] Clicking download button...`);
        const downloadButtonFound = await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('.modebar-btn'));
            for (const button of buttons) {
                if (button.getAttribute('data-title') === 'Download plot as a png') {
                    button.click();
                    return true;
                }
            }
            return false;
        });
        
        if (!downloadButtonFound) {
            await browser.close();
            return interaction.editReply({
                content: "Error: Could not find or click the download button for the chart.",
                embeds: [],
                components: []
            });
        }
        
        // Wait for download to complete (this is approximate)
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        await browser.close();
        
        // Check if any PNG file was created in the downloads folder in the last 10 seconds
        const files = fs.readdirSync(downloadPath);
        const pngFiles = files.filter(file => 
            file.endsWith('.png') && 
            fs.statSync(path.join(downloadPath, file)).mtime > new Date(Date.now() - 10000)
        );
        
        if (pngFiles.length === 0) {
            return interaction.editReply({
                content: "Error: Failed to download the chart image.",
                embeds: [],
                components: []
            });
        }
        
        // Use the most recently created PNG file
        const latestFile = pngFiles.sort((a, b) => 
            fs.statSync(path.join(downloadPath, b)).mtime - 
            fs.statSync(path.join(downloadPath, a)).mtime
        )[0];
        
        // Rename it to our standard filename
        fs.copyFileSync(path.join(downloadPath, latestFile), filePath);
        
        // Create attachment for Discord
        const attachment = new AttachmentBuilder(filePath, { name: fileName });
        
        // Create embed with the image
        const chartEmbed = new EmbedBuilder()
            .setTitle(`Bracket Wave Comparison Chart for ${playerData.name}`)
            .setColor(0x3498DB)
            .setURL(`https://thetower.lol/comparison?bracket_player=${playerData.id}`)
            .setImage(`attachment://${fileName}`)
            .setDescription(`[View Interactive Chart on TheTower.lol](https://thetower.lol/comparison?bracket_player=${playerData.id})`)
            .setFooter({ text: 'Chart retrieved from thetower.lol' })
            .setTimestamp();
        
        // Send the embed with the image
        await interaction.editReply({
            content: null,
            embeds: [chartEmbed],
            files: [attachment],
            components: []
        });
        
        // Add share button
        await createShareableMessage(interaction, {
            embeds: [chartEmbed],
            files: [attachment]
        }, {
            buttonId: 'share_wave_chart',
            successMessage: 'Wave comparison chart shared to channel!'
        });
        
        // Clean up the files after sending
        try {
            // Clean up both the original downloaded file and our renamed copy
            if (latestFile !== fileName) {
                fs.unlinkSync(path.join(downloadPath, latestFile));
            }
            fs.unlinkSync(filePath);
        } catch (error) {
            console.error('[WaveComparison] Error deleting temporary files:', error);
        }
        
    } catch (error) {
        console.error('[WaveComparison] Error:', error);
        return interaction.editReply('Failed to generate wave comparison chart: ' + error.message);
    }
}

async function handleRankComparison(interaction, customPlayerData = null) {
    try {
        // Show loading message first
        const loadingEmbed = new EmbedBuilder()
            .setTitle('Retrieving Bracket Rank Comparison Chart')
            .setDescription('Please wait while I download the rank comparison chart from thetower.lol...')
            .setColor(0x0099FF)
            .setFooter({ text: 'This may take a moment to complete' });
        
        await interaction.editReply({
            embeds: [loadingEmbed],
            content: null,
            components: [] // Clear buttons immediately
        });
        
        // Get player data - either from custom data or database
        let playerData;
        
        if (customPlayerData) {
            playerData = customPlayerData;
            console.log(`[PlayerStats] Using custom player data: ${playerData.name} (${playerData.id})`);
        } else {
            // Get player ID from database
            const discordID = interaction.user.username;
            playerData = await fetchPlayerData(discordID);
            
            if (!playerData) {
                return interaction.editReply({
                    content: "Error: No player ID found for your Discord username. Please add your Player ID first.",
                    embeds: [],
                    components: []
                });
            }
        }
        
        console.log(`[RankComparison] Starting browser for player ID: ${playerData.id}`);
        const browser = await puppeteer.launch({
            headless: false,
            userDataDir: 'C:/Users/Josh/AppData/Local/Google/Chrome/User Data', // Real Chrome profile
            executablePath: 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
            args: ['--start-maximized']
            //args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
          }); 
        
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 1024 });
        
        // Set up folder for downloads
        const downloadPath = path.resolve(__dirname, 'downloads');
        if (!fs.existsSync(downloadPath)) {
            fs.mkdirSync(downloadPath, { recursive: true });
        }
        
        // Configure browser client for downloads
        const client = await page.target().createCDPSession();
        await client.send('Page.setDownloadBehavior', {
            behavior: 'allow',
            downloadPath: downloadPath
        });
        
        // Navigate to the comparison page
        console.log(`[RankComparison] Navigating to comparison page...`);
        await page.goto(`https://thetower.lol/comparison?bracket_player=${playerData.id}`, {
            waitUntil: ['networkidle2', 'domcontentloaded'],
            timeout: 90000
        });
        
        // Wait for the chart to load
        console.log(`[RankComparison] Waiting for chart to load...`);
        await page.waitForSelector('.js-plotly-plot', { timeout: 60000 });
        
        // Give extra time for chart animations to complete
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Create a unique filename (for our final saved file)
        const fileName = `bracket_ranks_${playerData.id}_${Date.now()}.png`;
        const filePath = path.join(downloadPath, fileName);
        
        // Click the download button for the SECOND chart
        console.log(`[RankComparison] Clicking download button for rank chart...`);
        const downloadButtonFound = await page.evaluate(() => {
            // Get all download buttons
            const buttons = Array.from(document.querySelectorAll('.modebar-btn[data-title="Download plot as a png"]'));
            
            // Check if we have at least 2 buttons (for 2 charts)
            if (buttons.length < 2) {
                return false;
            }
            
            // Click the second chart's download button
            buttons[1].click();
            return true;
        });
        
        if (!downloadButtonFound) {
            await browser.close();
            return interaction.editReply({
                content: "Error: Could not find or click the download button for the rank chart.",
                embeds: [],
                components: []
            });
        }
        
        // Wait for download to complete (this is approximate)
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        await browser.close();
        
        // Check if any PNG file was created in the downloads folder in the last 10 seconds
        const files = fs.readdirSync(downloadPath);
        const pngFiles = files.filter(file => 
            file.endsWith('.png') && 
            fs.statSync(path.join(downloadPath, file)).mtime > new Date(Date.now() - 10000)
        );
        
        if (pngFiles.length === 0) {
            return interaction.editReply({
                content: "Error: Failed to download the chart image.",
                embeds: [],
                components: []
            });
        }
        
        // Use the most recently created PNG file
        const latestFile = pngFiles.sort((a, b) => 
            fs.statSync(path.join(downloadPath, b)).mtime - 
            fs.statSync(path.join(downloadPath, a)).mtime
        )[0];
        
        // Rename it to our standard filename
        fs.copyFileSync(path.join(downloadPath, latestFile), filePath);
        
        // Create attachment for Discord
        const attachment = new AttachmentBuilder(filePath, { name: fileName });
        
        // Create embed with the image
        const chartEmbed = new EmbedBuilder()
            .setTitle(`Bracket Rank Comparison Chart for ${playerData.name}`)
            .setColor(0x3498DB)
            .setURL(`https://thetower.lol/comparison?bracket_player=${playerData.id}`)
            .setImage(`attachment://${fileName}`)
            .setDescription(`[View Interactive Chart on TheTower.lol](https://thetower.lol/comparison?bracket_player=${playerData.id})`)
            .setFooter({ text: 'Chart retrieved from thetower.lol' })
            .setTimestamp();
        
        // Send the embed with the image
        await interaction.editReply({
            content: null,
            embeds: [chartEmbed],
            files: [attachment],
            components: []
        });
        
        // Add share button
        await createShareableMessage(interaction, {
            embeds: [chartEmbed],
            files: [attachment]
        }, {
            buttonId: 'share_rank_chart',
            successMessage: 'Rank comparison chart shared to channel!'
        });
        
        // Clean up the files after sending
        try {
            // Clean up both the original downloaded file and our renamed copy
            if (latestFile !== fileName) {
                fs.unlinkSync(path.join(downloadPath, latestFile));
            }
            fs.unlinkSync(filePath);
        } catch (error) {
            console.error('[RankComparison] Error deleting temporary files:', error);
        }
        
    } catch (error) {
        console.error('[RankComparison] Error:', error);
        return interaction.editReply('Failed to generate rank comparison chart: ' + error.message);
    }
}

async function handleJoinTimeComparison(interaction, customPlayerData = null) {
    try {
        // Show loading message first
        const loadingEmbed = new EmbedBuilder()
            .setTitle('Retrieving Bracket Join Time Comparison Chart')
            .setDescription('Please wait while I download the comparison chart from thetower.lol...')
            .setColor(0x0099FF)
            .setFooter({ text: 'This may take a moment to complete' });
        
        await interaction.editReply({
            embeds: [loadingEmbed],
            content: null,
            components: [] // Clear buttons immediately
        });
        
        // Get player data - either from custom data or database
        let playerData;
        
        if (customPlayerData) {
            playerData = customPlayerData;
            console.log(`[PlayerStats] Using custom player data: ${playerData.name} (${playerData.id})`);
        } else {
            // Get player ID from database
            const discordID = interaction.user.username;
            playerData = await fetchPlayerData(discordID);
            
            if (!playerData) {
                return interaction.editReply({
                    content: "Error: No player ID found for your Discord username. Please add your Player ID first.",
                    embeds: [],
                    components: []
                });
            }
        }
        
        console.log(`[JoinComparison] Starting browser for player ID: ${playerData.id}`);
        const browser = await puppeteer.launch({
            headless: false,
            userDataDir: 'C:/Users/Josh/AppData/Local/Google/Chrome/User Data', // Real Chrome profile
            executablePath: 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
            args: ['--start-maximized']
            //args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
          }); 
        
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 1024 });
        
        // Set up folder for downloads
        const downloadPath = path.resolve(__dirname, 'downloads');
        if (!fs.existsSync(downloadPath)) {
            fs.mkdirSync(downloadPath, { recursive: true });
        }
        
        // Configure browser client for downloads
        const client = await page.target().createCDPSession();
        await client.send('Page.setDownloadBehavior', {
            behavior: 'allow',
            downloadPath: downloadPath
        });
        
        // Navigate to the comparison page
        console.log(`[JoinComparison] Navigating to comparison page...`);
        await page.goto(`https://thetower.lol/livebracketview?player_id=${playerData.id}`, {
            waitUntil: ['networkidle2', 'domcontentloaded'],
            timeout: 90000
        });

        const fileName = `join_times_${playerData.id}_${Date.now()}.png`;
        const filePath = path.join(downloadPath, fileName);

        // Wait for the chart to load
        console.log(`[JoinComparison] Waiting for chart to load...`);
        await page.waitForSelector('.js-plotly-plot', { timeout: 60000 });
        
        // Give extra time for chart animations to complete
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Click the download button for the chart
        console.log(`[JoinComparison] Clicking download button...`);
        const downloadButtonFound = await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('.modebar-btn'));
            for (const button of buttons) {
                if (button.getAttribute('data-title') === 'Download plot as a png') {
                    button.click();
                    return true;
                }
            }
            return false;
        });
        
        if (!downloadButtonFound) {
            await browser.close();
            return interaction.editReply({
                content: "Error: Could not find or click the download button for the chart.",
                embeds: [],
                components: []
            });
        }
        
        // Wait for download to complete (this is approximate)
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        await browser.close();
        
        // Check if any PNG file was created in the downloads folder in the last 10 seconds
        const files = fs.readdirSync(downloadPath);
        const pngFiles = files.filter(file => 
            file.endsWith('.png') && 
            fs.statSync(path.join(downloadPath, file)).mtime > new Date(Date.now() - 10000)
        );
        
        if (pngFiles.length === 0) {
            return interaction.editReply({
                content: "Error: Failed to download the chart image.",
                embeds: [],
                components: []
            });
        }
        
        // Use the most recently created PNG file
        const latestFile = pngFiles.sort((a, b) => 
            fs.statSync(path.join(downloadPath, b)).mtime - 
            fs.statSync(path.join(downloadPath, a)).mtime
        )[0];
        
        // Rename it to our standard filename
        fs.copyFileSync(path.join(downloadPath, latestFile), filePath);
        
        // Create attachment for Discord
        const attachment = new AttachmentBuilder(filePath, { name: fileName });
        
        // Create embed with the image
        const chartEmbed = new EmbedBuilder()
            .setTitle(`Bracket Join Time Comparison Chart for ${playerData.name}`)
            .setColor(0x3498DB)
            .setURL(`https://thetower.lol/livebracketview?player_id=${playerData.id}`)
            .setImage(`attachment://${fileName}`)
            .setDescription(`[View Interactive Chart on TheTower.lol](https://thetower.lol/comparison?bracket_player=${playerData.id})`)
            .setFooter({ text: 'Chart retrieved from thetower.lol' })
            .setTimestamp();
        
        // Send the embed with the image
        await interaction.editReply({
            content: null,
            embeds: [chartEmbed],
            files: [attachment],
            components: []
        });
        
        // Add share button
        await createShareableMessage(interaction, {
            embeds: [chartEmbed],
            files: [attachment]
        }, {
            buttonId: 'share_rank_chart',
            successMessage: 'Rank comparison chart shared to channel!'
        });
        
        // Clean up the files after sending
        try {
            // Clean up both the original downloaded file and our renamed copy
            if (latestFile !== fileName) {
                fs.unlinkSync(path.join(downloadPath, latestFile));
            }
            fs.unlinkSync(filePath);
        } catch (error) {
            console.error('[JoinComparison] Error deleting temporary files:', error);
        }
        
    } catch (error) {
        console.error('[JoinComparison] Error:', error);
        return interaction.editReply('Failed to generate rank comparison chart: ' + error.message);
    }
}

async function handlePlacementAnalysis(interaction, customPlayerData = null) {
    try {
        // Show loading message first
        const loadingEmbed = new EmbedBuilder()
            .setTitle('Retrieving Placement Analysis')
            .setDescription('Please wait while I download the placement analysis chart from thetower.lol...')
            .setColor(0x0099FF)
            .setFooter({ text: 'This may take a moment to complete' });
        
        await interaction.editReply({
            embeds: [loadingEmbed],
            content: null,
            components: [] // Clear buttons immediately
        });
        
        // Get player data - either from custom data or database
        let playerData;
        
        if (customPlayerData) {
            playerData = customPlayerData;
            console.log(`[PlayerStats] Using custom player data: ${playerData.name} (${playerData.id})`);
        } else {
            // Get player ID from database
            const discordID = interaction.user.username;
            playerData = await fetchPlayerData(discordID);
            
            if (!playerData) {
                return interaction.editReply({
                    content: "Error: No player ID found for your Discord username. Please add your Player ID first.",
                    embeds: [],
                    components: []
                });
            }
        }
        
        console.log(`[PlacementAnalysis] Starting browser for player: ${playerData.name}`);
        const browser = await puppeteer.launch({
            headless: false,
            userDataDir: 'C:/Users/Josh/AppData/Local/Google/Chrome/User Data', // Real Chrome profile
            executablePath: 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
            args: ['--start-maximized']
            //args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
          }); 
        
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 1024 });
        
        // Set up folder for downloads
        const downloadPath = path.resolve(__dirname, 'downloads');
        if (!fs.existsSync(downloadPath)) {
            fs.mkdirSync(downloadPath, { recursive: true });
        }
        
        // Configure browser client for downloads
        const client = await page.target().createCDPSession();
        await client.send('Page.setDownloadBehavior', {
            behavior: 'allow',
            downloadPath: downloadPath
        });
        
        // Navigate to the placement analysis page
        console.log(`[PlacementAnalysis] Navigating to placement analysis page...`);
        await page.goto('https://thetower.lol/liveplacement', {
            waitUntil: ['networkidle2', 'domcontentloaded'],
            timeout: 90000
        });
        
        // Wait for the page to load (look for the search box)
        console.log(`[PlacementAnalysis] Waiting for page to load...`);
        await page.waitForSelector('.stSelectbox', { timeout: 60000 });
        
        // Extra wait to ensure UI is fully loaded
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Enter player name in search field - use name, not ID
        console.log(`[PlacementAnalysis] Entering player name: ${playerData.name}`);
        
        // Click on the selectbox to open dropdown
        await page.click('.stSelectbox');
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Type in the player name
        await page.keyboard.type(playerData.name);
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Press Enter to select
        await page.keyboard.press('Enter');
        
        // Wait for chart to load after selection
        console.log(`[PlacementAnalysis] Waiting for chart to render...`);
        await page.waitForSelector('.js-plotly-plot', { timeout: 60000 });
        
        // Give extra time for chart animations to complete
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Get the number of waves from the chart title
        const waves = await page.evaluate(() => {
            const titleElement = document.querySelector('.gtitle');
            if (!titleElement) return 'unknown number of';
            
            const titleText = titleElement.textContent;
            const match = titleText.match(/for (\d+) waves/);
            return match ? match[1] : 'unknown number of';
        });
        
        // Create a unique filename
        const fileName = `placement_analysis_${playerData.name.replace(/\s+/g, '_')}_${Date.now()}.png`;
        const filePath = path.join(downloadPath, fileName);
        
        // Click the download button for the chart
        console.log(`[PlacementAnalysis] Clicking download button...`);
        const downloadButtonFound = await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('.modebar-btn'));
            for (const button of buttons) {
                if (button.getAttribute('data-title') === 'Download plot as a png') {
                    button.click();
                    return true;
                }
            }
            return false;
        });
        
        if (!downloadButtonFound) {
            await browser.close();
            return interaction.editReply({
                content: "Error: Could not find or click the download button for the chart.",
                embeds: [],
                components: []
            });
        }
        
        // Wait for download to complete
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        await browser.close();
        
        // Check if any PNG file was created in the downloads folder in the last 10 seconds
        const files = fs.readdirSync(downloadPath);
        const pngFiles = files.filter(file => 
            file.endsWith('.png') && 
            fs.statSync(path.join(downloadPath, file)).mtime > new Date(Date.now() - 10000)
        );
        
        if (pngFiles.length === 0) {
            return interaction.editReply({
                content: "Error: Failed to download the chart image.",
                embeds: [],
                components: []
            });
        }
        
        // Use the most recently created PNG file
        const latestFile = pngFiles.sort((a, b) => 
            fs.statSync(path.join(downloadPath, b)).mtime - 
            fs.statSync(path.join(downloadPath, a)).mtime
        )[0];
        
        // Rename it to our standard filename
        fs.copyFileSync(path.join(downloadPath, latestFile), filePath);
        
        // Create attachment for Discord
        const attachment = new AttachmentBuilder(filePath, { name: fileName });
        
        // Create embed with the formatted message as requested
        const chartEmbed = new EmbedBuilder()
            .setTitle(`Placement Analysis for ${playerData.name}`)
            .setColor(0x9B59B6) // Purple color for placement analysis
            .setURL(`https://thetower.lol/liveplacement`)
            .setImage(`attachment://${fileName}`)
            .setDescription(`Placement timeline for ${waves} waves.`)
            .setFooter({ text: 'Chart retrieved from thetower.lol' })
            .setTimestamp();
        
        // Send the embed with the image
        await interaction.editReply({
            content: null,
            embeds: [chartEmbed],
            files: [attachment],
            components: []
        });
        
        // Add share button
        await createShareableMessage(interaction, {
            embeds: [chartEmbed],
            files: [attachment]
        }, {
            buttonId: 'share_placement_analysis',
            successMessage: 'Placement analysis shared to channel!'
        });
        
        // Clean up the files after sending
        try {
            // Clean up both the original downloaded file and our renamed copy
            if (latestFile !== fileName) {
                fs.unlinkSync(path.join(downloadPath, latestFile));
            }
            fs.unlinkSync(filePath);
        } catch (error) {
            console.error('[PlacementAnalysis] Error deleting temporary files:', error);
        }
        
    } catch (error) {
        console.error('[PlacementAnalysis] Error:', error);
        return interaction.editReply('Failed to generate placement analysis: ' + error.message);
    }
}

// Utility: Fetch player ID from database
async function fetchPlayerData(discordID) {
    const db = new Database(dbFilePath);
    try {
      const query = `SELECT player_id, player_name FROM members WHERE discord_id = ?`;
      const row = db.prepare(query).get(discordID);
      return row ? { id: row.player_id, name: row.player_name } : null;
    } catch (error) {
      console.error('Error fetching player data:', error);
      return null;
    } finally {
      db.close();
    }
}

// Helper function to update player name in database
async function updatePlayerName(discordID, playerID, playerName) {
    const db = new Database(dbFilePath);
    try {
        db.prepare("UPDATE members SET player_name = ? WHERE discord_id = ? AND player_id = ?")
            .run(playerName, discordID, playerID);
        return true;
    } catch (error) {
        console.error('Error updating player name:', error);
        return false;
    } finally {
        db.close();
    }
}