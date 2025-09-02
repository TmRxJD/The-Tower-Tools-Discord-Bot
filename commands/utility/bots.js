console.log('bots.js loaded');
const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder } = require('discord.js');
const { formatNumberOutput } = require('./statFinderFunctions.js');


// Import bot data arrays with fallback and debug log
const botUpgradesImport = require('./chartFunctions/botUpgradesChart.js');
const BOT_UPGRADES_DATA = botUpgradesImport && botUpgradesImport.BOT_UPGRADES_DATA ? botUpgradesImport.BOT_UPGRADES_DATA : {};
if (!BOT_UPGRADES_DATA || typeof BOT_UPGRADES_DATA !== 'object') {
    throw new Error('BOT_UPGRADES_DATA is not defined or not an object. Check the export in botUpgradesChart.js');
}

// Bot dropdown options from imported data, with fallback if empty

const BOT_NAMES = ['Flame Bot', 'Thunder Bot', 'Coin Bot', 'Amplify Bot'];
let BOT_OPTIONS = BOT_NAMES.filter(name => BOT_UPGRADES_DATA[name]).map(label => ({ label, value: label }));
if (BOT_OPTIONS.length === 0) {
    BOT_OPTIONS = [{ label: 'No bots available', value: 'none' }];
}

// Default user settings
function getDefaultBotSettings() {
    return {
        bot: BOT_OPTIONS[0]?.value || '',
        labs: '',
        medals: ''
    };
}

// Modal input configuration for medals (dynamically generated)
function createMedalsModal(settings = {}, botName = '') {
    const merged = { ...getDefaultBotSettings(), ...settings };
    const modal = new ModalBuilder()
        .setCustomId('bots_medals_modal')
        .setTitle('Bot Medals');

    let inputs = [];
    // Dynamically add only the correct medal fields for the selected bot
    const botData = BOT_UPGRADES_DATA[botName || merged.bot];
    if (botData && Array.isArray(botData.headers)) {
        botData.headers.forEach((header, idx) => {
            const lower = header.toLowerCase();
            if (lower === 'level' || lower === 'medals') return;
            // Do NOT filter out headers that match lab names; allow duplicate stat names
            const id = `medal_${header.replace(/\s+/g, '_').toLowerCase()}`;
            const value = merged[id] !== undefined ? String(merged[id]) : '';
            const textInput = new TextInputBuilder()
                .setCustomId(id)
                .setLabel(header)
                .setStyle(TextInputStyle.Short)
                .setRequired(false)
                .setPlaceholder('-')
                .setValue(value);
            inputs.push(new ActionRowBuilder().addComponents(textInput));
        });
    }
    modal.addComponents(...inputs);
    return modal;
}

function createBotModal(settings = {}, botName = '') {
    const merged = { ...getDefaultBotSettings(), ...settings };
    const modal = new ModalBuilder()
        .setCustomId('bots_settings_modal')
        .setTitle('Bot Labs');

    let inputs = [];
    // Dynamically add lab inputs for the selected bot
    const botData = BOT_UPGRADES_DATA[botName || merged.bot];
    if (botData && Array.isArray(botData.labInfo)) {
        // Skip the header row (index 0)
        for (let i = 1; i < botData.labInfo.length; i++) {
            const [labName, maxLevel] = botData.labInfo[i];
            const id = `lab_${labName.replace(/\s+/g, '_').toLowerCase()}`;
            const value = merged[id] !== undefined ? String(merged[id]) : '';
            const textInput = new TextInputBuilder()
                .setCustomId(id)
                .setLabel(`${labName} (Max ${maxLevel})`)
                .setStyle(TextInputStyle.Short)
                .setRequired(false)
                .setPlaceholder('0')
                .setValue(value);
            inputs.push(new ActionRowBuilder().addComponents(textInput));
        }
    }

    modal.addComponents(...inputs);
    return modal;
}

module.exports = {
    category: 'utility',
    data: new SlashCommandBuilder()
        .setName('bots')
        .setDescription('Bot upgrades calculator (labs/medals).'),
    async execute(interaction) {
        // In-memory user settings for this session (replace with persistent if needed)
        if (!interaction.client.botsUserSettings) interaction.client.botsUserSettings = {};
        const userId = interaction.user.id;
        let settings = interaction.client.botsUserSettings[userId] || getDefaultBotSettings();

        // Generate BOT_OPTIONS and log for debugging

        let BOT_OPTIONS = Object.keys(BOT_UPGRADES_DATA).map(label => ({ label, value: label }));

        if (BOT_OPTIONS.length === 0) {
            BOT_OPTIONS = [{ label: 'No bots available', value: 'none' }];
        }

        // Bot dropdown
        const botMenu = new StringSelectMenuBuilder()
            .setCustomId('bots_select')
            .setPlaceholder('Select Bot')
            .addOptions(BOT_OPTIONS.map(opt => ({ label: opt.label, value: opt.value, default: opt.value === settings.bot })));

        // Modal buttons
        const labsButton = new ButtonBuilder()
            .setCustomId('bots_labs')
            .setLabel('Enter Labs')
            .setStyle(ButtonStyle.Primary);
        const medalsButton = new ButtonBuilder()
            .setCustomId('bots_medals')
            .setLabel('Enter Medals')
            .setStyle(ButtonStyle.Primary);

        // Build embed fields: only show correct medal and lab fields
        const botData = BOT_UPGRADES_DATA[settings.bot];
        let embedFields = [];
        // Medal fields: all headers except 'Level' and 'Medals' (allow duplicate stat names)
        if (botData && Array.isArray(botData.headers)) {
            botData.headers.forEach((header, idx) => {
                const lower = header.toLowerCase();
                if (lower === 'level' || lower === 'medals') return;
                // Do NOT filter out headers that match lab names; allow duplicate stat names
                const id = `medal_${header.replace(/\s+/g, '_').toLowerCase()}`;
                let value = settings[id] !== undefined && settings[id] !== '' ? settings[id] : '-';
                // If a level is present for this stat, show as value (level)
                const levelId = `level_${header.replace(/\s+/g, '_').toLowerCase()}`;
                if (settings[levelId] !== undefined && settings[levelId] !== '') {
                    value += ` (${settings[levelId]})`;
                }
                embedFields.push({ name: header, value, inline: true });
            });
        }
        // Lab fields: all labs in labInfo
        if (botData && Array.isArray(botData.labInfo)) {
            for (let i = 1; i < botData.labInfo.length; i++) {
                const [labName] = botData.labInfo[i];
                const id = `lab_${labName.replace(/\s+/g, '_').toLowerCase()}`;
                let value = settings[id] !== undefined && settings[id] !== '' ? settings[id] : '-';
                // If a level is present for this lab, show as value (level)
                const levelId = `level_lab_${labName.replace(/\s+/g, '_').toLowerCase()}`;
                if (settings[levelId] !== undefined && settings[levelId] !== '') {
                    value += ` (${settings[levelId]})`;
                }
                embedFields.push({ name: `Lab ${labName}`, value, inline: true });
            }
        }
        const embed = new EmbedBuilder()
            .setTitle('Bot Upgrades Calculator')
            .setColor(0xFF9800)
            .setDescription('Select a bot and enter your labs/medals. (Calculation logic coming soon)')
            .addFields(embedFields);

        // Components
        const components = [
            new ActionRowBuilder().addComponents(botMenu),
            new ActionRowBuilder().addComponents(labsButton, medalsButton)
        ];

        // Always update the same message, never send a new one
        if (!interaction.replied && !interaction.deferred) {
            await interaction.deferReply({ ephemeral: true });
        }
        await interaction.editReply({
            embeds: [embed],
            components
        });

        // Handler
        if (!interaction.client.botsHandlerRegistered) {
            interaction.client.on('interactionCreate', async int => {
                if (!int.isStringSelectMenu() && !int.isButton() && !int.isModalSubmit()) return;
                if (!['bots_select', 'bots_labs', 'bots_medals'].includes(int.customId) && int.customId !== 'bots_settings_modal') return;
                const userId = int.user.id;
                let settings = interaction.client.botsUserSettings[userId] || getDefaultBotSettings();
                // Handle select menu (bot select)
                if (int.isStringSelectMenu() && int.customId === 'bots_select') {
                    settings.bot = int.values[0];
                    interaction.client.botsUserSettings[userId] = settings;
                    // Rebuild UI and update the message
                    let BOT_OPTIONS = Object.keys(BOT_UPGRADES_DATA).map(label => ({ label, value: label }));
                    if (BOT_OPTIONS.length === 0) {
                        BOT_OPTIONS = [{ label: 'No bots available', value: 'none' }];
                    }
                    const botMenu = new StringSelectMenuBuilder()
                        .setCustomId('bots_select')
                        .setPlaceholder('Select Bot')
                        .addOptions(BOT_OPTIONS.map(opt => ({ label: opt.label, value: opt.value, default: opt.value === settings.bot })));
                    const labsButton = new ButtonBuilder()
                        .setCustomId('bots_labs')
                        .setLabel('Enter Labs')
                        .setStyle(ButtonStyle.Primary);
                    const medalsButton = new ButtonBuilder()
                        .setCustomId('bots_medals')
                        .setLabel('Enter Medals')
                        .setStyle(ButtonStyle.Primary);
                    // Build embed fields for medal stats and lab stats
                    const botData = BOT_UPGRADES_DATA[settings.bot];
                    let medalFields = [];
                    let labFields = [];
                    if (botData && Array.isArray(botData.headers)) {
                        botData.headers.forEach((header, idx) => {
                            if (header.toLowerCase() === 'level') return;
                            if (botData.labInfo && botData.labInfo.some(lab => lab[0].toLowerCase() === header.toLowerCase())) return;
                            const id = header.toLowerCase() === 'medals' ? 'medals' : `medal_${header.replace(/\s+/g, '_').toLowerCase()}`;
                            const value = settings[id] !== undefined && settings[id] !== '' ? settings[id] : '-';
                            medalFields.push({ name: header, value, inline: true });
                        });
                    }
                    if (botData && Array.isArray(botData.labInfo)) {
                        for (let i = 1; i < botData.labInfo.length; i++) {
                            const [labName] = botData.labInfo[i];
                            const id = `lab_${labName.replace(/\s+/g, '_').toLowerCase()}`;
                            const value = settings[id] !== undefined && settings[id] !== '' ? settings[id] : '-';
                            labFields.push({ name: labName, value, inline: true });
                        }
                    }
                    const embed = new EmbedBuilder()
                        .setTitle('Bot Upgrades Calculator')
                        .setColor(0xFF9800)
                        .setDescription('Select a bot and enter your labs/medals. (Calculation logic coming soon)')
                        .addFields([...medalFields, ...labFields]);
                    const components = [
                        new ActionRowBuilder().addComponents(botMenu),
                        new ActionRowBuilder().addComponents(labsButton, medalsButton)
                    ];
                    await int.update({ embeds: [embed], components });
                } else if (int.isButton() && int.customId === 'bots_labs') {
                    // Show modal for labs, never defer or reply here
                    const modal = createBotModal(settings, settings.bot);
                    await int.showModal(modal);
                } else if (int.isButton() && int.customId === 'bots_medals') {
                    // Show modal for medals, never defer or reply here
                    const modal = createMedalsModal(settings, settings.bot);
                    await int.showModal(modal);
                } else if (int.isModalSubmit() && int.customId === 'bots_settings_modal') {
                    // Save all lab fields dynamically
                    const botData = BOT_UPGRADES_DATA[settings.bot];
                    if (botData && Array.isArray(botData.labInfo)) {
                        for (let i = 1; i < botData.labInfo.length; i++) {
                            const [labName] = botData.labInfo[i];
                            const id = `lab_${labName.replace(/\s+/g, '_').toLowerCase()}`;
                            settings[id] = int.fields.getTextInputValue(id);
                        }
                    }
                    interaction.client.botsUserSettings[userId] = settings;
                    // Build embed/components as in execute
                    let BOT_OPTIONS = Object.keys(BOT_UPGRADES_DATA).map(label => ({ label, value: label }));
                    if (BOT_OPTIONS.length === 0) {
                        BOT_OPTIONS = [{ label: 'No bots available', value: 'none' }];
                    }
                    const botMenu = new StringSelectMenuBuilder()
                        .setCustomId('bots_select')
                        .setPlaceholder('Select Bot')
                        .addOptions(BOT_OPTIONS.map(opt => ({ label: opt.label, value: opt.value, default: opt.value === settings.bot })));
                    const labsButton = new ButtonBuilder()
                        .setCustomId('bots_labs')
                        .setLabel('Enter Labs')
                        .setStyle(ButtonStyle.Primary);
                    const medalsButton = new ButtonBuilder()
                        .setCustomId('bots_medals')
                        .setLabel('Enter Medals')
                        .setStyle(ButtonStyle.Primary);
                    // Build embed fields for medal stats and lab stats
                    let medalFields = [];
                    let labFields = [];
                    if (botData && Array.isArray(botData.headers)) {
                        botData.headers.forEach((header, idx) => {
                            if (header.toLowerCase() === 'level') return;
                            if (botData.labInfo && botData.labInfo.some(lab => lab[0].toLowerCase() === header.toLowerCase())) return;
                            const id = header.toLowerCase() === 'medals' ? 'medals' : `medal_${header.replace(/\s+/g, '_').toLowerCase()}`;
                            const value = settings[id] !== undefined && settings[id] !== '' ? settings[id] : '-';
                            medalFields.push({ name: header, value, inline: true });
                        });
                    }
                    if (botData && Array.isArray(botData.labInfo)) {
                        for (let i = 1; i < botData.labInfo.length; i++) {
                            const [labName] = botData.labInfo[i];
                            const id = `lab_${labName.replace(/\s+/g, '_').toLowerCase()}`;
                            const value = settings[id] !== undefined && settings[id] !== '' ? settings[id] : '-';
                            labFields.push({ name: labName, value, inline: true });
                        }
                    }
                    const embed = new EmbedBuilder()
                        .setTitle('Bot Upgrades Calculator')
                        .setColor(0xFF9800)
                        .setDescription('Select a bot and enter your labs/medals. (Calculation logic coming soon)')
                        .addFields([...medalFields, ...labFields]);
                    const components = [
                        new ActionRowBuilder().addComponents(botMenu),
                        new ActionRowBuilder().addComponents(labsButton, medalsButton)
                    ];
                    await int.update({ embeds: [embed], components });
                } else if (int.isModalSubmit() && int.customId === 'bots_medals_modal') {
                    // Save all medal fields dynamically
                    const botData = BOT_UPGRADES_DATA[settings.bot];
                    if (botData && Array.isArray(botData.headers)) {
                        // Save medals
                        const medalIdx = botData.headers.findIndex(h => h.toLowerCase().includes('medal'));
                        if (medalIdx !== -1) {
                            settings['medals'] = int.fields.getTextInputValue('medals');
                        }
                        // Save other medal-related fields
                        botData.headers.forEach((header, idx) => {
                            if (["level", "medals"].includes(header.toLowerCase())) return;
                            if (botData.labInfo && botData.labInfo.some(lab => lab[0].toLowerCase() === header.toLowerCase())) return;
                            const id = `medal_${header.replace(/\s+/g, '_').toLowerCase()}`;
                            settings[id] = int.fields.getTextInputValue(id);
                        });
                    }
                    interaction.client.botsUserSettings[userId] = settings;
                    // Build embed fields for medal stats and lab stats only
                    let BOT_OPTIONS = Object.keys(BOT_UPGRADES_DATA).map(label => ({ label, value: label }));
                    if (BOT_OPTIONS.length === 0) {
                        BOT_OPTIONS = [{ label: 'No bots available', value: 'none' }];
                    }
                    const botMenu = new StringSelectMenuBuilder()
                        .setCustomId('bots_select')
                        .setPlaceholder('Select Bot')
                        .addOptions(BOT_OPTIONS.map(opt => ({ label: opt.label, value: opt.value, default: opt.value === settings.bot })));
                    const labsButton = new ButtonBuilder()
                        .setCustomId('bots_labs')
                        .setLabel('Enter Labs')
                        .setStyle(ButtonStyle.Primary);
                    const medalsButton = new ButtonBuilder()
                        .setCustomId('bots_medals')
                        .setLabel('Enter Medals')
                        .setStyle(ButtonStyle.Primary);
                    let medalFields = [];
                    let labFields = [];
                    if (botData && Array.isArray(botData.headers)) {
                        botData.headers.forEach((header, idx) => {
                            if (header.toLowerCase() === 'level') return;
                            if (botData.labInfo && botData.labInfo.some(lab => lab[0].toLowerCase() === header.toLowerCase())) return;
                            const id = header.toLowerCase() === 'medals' ? 'medals' : `medal_${header.replace(/\s+/g, '_').toLowerCase()}`;
                            const value = settings[id] !== undefined && settings[id] !== '' ? settings[id] : '-';
                            medalFields.push({ name: header, value, inline: true });
                        });
                    }
                    if (botData && Array.isArray(botData.labInfo)) {
                        for (let i = 1; i < botData.labInfo.length; i++) {
                            const [labName] = botData.labInfo[i];
                            const id = `lab_${labName.replace(/\s+/g, '_').toLowerCase()}`;
                            const value = settings[id] !== undefined && settings[id] !== '' ? settings[id] : '-';
                            labFields.push({ name: labName, value, inline: true });
                        }
                    }
                    const embed = new EmbedBuilder()
                        .setTitle('Bot Upgrades Calculator')
                        .setColor(0xFF9800)
                        .setDescription('Select a bot and enter your labs/medals. (Calculation logic coming soon)')
                        .addFields([...medalFields, ...labFields]);
                    const components = [
                        new ActionRowBuilder().addComponents(botMenu),
                        new ActionRowBuilder().addComponents(labsButton, medalsButton)
                    ];
                    await int.update({ embeds: [embed], components });
                }
            });
            interaction.client.botsHandlerRegistered = true;
        }
    }
};