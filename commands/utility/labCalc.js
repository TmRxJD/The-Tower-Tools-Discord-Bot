const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const LABS = require('./upgradesData/labData.js');
const { getUserSettings, saveUserSettings } = require('./dbHandler.js');
const { formatNumberOutput } = require('./statFinderFunctions.js');
const { ChartJSNodeCanvas } = require('chartjs-node-canvas');
const { createCanvas } = require('canvas');
const path = require('path');
const fs = require('fs');

// Helper to format time as HH:MM:SS
function formatTimeString(duration) {
    // duration: "HH:MM:SS"
    const [h, m, s] = duration.split(':').map(Number);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function formatLabName(input) {
    return input.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
}

function getCategories() {
    // Map of lowercase type -> original type
    const typeMap = {};
    for (const key in LABS) {
        if (LABS[key].type) {
            typeMap[LABS[key].type.toLowerCase()] = LABS[key].type;
        }
    }
    // Return array of { label, value }
    return Object.entries(typeMap).map(([value, label]) => ({ label, value }));
}

function getLabsByCategory(category) {
    // Compare type in lowercase
    return Object.entries(LABS)
        .filter(([k, v]) => v.type && v.type.toLowerCase() === category.toLowerCase())
        .map(([k, v]) => ({ key: k, name: v.name }));
}

function getLabValue(lab, level) {
    if (Array.isArray(lab.value)) {
        // Value is an array of objects, e.g. [{ 1: 200, 2: 350, ... }]
        const valueObj = lab.value[0];
        return valueObj[level] ?? 0;
    } else {
        return lab.base + lab.value * level;
    }
}

function parseDurationToHours(duration) {
    // duration: "HH:MM:SS"
    if (!duration) return 0;
    const [h, m, s] = duration.split(':').map(Number);
    return h + m / 60 + s / 3600;
}

function calculateLabChart(lab, startLevel, targetLevel, userSettings) {
    // userSettings: { labSpeed, labRelic, labDiscount, speedUp }
    const { labSpeed, labRelic, labDiscount, speedUp } = userSettings;
    const relicMultiplier = 1 + (labRelic / 100);
    let speedMultiplier = 1;
    if (lab.type.toLowerCase() === 'main' && lab.name.toLowerCase().includes('labs speed')) {
        speedMultiplier = 1; // Only relic for Lab Speed
    } else {
        speedMultiplier = 1 + (labSpeed * 0.02);
    }
    const finalMultiplier = 1 / (speedMultiplier * relicMultiplier);
    const coinDiscountMultiplier = 1 - (labDiscount * 0.003);

    // Determine available levels
    let minLevel = 1, maxLevel = 1, allLevels = [];
    if (Array.isArray(lab.levels) && lab.levels.length > 0) {
        minLevel = lab.levels[0].level;
        maxLevel = lab.levels[lab.levels.length - 1].level;
        allLevels = lab.levels.map(lvl => lvl.level);
    }

    // How many levels did the user request?
    const requestedCount = Math.abs(targetLevel - startLevel) + 1;
    const availableCount = allLevels.length;

    let selectedLevels = [];
    if (availableCount === 0) {
        selectedLevels = [];
    } else if (requestedCount >= availableCount) {
        // Show all available levels
        selectedLevels = allLevels.slice();
    } else {
        // Show the actual requested range, EXCLUDING the current lab level
        if (startLevel < targetLevel) {
            selectedLevels = allLevels.filter(lvl => lvl > startLevel && lvl <= targetLevel);
        } else {
            selectedLevels = allLevels.filter(lvl => lvl < startLevel && lvl >= targetLevel).reverse();
        }
    }

    const chart = [];
    let totalTime = 0, totalGems = 0, totalCoins = 0;
    for (const level of selectedLevels) {
        // Try to find by .level property, fallback to array index
        let levelData = lab.levels.find(lvl => lvl.level === level);
        if (!levelData && Array.isArray(lab.levels) && lab.levels[level - 1]) {
            levelData = lab.levels[level - 1];
        }
        if (!levelData) continue;
        // Try both duration formats
        let baseTime = 0;
        if (levelData.duration) {
            if (typeof levelData.duration === 'string' && levelData.duration.includes(':')) {
                baseTime = parseDurationToHours(levelData.duration);
            } else {
                baseTime = Number(levelData.duration) || 0;
            }
        }
        if (!baseTime) continue;
        const adjustedTime = baseTime * finalMultiplier / speedUp;
        // Gem cost should be based on time BEFORE speedUp
        const gems = calculateGems(baseTime * finalMultiplier);
        const coins = Math.round((levelData.cost ?? 0) * coinDiscountMultiplier);
        const value = getLabValue(lab, level);
        chart.push({ level, value, time: adjustedTime, gems, coins });
        totalTime += adjustedTime;
        totalGems += gems;
        totalCoins += coins;
    }
    // For chart title and reporting, show the actual range displayed
    const actualStart = chart.length > 0 ? chart[0].level : minLevel;
    const actualEnd = chart.length > 0 ? chart[chart.length - 1].level : maxLevel;
    return {
        chart,
        totals: { time: totalTime, gems: totalGems, coins: totalCoins },
        actualStart,
        actualEnd,
        minLevel,
        maxLevel
    };
}

function formatLabName(input) {
    return input
        .replace(/_/g, ' ') // Replace underscores with spaces
        .replace(/\b\w/g, char => char.toUpperCase()) // Capitalize each word
}

// Table-style chart image using canvas

async function generateChartImage(lab, chart, startLevel, targetLevel) {
    // New: HTML-style table with cumulative columns, summary, and user settings info
    // Columns: Level, Value, Time, Gems, Coins, Total Time, Total Gems, Total Coins
    // Use stacked headers for cumulative columns to reduce width
    const columns = [
        'Level', 'Value', 'Time', 'Gems', 'Coins', 'Total Time', 'Total\nGems', 'Total\nCoins'
    ];
    const rowHeight = 28;
    // Dynamically calculate column widths based on content
    const ctxMeasure = createCanvas(1, 1).getContext('2d');
    ctxMeasure.font = 'bold 15px Arial';
    // Helper to get max width for a column, handling stacked headers
    function getMaxColWidth(colIdx) {
        // For header, use the widest line if stacked
        const headerLines = columns[colIdx].split('\n');
        let max = Math.max(...headerLines.map(line => ctxMeasure.measureText(line).width));
        for (let rowIdx = 0; rowIdx < chart.length; rowIdx++) {
            const row = chart[rowIdx];
            let val = '';
            switch (colIdx) {
                case 0: val = row.level; break;
                case 1: val = (typeof row.value === 'number' ? row.value.toFixed(2) : ''); break;
                case 2: val = formatDuration(row.time); break;
                case 3: val = num(row.gems); break;
                case 4: val = num(row.coins); break;
                case 5: val = formatDuration(chart.slice(0, rowIdx + 1).reduce((a, b) => a + b.time, 0)); break;
                case 6: val = num(chart.slice(0, rowIdx + 1).reduce((a, b) => a + b.gems, 0)); break;
                case 7: val = num(chart.slice(0, rowIdx + 1).reduce((a, b) => a + b.coins, 0)); break;
            }
            max = Math.max(max, ctxMeasure.measureText(String(val)).width);
        }
        // Add some padding
        return Math.ceil(max) + 18;
    }
    const colWidths = columns.map((_, idx) => getMaxColWidth(idx));
    const width = colWidths.reduce((a, b) => a + b, 0) + 1;
    const tableRows = chart.length + 1 + 1; // header + data + summary
    const settingsSectionHeight = 60;
    const titleHeight = 40;
    const height = tableRows * rowHeight + titleHeight + settingsSectionHeight + 20;

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Helper: format duration as 1d 2h 3m 4s
    function formatDuration(hours) {
        const totalSeconds = Math.round(hours * 3600);
        const d = Math.floor(totalSeconds / (3600 * 24));
        const h = Math.floor((totalSeconds % (3600 * 24)) / 3600);
        const m = Math.floor((totalSeconds % 3600) / 60);
        const s = totalSeconds % 60;
        let out = '';
        if (d > 0) out += `${d}d `;
        if (h > 0 || d > 0) out += `${h}h `;
        if (m > 0 || h > 0 || d > 0) out += `${m}m `;
        out += `${s}s`;
        return out.trim();
    }

    // Helper: number formatting
    function num(val) {
        return typeof val === 'number' && !isNaN(val) ? formatNumberOutput(val) : '';
    }

    // --- DARK MODE AESTHETIC ---
    // Background
    ctx.fillStyle = '#181a20';
    ctx.fillRect(0, 0, width, height);

    // Title (centered, light text)
    ctx.font = 'bold 22px Arial';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    // If chart has clamped levels, use those for the title
    let actualStart = startLevel, actualEnd = targetLevel;
    if (Array.isArray(chart) && chart.length > 0) {
        actualStart = chart[0].level;
        actualEnd = chart[chart.length - 1].level;
    }
    ctx.fillText(`${formatLabName(lab.name)} (Levels ${actualStart} - ${actualEnd})`, width / 2, 30);

    // Table header (dark green), support stacked headers
    let x = 0;
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    for (let i = 0; i < columns.length; i++) {
        ctx.fillStyle = '#1e3a2a';
        ctx.fillRect(x, titleHeight, colWidths[i], rowHeight);
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, titleHeight, colWidths[i], rowHeight);
        ctx.fillStyle = '#b6fcd5';
        // If header contains \n, stack the lines vertically
        const headerLines = columns[i].split('\n');
        const lineHeight = 16; // px
        const totalHeaderHeight = headerLines.length * lineHeight;
        const startY = titleHeight + (rowHeight - totalHeaderHeight) / 2 + lineHeight - 2;
        for (let j = 0; j < headerLines.length; j++) {
            ctx.fillText(headerLines[j], x + colWidths[i] / 2, startY + j * lineHeight);
        }
        x += colWidths[i];
    }

    // Data rows (centered, alternating dark rows)
    ctx.font = '15px Arial';
    let cumulativeTime = 0, cumulativeGems = 0, cumulativeCoins = 0;
    for (let rowIdx = 0; rowIdx < chart.length; rowIdx++) {
        let x = 0;
        const y = titleHeight + rowHeight * (rowIdx + 1);
        // Alternating row colors (dark)
        ctx.fillStyle = rowIdx % 2 === 0 ? '#23272f' : '#181a20';
        ctx.fillRect(0, y, width, rowHeight);

        const row = chart[rowIdx];
        cumulativeTime += row.time;
        cumulativeGems += row.gems;
        cumulativeCoins += row.coins;

        const cells = [
            row.level,
            (typeof row.value === 'number' ? row.value.toFixed(2) : ''),
            formatDuration(row.time),
            num(row.gems),
            num(row.coins),
            formatDuration(cumulativeTime),
            num(cumulativeGems),
            num(cumulativeCoins)
        ];
        for (let i = 0; i < columns.length; i++) {
            ctx.strokeStyle = '#333';
            ctx.lineWidth = 1;
            ctx.strokeRect(x, y, colWidths[i], rowHeight);
            ctx.fillStyle = '#e6e6e6';
            ctx.textAlign = 'center';
            ctx.fillText(String(cells[i]), x + colWidths[i] / 2, y + 19);
            x += colWidths[i];
        }
    }

    // Summary row (totals, green background, centered)
    let y = titleHeight + rowHeight * (chart.length + 1);
    ctx.fillStyle = '#234d2c';
    ctx.fillRect(0, y, width, rowHeight);
    ctx.font = 'bold 15px Arial';
    let totalTime = chart.reduce((a, b) => a + b.time, 0);
    let totalGems = chart.reduce((a, b) => a + b.gems, 0);
    let totalCoins = chart.reduce((a, b) => a + b.coins, 0);
    const summaryCells = [
        'Total', '', formatDuration(totalTime), num(totalGems), num(totalCoins), '', '', ''
    ];
    x = 0;
    for (let i = 0; i < columns.length; i++) {
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, colWidths[i], rowHeight);
        ctx.fillStyle = '#b6fcd5';
        ctx.textAlign = 'center';
        ctx.fillText(String(summaryCells[i]), x + colWidths[i] / 2, y + 19);
        x += colWidths[i];
    }

    // Outer border
    ctx.strokeStyle = '#b6fcd5';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, titleHeight, width, rowHeight * (chart.length + 2));

    // User settings info section (bottom, light green text)
    ctx.font = 'bold 15px Arial';
    ctx.fillStyle = '#b6fcd5';
    ctx.textAlign = 'center';
    let settingsY = titleHeight + rowHeight * (chart.length + 2) + 24;
    // Try to get user settings from arguments if available (lab is just the lab object)
    let userSettings = null;
    if (arguments.length >= 5) {
        userSettings = arguments[4];
    }
    // Fallback: try to get from lab if present (should not be, but for safety)
    let labSpeed = userSettings?.labSpeed ?? lab.labSpeed ?? '';
    let labRelic = userSettings?.labRelic ?? lab.labRelic ?? '';
    let labDiscount = userSettings?.labDiscount ?? lab.labDiscount ?? '';
    let speedUp = userSettings?.speedUp ?? lab.speedUp ?? '';
    const footerText = `Lab Speed: ${labSpeed} | Lab Relic: ${labRelic}% | Lab Coin Discount: ${labDiscount} | Speedup: ${speedUp}x`;
    ctx.fillText(
        footerText,
        width / 2,
        settingsY
    );

    return canvas.toBuffer();
}

function calculateGems(time) {
    time = time / 24; // Convert hours to seconds

    return Math.ceil(  
        time * 86400 > 31104000 ? 25000 :
        time * 86400 > 7776000 ? (17000 / 23328000) * (time * 86400 - 7776000) + 8000 :
        time * 86400 > 2592000 ? (4450 / 5184000) * (time * 86400 - 2592000) + 3550 :
        time * 86400 > 604800 ? (2550 / 1987200) * (time * 86400 - 604800) + 1000 :
        time * 86400 > 86400 ? (837 / 518400) * (time * 86400 - 86400) + 163 :
        time * 86400 > 3600 ? (155.5 / 82800) * (time * 86400 - 3600) + 7.5 :
        time * 86400 > 60 ? (7.375 / 3540) * (time * 86400 - 60) + 0.125 :
        time * 86400 > 1 ? (0.122917 / 59) * (time * 86400 - 1) + 0.002083 :
        0
    );
}

function calculateLabData(labName, startLevel, targetLevel, userSettings) {
    console.log('Entering calculateLabData');
    const lab = LABS[labName];
    if (!lab) {
        throw new Error(`Lab "${labName}" not found.`);
    }

    const { labSpeed, labRelic, labDiscount, speedUp } = userSettings;
    console.log(`Lab Speed: ${labSpeed}, Lab Relic: ${labRelic}, Lab Discount: ${labDiscount}, Speed Up: ${speedUp}`);

    // Adjustments
    const relicMultiplier = 1 + (labRelic / 100); // Relic reduces base time
    // For the "Lab Speed" lab, do NOT include labSpeed in the multiplier, only relic
    // For all other labs, include labSpeed
    let speedMultiplier;
    if (labName.toLowerCase().includes('labs_speed')) {
        speedMultiplier = 1; // Do not include labSpeed level for "Lab Speed" lab
    } else {
        speedMultiplier = 1 + (labSpeed * 0.02);
    }
    const finalMultiplier = 1 / (speedMultiplier * relicMultiplier); // Combined effect of speed and relic
    const coinDiscountMultiplier = 1 - (labDiscount * 0.003); // Lab coin discount reduces cost

    console.log(`Speed Multiplier: ${speedMultiplier}, Relic Multiplier: ${relicMultiplier}, Final Multiplier: ${finalMultiplier}`);

    // Generate the chart data
    const chart = [];
    let totalTime = 0;
    let totalGems = 0;
    let totalCoins = 0;

    for (let level = startLevel; level <= targetLevel; level++) {
        const levelData = lab.levels[level - 1]; // Get level-specific data
        if (!levelData) break;

        const baseTime = parseInt(levelData.duration.split(':')[0]) + parseInt(levelData.duration.split(':')[1]) / 60;
        console.log(`Base time for level ${level}: ${baseTime} hours`);
        if (!baseTime) {
            console.error(`No duration found for level ${level} in lab "${labName}"`);
            continue;
        }

        const adjustedTime = baseTime * finalMultiplier;
        const gems = calculateGems(adjustedTime);
        const adjustedCoins = levelData.cost * coinDiscountMultiplier;

        chart.push({
            level,
            value: lab.base + (lab.value * level),
            time: adjustedTime / speedUp, 
            gems: gems,
            coins: adjustedCoins
        });

        // Update totals
        totalTime += adjustedTime;
        totalGems += gems;
        totalCoins += adjustedCoins;
    }

    return {
        chart,
        totals: {
            time: formatTime(totalTime / speedUp),
            gems: totalGems,
            coins: formatNumberOutput(totalCoins)
        }
    };
}

// Modal input configurations
const MODAL_INPUTS = {
    calculator: [
        {
            id: 'start_level',
            label: 'Starting Level',
            style: TextInputStyle.Short,
            required: true
        },
        {
            id: 'end_level',
            label: 'Target Level',
            style: TextInputStyle.Short,
            required: true
        },
        {
            id: 'speed_up',
            label: 'Speed Up Multiplier',
            style: TextInputStyle.Short,
            required: true,
            defaultValue: '1'
        }
    ],
    settings: [
        {
            id: 'lab_speed',
            label: 'Lab Speed Level',
            style: TextInputStyle.Short,
            required: true
        },
        {
            id: 'lab_relic',
            label: 'Lab Speed Relic (%)',
            style: TextInputStyle.Short,
            required: true
        },
        {
            id: 'lab_discount',
            label: 'Lab Coin Discount Level',
            style: TextInputStyle.Short,
            required: true
        }
    ]
}

async function createModal(type, userId = null, category = '', lab = '') {
    const modal = new ModalBuilder()
        .setCustomId(`lab_${type}_${category}_${lab}`.trim())
        .setTitle(type === 'settings' ? 'Lab Calculator Settings' : `Calculate ${lab.replace(/_/g, ' ')}`);

    let userSettings = null;
    if (type === 'settings' && userId) {
        try {
            userSettings = await getUserSettings(userId);
        } catch (error) {
            console.error('Error fetching user settings:', error);
        }
    }

    const inputs = MODAL_INPUTS[type].map(input => {
        const textInput = new TextInputBuilder()
            .setCustomId(input.id)
            .setLabel(input.label)
            .setStyle(input.style)
            .setRequired(input.required);

        if (type === 'settings' && userSettings) {
            switch (input.id) {
                case 'lab_speed':
                    textInput.setValue((userSettings.labSpeed ?? 0).toString());
                    break;
                case 'lab_relic':
                    textInput.setValue((userSettings.labRelic ?? 0).toString());
                    break;
                case 'lab_discount':
                    textInput.setValue((userSettings.labDiscount ?? 0).toString());
                    break;
                case 'start_level':
                    textInput.setValue((userSettings.startLevel ?? 0).toString());
                    break;
                case 'end_level':
                    textInput.setValue((userSettings.targetLevel ?? 10).toString());
                    break;
                case 'speed_up':
                    textInput.setValue((userSettings.speedUp ?? 1).toString());
                    break;
            }
        } else if (input.defaultValue) {
            // For start_level, default to 0
            if (input.id === 'start_level') {
                textInput.setValue('0');
            } else {
                textInput.setValue(input.defaultValue);
            }
        }

        return new ActionRowBuilder().addComponents(textInput);
    });

    modal.addComponents(...inputs);
    return modal;
}


module.exports = {
    category: 'utility',
    data: new SlashCommandBuilder()
        .setName('lab')
        .setDescription('The Tower Lab Calculator'),
    async execute(interaction) {
        // Fetch user settings or set defaults
        let userSettings = await getUserSettings(interaction.user.id) || {};
        userSettings.labSpeed = userSettings.labSpeed ?? 0;
        userSettings.labRelic = userSettings.labRelic ?? 0;
        userSettings.labDiscount = userSettings.labDiscount ?? 0;
        userSettings.speedUp = userSettings.speedUp ?? 1;
        userSettings.labLevels = userSettings.labLevels || {}; // { [labKey]: { startLevel, targetLevel } }
        userSettings.hideMaxedLabs = typeof userSettings.hideMaxedLabs === 'boolean' ? userSettings.hideMaxedLabs : true;

        // Helper to build the main embed
        function buildEmbed(settings, selectedCategory, selectedLab, chartBuffer) {
            const embed = new EmbedBuilder()
                .setTitle('The Tower Lab Calculator')
                .setColor(0x4CAF50);
            if (!settings || typeof settings.labSpeed === 'undefined') {
                embed.setDescription('Welcome! Please configure your settings by pressing the **Settings** button below.');
            } else {
                embed.setDescription('Your current settings:');
                // Always show general settings
                embed.addFields(
                    { name: 'Lab\nSpeed', value: (settings.labSpeed ?? 0).toString(), inline: true },
                    { name: 'Lab\nRelic', value: (settings.labRelic ?? 0).toString() + '%', inline: true },
                    { name: 'Coin\nDiscount', value: (settings.labDiscount ?? 0).toString() + '%', inline: true }
                );
                // Only show current/target levels if a lab is selected
                if (selectedLab && settings.labLevels && settings.labLevels[selectedLab]) {
                    let startLevel = settings.labLevels[selectedLab].startLevel ?? 1;
                    let targetLevel = settings.labLevels[selectedLab].targetLevel ?? 30;
                    let maxLevel = 0;
                    if (LABS[selectedLab] && Array.isArray(LABS[selectedLab].levels)) {
                        maxLevel = Math.max(...LABS[selectedLab].levels.map(lvl => lvl.level ?? 0));
                    }
                    embed.addFields(
                        { name: 'Current\nLab Level', value: startLevel.toString(), inline: true },
                        { name: 'Target\nLab Level', value: targetLevel.toString(), inline: true },
                        { name: 'Max\nLab Level', value: maxLevel ? maxLevel.toString() : 'N/A', inline: true }
                    );
                    // Add total time, gems, coins row
                    // Calculate chart summary for selected lab and range
                    const labObj = LABS[selectedLab];
                    const { chart, totals } = calculateLabChart(labObj, startLevel, targetLevel, settings);
                    // Format time as 1d 2h 3m 4s
                    function formatDuration(hours) {
                        const totalSeconds = Math.round(hours * 3600);
                        const d = Math.floor(totalSeconds / (3600 * 24));
                        const h = Math.floor((totalSeconds % (3600 * 24)) / 3600);
                        const m = Math.floor((totalSeconds % 3600) / 60);
                        const s = totalSeconds % 60;
                        let out = '';
                        if (d > 0) out += `${d}d `;
                        if (h > 0 || d > 0) out += `${h}h `;
                        if (m > 0 || h > 0 || d > 0) out += `${m}m `;
                        out += `${s}s`;
                        return out.trim();
                    }
                    embed.addFields({
                        name: 'Totals',
                        value: `Time: ${formatDuration(totals.time)}\nGems: ${formatNumberOutput(totals.gems)}\nCoins: ${formatNumberOutput(totals.coins)}`,
                        inline: false
                    });
                }
            }
            if (chartBuffer) {
                embed.setImage('attachment://lab_chart.png');
            }
            return embed;
        }

        // Build category dropdown
        const categories = getCategories();
        let categoryMenu;
        const categoryOptions = categories.slice(0, 25).map(cat => ({ label: cat.label, value: cat.value }));
        if (categoryOptions.length === 0) {
            categoryMenu = new StringSelectMenuBuilder()
                .setCustomId('lab_category')
                .setPlaceholder('No categories found')
                .setDisabled(true)
                .addOptions([{ label: 'No categories found', value: 'none', default: true }]);
        } else {
            categoryMenu = new StringSelectMenuBuilder()
                .setCustomId('lab_category')
                .setPlaceholder('Select a category')
                .addOptions(categoryOptions);
        }

        // Build settings and close buttons (range button added conditionally)
        const settingsButton = new ButtonBuilder().setCustomId('lab_settings').setLabel('Settings').setStyle(ButtonStyle.Secondary);
        const rangeButton = new ButtonBuilder().setCustomId('lab_range').setLabel('Range').setStyle(ButtonStyle.Primary);
        const hideMaxedButton = new ButtonBuilder()
            .setCustomId('lab_toggle_hide_maxed')
            .setLabel(userSettings.hideMaxedLabs ? 'Show Maxed' : 'Hide Maxed')
            .setStyle(ButtonStyle.Success);
        const closeButton = new ButtonBuilder().setCustomId('lab_close').setLabel('Close').setStyle(ButtonStyle.Danger);

        // Initial reply
        await interaction.reply({
            embeds: [buildEmbed(userSettings)],
            components: [
                new ActionRowBuilder().addComponents(categoryMenu),
                new ActionRowBuilder().addComponents(settingsButton, 
                    new ButtonBuilder()
                        .setCustomId('lab_toggle_hide_maxed')
                        .setLabel(userSettings.hideMaxedLabs ? 'Show Maxed' : 'Hide Maxed')
                        .setStyle(ButtonStyle.Success),
                    closeButton)
            ],
            ephemeral: true
        });

        // --- Collectors and interaction logic ---
        const msg = await interaction.fetchReply();
        const collector = msg.createMessageComponentCollector({ time: 15 * 60 * 1000 });

        let selectedCategory = null;
        let selectedLab = null;
        let selectedUWType = null;
        let chartBuffer = null;
        let speedupMenu = null;

        async function updateLabDropdown(category) {
            let labs = getLabsByCategory(category);
            if (userSettings.hideMaxedLabs) {
                labs = labs.filter(l => {
                    const labObj = LABS[l.key];
                    const maxLevel = Array.isArray(labObj.levels) ? Math.max(...labObj.levels.map(lvl => lvl.level ?? 0)) : 0;
                    const currentLevel = userSettings.labLevels && userSettings.labLevels[l.key] ? userSettings.labLevels[l.key].startLevel ?? 0 : 0;
                    return currentLevel < maxLevel;
                });
            }
            labs = labs.slice(0, 25); // Only first 25 labs
            return new StringSelectMenuBuilder()
                .setCustomId('lab_lab')
                .setPlaceholder('Select a lab')
                .addOptions(labs.map(l => ({ label: l.name, value: l.key })));
        }

        function buildSpeedupDropdown(currentSpeedup) {
            return new StringSelectMenuBuilder()
                .setCustomId('lab_speedup')
                .setPlaceholder('Select Speedup')
                .addOptions([
                    { label: '1x', value: '1' },
                    { label: '2x', value: '2' },
                    { label: '3x', value: '3' },
                    { label: '4x', value: '4' },
                    { label: '5x', value: '5' },
                    { label: '6x', value: '6' },
                ].map(opt => ({ ...opt, default: opt.value === String(currentSpeedup) })));
        }

        async function updateReply(options = {}) {
            const { category, lab, speedup, interactionObj, uwType } = options;
            // Update the category menu to show the selected value as the placeholder
            let updatedCategoryMenu;
            if (category) {
                // Find the label for the selected category
                const selectedCatObj = categories.find(cat => cat.value === category);
                const placeholder = selectedCatObj ? selectedCatObj.label : category;
                // Rebuild the options, setting the selected one as default
                const newOptions = categoryOptions.map(opt => {
                    return {
                        label: opt.label,
                        value: opt.value,
                        default: opt.value === category
                    };
                });
                updatedCategoryMenu = new StringSelectMenuBuilder()
                    .setCustomId('lab_category')
                    .setPlaceholder(placeholder)
                    .addOptions(newOptions);
            } else {
                updatedCategoryMenu = categoryMenu;
            }
            let components = [];
            // Always add category dropdown as first row
            components.push(new ActionRowBuilder().addComponents(updatedCategoryMenu));
            // If UW category, add UW type dropdown as second row
            if (category && category.toLowerCase().includes('ultimate')) {
                const uwLabs = getLabsByCategory(category);
                // Fixed, ordered list of UW types and labels
                const UW_TYPE_LIST = [
                    { value: 'sm', label: 'Smart Missiles' },
                    { value: 'bh', label: 'Black Hole' },
                    { value: 'ps', label: 'Poison Swamp' },
                    { value: 'cl', label: 'Chain Lightning' },
                    { value: 'cf', label: 'Chrono Field' },
                    { value: 'gt', label: 'Golden Tower' },
                    { value: 'dw', label: 'Death Wave' },
                    { value: 'ilm', label: 'Inner Land Mines' },
                    { value: 'sl', label: 'Spotlight' }
                ];
                // Robust mapping from UW type value to lab key prefix
                const UW_TYPE_PREFIX = {
                    sm: 'missile_',
                    bh: 'black_hole_',
                    ps: 'swamp_',
                    cl: 'chain_lightning_',
                    cf: 'chrono_field_',
                    gt: 'golden_tower_',
                    dw: 'death_wave_',
                    ilm: 'inner_mine_',
                    sl: 'spotlight_'
                };
                
                // Helper function to check if all labs of a UW type are maxed
                function isUWTypeFullyMaxed(typeValue) {
                    const prefix = UW_TYPE_PREFIX[typeValue];
                    let labsForType = uwLabs.filter(l => l.key.startsWith(prefix) && LABS[l.key]?.type === 'Ultimate Weapon');
                    
                    // If no labs found for this type, consider it "not maxed" so it shows up
                    if (labsForType.length === 0) return false;
                    
                    // Check if all labs of this type are maxed
                    return labsForType.every(l => {
                        const labObj = LABS[l.key];
                        const maxLevel = Array.isArray(labObj.levels) ? Math.max(...labObj.levels.map(lvl => lvl.level ?? 0)) : 0;
                        const currentLevel = userSettings.labLevels && userSettings.labLevels[l.key] ? userSettings.labLevels[l.key].startLevel ?? 0 : 0;
                        return currentLevel >= maxLevel;
                    });
                }
                
                // Filter out UW types where all labs are maxed (only if hideMaxedLabs is enabled)
                let availableUWTypes = UW_TYPE_LIST;
                if (userSettings.hideMaxedLabs) {
                    availableUWTypes = UW_TYPE_LIST.filter(typeObj => !isUWTypeFullyMaxed(typeObj.value));
                }
                
                let uwTypeMenu = new StringSelectMenuBuilder()
                    .setCustomId('uw_type')
                    .setPlaceholder('Select Ultimate Weapon');
                
                if (availableUWTypes.length > 0) {
                    uwTypeMenu = uwTypeMenu.addOptions(availableUWTypes.map(typeObj => ({
                        label: typeObj.label,
                        value: typeObj.value,
                        default: (uwType === typeObj.value)
                    })));
                } else {
                    uwTypeMenu = uwTypeMenu.addOptions([
                        { label: 'All UW types maxed', value: 'none', default: true }
                    ]);
                }
                
                components.push(new ActionRowBuilder().addComponents(uwTypeMenu));
                // If UW type selected, add lab dropdown as third row
                if (uwType) {
                    // Use prefix mapping to filter labs for selected UW type
                    const prefix = UW_TYPE_PREFIX[uwType];
                    // Only include labs where key starts with prefix AND lab.type === 'Ultimate Weapon'
                    let labsForType = uwLabs.filter(l => l.key.startsWith(prefix) && LABS[l.key]?.type === 'Ultimate Weapon');
                    // Apply hideMaxedLabs filter if enabled
                    if (userSettings.hideMaxedLabs) {
                        labsForType = labsForType.filter(l => {
                            const labObj = LABS[l.key];
                            const maxLevel = Array.isArray(labObj.levels) ? Math.max(...labObj.levels.map(lvl => lvl.level ?? 0)) : 0;
                            const currentLevel = userSettings.labLevels && userSettings.labLevels[l.key] ? userSettings.labLevels[l.key].startLevel ?? 0 : 0;
                            return currentLevel < maxLevel;
                        });
                    }
                    labsForType = labsForType.slice(0, 25);
                    let labMenuBuilder = new StringSelectMenuBuilder()
                        .setCustomId('lab_lab')
                        .setPlaceholder('Select a lab');
                    if (labsForType.length > 0) {
                        const labOptions = labsForType.map(l => ({
                            label: l.name,
                            value: l.key,
                            default: lab === l.key
                        }));
                        labMenuBuilder = labMenuBuilder.addOptions(labOptions);
                    } else {
                        labMenuBuilder = labMenuBuilder.addOptions([
                            { label: 'No labs found', value: 'none', default: true }
                        ]);
                    }
                    components.push(new ActionRowBuilder().addComponents(labMenuBuilder));
                }
            } else if (category) {
            // For non-UW, add lab dropdown as second row
            let labs = getLabsByCategory(category);
            if (userSettings.hideMaxedLabs) {
                labs = labs.filter(l => {
                    const labObj = LABS[l.key];
                    const maxLevel = Array.isArray(labObj.levels) ? Math.max(...labObj.levels.map(lvl => lvl.level ?? 0)) : 0;
                    const currentLevel = userSettings.labLevels && userSettings.labLevels[l.key] ? userSettings.labLevels[l.key].startLevel ?? 0 : 0;
                    return currentLevel < maxLevel;
                });
            }
            labs = labs.slice(0, 25);
            let labMenuBuilder = new StringSelectMenuBuilder()
                .setCustomId('lab_lab')
                .setPlaceholder('Select a lab');
            if (labs.length > 0) {
                const labOptions = labs.map(l => ({
                    label: l.name,
                    value: l.key,
                    default: lab === l.key
                }));
                labMenuBuilder = labMenuBuilder.addOptions(labOptions);
            }
            components.push(new ActionRowBuilder().addComponents(labMenuBuilder));
            }
            if (category && lab) {
                speedupMenu = buildSpeedupDropdown(userSettings.speedUp);
                components.push(new ActionRowBuilder().addComponents(speedupMenu));
            }
            // Add toggle button for hiding maxed labs (always show, even if no lab/category selected)
            const toggleButton = new ButtonBuilder()
                .setCustomId('lab_toggle_hide_maxed')
                .setLabel(userSettings.hideMaxedLabs ? 'Show Maxed' : 'Hide Maxed')
                .setStyle(ButtonStyle.Success);
            const buttons = [settingsButton, toggleButton];
            if (category && lab) buttons.splice(1, 0, rangeButton); // Insert rangeButton after settingsButton if lab selected
            buttons.push(closeButton);
            components.push(new ActionRowBuilder().addComponents(...buttons));

            let files = [];
            let embed = buildEmbed(userSettings, category, lab, chartBuffer);
            if (chartBuffer) {
                files = [new AttachmentBuilder(chartBuffer, { name: 'lab_chart.png' })];
            }
            try {
                // Use i.update for component interactions, interaction.editReply for initial
                if (interactionObj && typeof interactionObj.update === 'function') {
                    await interactionObj.update({
                        embeds: [embed],
                        components,
                        files,
                        ephemeral: true
                    });
                } else {
                    await interaction.editReply({
                        embeds: [embed],
                        components,
                        files,
                        ephemeral: true
                    });
                }
            } catch (err) {
                // If the reply has been deleted or interaction is no longer valid, ignore
                console.error('editReply/update failed:', err);
            }
        }

        collector.on('collect', async i => {
            if (i.user.id !== interaction.user.id) {
                await i.reply({ content: 'This is not your calculator session.', ephemeral: true });
                return;
            }
            let handled = false;
            try {
                if (i.customId === 'lab_close') {
                    await i.update({ content: 'Closed.', embeds: [], components: [], files: [] });
                    collector.stop();
                    handled = true;
                } else if (i.customId === 'lab_toggle_hide_maxed') {
                    userSettings.hideMaxedLabs = !userSettings.hideMaxedLabs;
                    await saveUserSettings(i.user.id, i.user.username, userSettings.labSpeed, userSettings.labRelic, userSettings.labDiscount, userSettings.labLevels[selectedLab]?.startLevel ?? 0, userSettings.labLevels[selectedLab]?.targetLevel ?? 30, userSettings.speedUp, userSettings.labLevels, userSettings.hideMaxedLabs);
                    
                    // When toggling, reset selectedLab if it is now hidden
                    let labs = getLabsByCategory(selectedCategory);
                    if (userSettings.hideMaxedLabs) {
                        labs = labs.filter(l => {
                            const labObj = LABS[l.key];
                            const maxLevel = Array.isArray(labObj.levels) ? Math.max(...labObj.levels.map(lvl => lvl.level ?? 0)) : 0;
                            const currentLevel = userSettings.labLevels && userSettings.labLevels[l.key] ? userSettings.labLevels[l.key].startLevel ?? 0 : 0;
                            return currentLevel < maxLevel;
                        });
                    }
                    labs = labs.slice(0, 25);
                    if (selectedLab && !labs.some(l => l.key === selectedLab)) {
                        selectedLab = null;
                    }
                    
                    // Also check if selected UW type should be reset (for Ultimate Weapon categories)
                    if (selectedCategory && selectedCategory.toLowerCase().includes('ultimate') && selectedUWType && userSettings.hideMaxedLabs) {
                        const uwLabs = getLabsByCategory(selectedCategory);
                        const UW_TYPE_PREFIX = {
                            sm: 'missile_',
                            bh: 'black_hole_',
                            ps: 'swamp_',
                            cl: 'chain_lightning_',
                            cf: 'chrono_field_',
                            gt: 'golden_tower_',
                            dw: 'death_wave_',
                            ilm: 'inner_mine_',
                            sl: 'spotlight_'
                        };
                        
                        // Check if the selected UW type is now fully maxed
                        const prefix = UW_TYPE_PREFIX[selectedUWType];
                        if (prefix) {
                            let labsForType = uwLabs.filter(l => l.key.startsWith(prefix) && LABS[l.key]?.type === 'Ultimate Weapon');
                            const isTypeFullyMaxed = labsForType.length > 0 && labsForType.every(l => {
                                const labObj = LABS[l.key];
                                const maxLevel = Array.isArray(labObj.levels) ? Math.max(...labObj.levels.map(lvl => lvl.level ?? 0)) : 0;
                                const currentLevel = userSettings.labLevels && userSettings.labLevels[l.key] ? userSettings.labLevels[l.key].startLevel ?? 0 : 0;
                                return currentLevel >= maxLevel;
                            });
                            
                            if (isTypeFullyMaxed) {
                                selectedUWType = null;
                                selectedLab = null; // Also clear lab selection since type is cleared
                            }
                        }
                    }
                    
                    await updateReply({ category: selectedCategory, lab: selectedLab, speedup: userSettings.speedUp, interactionObj: i, uwType: selectedUWType });
                    handled = true;
                } else if (i.customId === 'lab_settings') {
                    // Show modal for base settings
                    const modal = new ModalBuilder()
                        .setCustomId('lab_settings_modal')
                        .setTitle('Lab Base Settings')
                        .addComponents(
                            new ActionRowBuilder().addComponents(
                                new TextInputBuilder().setCustomId('labSpeed').setLabel('Lab Speed Level').setStyle(TextInputStyle.Short).setRequired(true).setValue((userSettings.labSpeed ?? 0).toString())
                            ),
                            new ActionRowBuilder().addComponents(
                                new TextInputBuilder().setCustomId('labRelic').setLabel('Lab Relic %').setStyle(TextInputStyle.Short).setRequired(true).setValue((userSettings.labRelic ?? 0).toString())
                            ),
                            new ActionRowBuilder().addComponents(
                                new TextInputBuilder().setCustomId('labDiscount').setLabel('Lab Coin Discount %').setStyle(TextInputStyle.Short).setRequired(true).setValue((userSettings.labDiscount ?? 0).toString())
                            )
                        );
                    await i.showModal(modal);
                    handled = true;
                } else if (i.customId === 'lab_range') {
                    // Show modal for range (current/target levels)
                    let startLevel = 0, targetLevel = 30;
                    let minLevel = 0, maxLevel = 30;
                    if (selectedLab && LABS[selectedLab] && Array.isArray(LABS[selectedLab].levels) && LABS[selectedLab].levels.length > 0) {
                        // Always use 0 as minLevel
                        minLevel = 0;
                        // Use the highest .level value as maxLevel
                        maxLevel = Math.max(...LABS[selectedLab].levels.map(lvl => lvl.level ?? 0));
                        targetLevel = Math.min(30, maxLevel);
                    }
                    if (selectedLab && userSettings.labLevels && userSettings.labLevels[selectedLab]) {
                        startLevel = userSettings.labLevels[selectedLab].startLevel ?? minLevel;
                        targetLevel = userSettings.labLevels[selectedLab].targetLevel ?? maxLevel;
                    }
                    const modal = new ModalBuilder()
                        .setCustomId('lab_range_modal')
                        .setTitle('Lab Range Settings')
                        .addComponents(
                            new ActionRowBuilder().addComponents(
                                new TextInputBuilder()
                                    .setCustomId('startLevel')
                                    .setLabel(`Current Lab Level (${minLevel} - ${maxLevel})`)
                                    .setStyle(TextInputStyle.Short)
                                    .setRequired(true)
                                    .setValue(startLevel.toString())
                            ),
                            new ActionRowBuilder().addComponents(
                                new TextInputBuilder()
                                    .setCustomId('targetLevel')
                                    .setLabel(`Target Lab Level (${minLevel} - ${maxLevel})`)
                                    .setStyle(TextInputStyle.Short)
                                    .setRequired(true)
                                    .setValue(targetLevel.toString())
                            )
                        );
                    await i.showModal(modal);
                    handled = true;
                } else if (i.customId === 'lab_category') {
                    selectedCategory = i.values[0];
                    selectedLab = null;
                    selectedUWType = null;
                    chartBuffer = null;
                    // If UW labs, show UW type selector first
                    if (selectedCategory.toLowerCase().includes('uw')) {
                        await updateReply({ category: selectedCategory, lab: null, speedup: userSettings.speedUp, interactionObj: i, uwType: null });
                    } else {
                        await updateReply({ category: selectedCategory, lab: null, speedup: userSettings.speedUp, interactionObj: i });
                    }
                    handled = true;
                } else if (i.customId === 'uw_type') {
                    // UW type selected, show labs for that type
                    selectedUWType = i.values[0];
                    selectedLab = null;
                    
                    // If "none" was selected (all types maxed), reset UW type
                    if (selectedUWType === 'none') {
                        selectedUWType = null;
                    }
                    
                    await updateReply({ category: selectedCategory, lab: null, speedup: userSettings.speedUp, interactionObj: i, uwType: selectedUWType });
                    handled = true;
                } else if (i.customId === 'lab_lab') {
                    selectedLab = i.values[0];
                    
                    // If "none" was selected (no labs found), reset lab selection
                    if (selectedLab === 'none') {
                        selectedLab = null;
                        await updateReply({ category: selectedCategory, lab: null, speedup: userSettings.speedUp, interactionObj: i, uwType: selectedUWType });
                        handled = true;
                        return;
                    }
                    
                    userSettings.speedUp = userSettings.speedUp || 1;
                    // Always get per-lab start/target levels for the selected lab
                    let startLevel = 0, targetLevel = 30;
                    const labObj = LABS[selectedLab];
                    if (!userSettings.labLevels) userSettings.labLevels = {};
                    if (!userSettings.labLevels[selectedLab]) {
                        // If not set, initialize with defaults (0, max available or 30)
                        if (Array.isArray(labObj.levels)) {
                            targetLevel = Math.min(30, labObj.levels.length);
                        }
                        userSettings.labLevels[selectedLab] = { startLevel, targetLevel };
                    } else {
                        startLevel = userSettings.labLevels[selectedLab].startLevel ?? 0;
                        targetLevel = userSettings.labLevels[selectedLab].targetLevel ?? 30;
                    }
                    // Always recalculate chart and chartBuffer for the selected lab and its range
                    const { chart } = calculateLabChart(labObj, startLevel, targetLevel, userSettings);
                    chartBuffer = await generateChartImage(
                        labObj,
                        chart,
                        chart.length > 0 ? chart[0].level : startLevel,
                        chart.length > 0 ? chart[chart.length - 1].level : targetLevel,
                        userSettings
                    );
                    // Rebuild speedup dropdown after lab selection
                    speedupMenu = buildSpeedupDropdown(userSettings.speedUp);
                    await updateReply({ category: selectedCategory, lab: selectedLab, speedup: userSettings.speedUp, interactionObj: i, uwType: selectedUWType });
                    handled = true;
                } else if (i.customId === 'lab_speedup') {
                    userSettings.speedUp = parseInt(i.values[0]);
                    // Save speedUp to user settings in DB (preserve other settings)
                    // Save per-lab levels if available
                    let startLevel = 0, targetLevel = 30;
                    const labObj = LABS[selectedLab];
                    if (userSettings.labLevels && userSettings.labLevels[selectedLab]) {
                        startLevel = userSettings.labLevels[selectedLab].startLevel ?? 0;
                        targetLevel = userSettings.labLevels[selectedLab].targetLevel ?? 30;
                    } else if (Array.isArray(labObj.levels)) {
                        targetLevel = Math.min(30, labObj.levels.length);
                    }
                    await saveUserSettings(i.user.id, i.user.username, userSettings.labSpeed, userSettings.labRelic, userSettings.labDiscount, startLevel, targetLevel, userSettings.speedUp, userSettings.labLevels);
                    const { chart } = calculateLabChart(labObj, startLevel, targetLevel, userSettings);
                    chartBuffer = await generateChartImage(labObj, chart, chart.length > 0 ? chart[0].level : startLevel, chart.length > 0 ? chart[chart.length - 1].level : targetLevel, userSettings);
                    // Rebuild speedup dropdown after speedup selection
                    speedupMenu = buildSpeedupDropdown(userSettings.speedUp);
                    await updateReply({ category: selectedCategory, lab: selectedLab, speedup: userSettings.speedUp, interactionObj: i });
                    handled = true;
                }
            } catch (err) {
                console.error('Error in lab interaction handler:', err);
                try {
                    if (!i.replied && !i.deferred) {
                        await i.reply({ content: '❌ An error occurred. Please try again.', ephemeral: true });
                    }
                } catch {}
            }
            if (!handled) {
                try {
                    if (!i.replied && !i.deferred) {
                        await i.deferUpdate();
                    }
                } catch {}
            }
        });

        // Modal submission handler
        interaction.client.on('interactionCreate', async modalInt => {
            if (!modalInt.isModalSubmit()) return;
            if (modalInt.user.id !== interaction.user.id) return;
            if (modalInt.customId === 'lab_settings_modal') {
                // Save base settings
                userSettings.labSpeed = parseInt(modalInt.fields.getTextInputValue('labSpeed')) || 0;
                userSettings.labRelic = parseFloat(modalInt.fields.getTextInputValue('labRelic')) || 0;
                userSettings.labDiscount = parseInt(modalInt.fields.getTextInputValue('labDiscount')) || 0;
                await saveUserSettings(modalInt.user.id, modalInt.user.username, userSettings.labSpeed, userSettings.labRelic, userSettings.labDiscount, userSettings.startLevel ?? 1, userSettings.targetLevel ?? 10, userSettings.speedUp, userSettings.labLevels);
                // Update embed
                let embed = buildEmbed(userSettings, selectedCategory, selectedLab, chartBuffer);
                embed.setFooter({ text: '✅ Base settings saved!' });
                let files = chartBuffer ? [new AttachmentBuilder(chartBuffer, { name: 'lab_chart.png' })] : [];
                try {
                    // Build components for modal update, handling UW category
                    let components = [];
                    // Category dropdown
                    components.push(new ActionRowBuilder().addComponents(
                        (() => {
                            const selectedCatObj = categories.find(cat => cat.value === selectedCategory);
                            const placeholder = selectedCatObj ? selectedCatObj.label : (selectedCategory || 'Select a category');
                            const newOptions = categoryOptions.map(opt => ({
                                label: opt.label,
                                value: opt.value,
                                default: opt.value === selectedCategory
                            }));
                            return new StringSelectMenuBuilder()
                                .setCustomId('lab_category')
                                .setPlaceholder(placeholder)
                                .addOptions(newOptions);
                        })()
                    ));
                    // UW category special handling (match updateReply logic)
                    if (selectedCategory && selectedCategory.toLowerCase().includes('ultimate')) {
                        const uwLabs = getLabsByCategory(selectedCategory);
                        // Fixed, ordered list of UW types and labels
                        const UW_TYPE_LIST = [
                            { value: 'sm', label: 'Smart Missiles' },
                            { value: 'bh', label: 'Black Hole' },
                            { value: 'ps', label: 'Poison Swamp' },
                            { value: 'cl', label: 'Chain Lightning' },
                            { value: 'cf', label: 'Chrono Field' },
                            { value: 'gt', label: 'Golden Tower' },
                            { value: 'dw', label: 'Death Wave' },
                            { value: 'ilm', label: 'Inner Land Mines' },
                            { value: 'sl', label: 'Spotlight' }
                        ];
                        const UW_TYPE_PREFIX = {
                            sm: 'missile_',
                            bh: 'black_hole_',
                            ps: 'swamp_',
                            cl: 'chain_lightning_',
                            cf: 'chrono_field_',
                            gt: 'golden_tower_',
                            dw: 'death_wave_',
                            ilm: 'inner_mine_',
                            sl: 'spotlight_'
                        };
                        
                        // Helper function to check if all labs of a UW type are maxed
                        function isUWTypeFullyMaxed(typeValue) {
                            const prefix = UW_TYPE_PREFIX[typeValue];
                            let labsForType = uwLabs.filter(l => l.key.startsWith(prefix) && LABS[l.key]?.type === 'Ultimate Weapon');
                            
                            // If no labs found for this type, consider it "not maxed" so it shows up
                            if (labsForType.length === 0) return false;
                            
                            // Check if all labs of this type are maxed
                            return labsForType.every(l => {
                                const labObj = LABS[l.key];
                                const maxLevel = Array.isArray(labObj.levels) ? Math.max(...labObj.levels.map(lvl => lvl.level ?? 0)) : 0;
                                const currentLevel = userSettings.labLevels && userSettings.labLevels[l.key] ? userSettings.labLevels[l.key].startLevel ?? 0 : 0;
                                return currentLevel >= maxLevel;
                            });
                        }
                        
                        // Filter out UW types where all labs are maxed (only if hideMaxedLabs is enabled)
                        let availableUWTypes = UW_TYPE_LIST;
                        if (userSettings.hideMaxedLabs) {
                            availableUWTypes = UW_TYPE_LIST.filter(typeObj => !isUWTypeFullyMaxed(typeObj.value));
                        }
                        
                        // UW type dropdown (always shown)
                        let uwTypeMenu = new StringSelectMenuBuilder()
                            .setCustomId('uw_type')
                            .setPlaceholder('Select Ultimate Weapon');
                        
                        if (availableUWTypes.length > 0) {
                            uwTypeMenu = uwTypeMenu.addOptions(availableUWTypes.map(typeObj => ({
                                label: typeObj.label,
                                value: typeObj.value,
                                default: selectedUWType === typeObj.value
                            })));
                        } else {
                            uwTypeMenu = uwTypeMenu.addOptions([
                                { label: 'All UW types maxed', value: 'none', default: true }
                            ]);
                        }
                        components.push(new ActionRowBuilder().addComponents(uwTypeMenu));
                        // If UW type selected, show filtered labs for that type
                        if (selectedUWType) {
                            const prefix = UW_TYPE_PREFIX[selectedUWType];
                            let labsForType = uwLabs.filter(l => l.key.startsWith(prefix) && LABS[l.key]?.type === 'Ultimate Weapon');
                            if (userSettings.hideMaxedLabs) {
                                labsForType = labsForType.filter(l => {
                                    const labObj = LABS[l.key];
                                    const maxLevel = Array.isArray(labObj.levels) ? Math.max(...labObj.levels.map(lvl => lvl.level ?? 0)) : 0;
                                    const currentLevel = userSettings.labLevels && userSettings.labLevels[l.key] ? userSettings.labLevels[l.key].startLevel ?? 0 : 0;
                                    return currentLevel < maxLevel;
                                });
                            }
                            labsForType = labsForType.slice(0, 25);
                            let labMenuBuilder = new StringSelectMenuBuilder()
                                .setCustomId('lab_lab')
                                .setPlaceholder('Select a lab');
                            if (labsForType.length > 0) {
                                const labOptions = labsForType.map(l => ({
                                    label: l.name,
                                    value: l.key,
                                    default: selectedLab === l.key
                                }));
                                labMenuBuilder = labMenuBuilder.addOptions(labOptions);
                            } else {
                                labMenuBuilder = labMenuBuilder.addOptions([
                                    { label: 'No labs found', value: 'none', default: true }
                                ]);
                            }
                            components.push(new ActionRowBuilder().addComponents(labMenuBuilder));
                        }
                    } else if (selectedCategory) {
                        // Normal labs dropdown
                        let labs = getLabsByCategory(selectedCategory);
                        if (userSettings.hideMaxedLabs) {
                            labs = labs.filter(l => {
                                const labObj = LABS[l.key];
                                const maxLevel = Array.isArray(labObj.levels) ? Math.max(...labObj.levels.map(lvl => lvl.level ?? 0)) : 0;
                                const currentLevel = userSettings.labLevels && userSettings.labLevels[l.key] ? userSettings.labLevels[l.key].startLevel ?? 0 : 0;
                                return currentLevel < maxLevel;
                            });
                        }
                        labs = labs.slice(0, 25);
                        let labMenuBuilder = new StringSelectMenuBuilder()
                            .setCustomId('lab_lab')
                            .setPlaceholder('Select a lab');
                        if (labs.length > 0) {
                            const labOptions = labs.map(l => ({
                                label: l.name,
                                value: l.key,
                                default: selectedLab === l.key
                            }));
                            labMenuBuilder = labMenuBuilder.addOptions(labOptions);
                        } else {
                            labMenuBuilder = labMenuBuilder.addOptions([
                                { label: 'No labs found', value: 'none', default: true }
                            ]);
                        }
                        components.push(new ActionRowBuilder().addComponents(labMenuBuilder));
                    }
                    if (selectedCategory && selectedLab) {
                        components.push(new ActionRowBuilder().addComponents(buildSpeedupDropdown(userSettings.speedUp)));
                    }
                    // Always add toggle button, and rangeButton if both selectedCategory and selectedLab are set
                    const toggleButton = new ButtonBuilder()
                        .setCustomId('lab_toggle_hide_maxed')
                        .setLabel(userSettings.hideMaxedLabs ? 'Show Maxed' : 'Hide Maxed')
                        .setStyle(ButtonStyle.Success);
                    const buttons = [settingsButton, toggleButton];
                    if (selectedCategory && selectedLab) buttons.splice(1, 0, rangeButton); // Insert rangeButton after settingsButton if lab selected
                    buttons.push(closeButton);
                    components.push(new ActionRowBuilder().addComponents(...buttons));
                    await modalInt.update({
                        embeds: [embed],
                        components,
                        files,
                        ephemeral: true
                    });
                } catch (err) {
                    console.error('Failed to update base settings modal reply:', err);
                }
            } else if (modalInt.customId === 'lab_range_modal') {
                try {
                    // Save range settings for selected lab
                    let startLevel = parseInt(modalInt.fields.getTextInputValue('startLevel')) || 0;
                    let targetLevel = parseInt(modalInt.fields.getTextInputValue('targetLevel')) || 30;
                    let maxLevel = 0;
                    if (selectedLab && LABS[selectedLab] && Array.isArray(LABS[selectedLab].levels)) {
                        maxLevel = Math.max(...LABS[selectedLab].levels.map(lvl => lvl.level ?? 0));
                    }
                    if (selectedLab) {
                        userSettings.labLevels = userSettings.labLevels || {};
                        userSettings.labLevels[selectedLab] = { startLevel, targetLevel };
                    }
                    // If the lab is now maxed, deselect it so it doesn't appear in the dropdown
                    if (selectedLab && startLevel >= maxLevel && userSettings.hideMaxedLabs) {
                        selectedLab = null;
                    }
                    await saveUserSettings(modalInt.user.id, modalInt.user.username, userSettings.labSpeed, userSettings.labRelic, userSettings.labDiscount, startLevel, targetLevel, userSettings.speedUp, userSettings.labLevels);
                    // Update chart if needed
                    let chartBufferNew = null;
                    if (selectedCategory && selectedLab) {
                        const labObj = LABS[selectedLab];
                        const { chart } = calculateLabChart(labObj, startLevel, targetLevel, userSettings);
                        chartBufferNew = await generateChartImage(labObj, chart, chart.length > 0 ? chart[0].level : startLevel, chart.length > 0 ? chart[chart.length - 1].level : targetLevel, userSettings);
                        chartBuffer = chartBufferNew;
                    } else {
                        chartBuffer = null;
                    }
                    // Update embed
                    let embed = buildEmbed(userSettings, selectedCategory, selectedLab, chartBuffer);
                    embed.setFooter({ text: '✅ Range saved!' });
                    let files = chartBuffer ? [new AttachmentBuilder(chartBuffer, { name: 'lab_chart.png' })] : [];
                    // Build components for modal update, handling UW category
                    let components = [];
                    components.push(new ActionRowBuilder().addComponents(
                        (() => {
                            const selectedCatObj = categories.find(cat => cat.value === selectedCategory);
                            const placeholder = selectedCatObj ? selectedCatObj.label : (selectedCategory || 'Select a category');
                            const newOptions = categoryOptions.map(opt => ({
                                label: opt.label,
                                value: opt.value,
                                default: opt.value === selectedCategory
                            }));
                            return new StringSelectMenuBuilder()
                                .setCustomId('lab_category')
                                .setPlaceholder(placeholder)
                                .addOptions(newOptions);
                        })()
                    ));
                    // UW category special handling (match updateReply logic)
                    if (selectedCategory && selectedCategory.toLowerCase().includes('ultimate')) {
                        const uwLabs = getLabsByCategory(selectedCategory);
                        // Fixed, ordered list of UW types and labels
                        const UW_TYPE_LIST = [
                            { value: 'sm', label: 'Smart Missiles' },
                            { value: 'bh', label: 'Black Hole' },
                            { value: 'ps', label: 'Poison Swamp' },
                            { value: 'cl', label: 'Chain Lightning' },
                            { value: 'cf', label: 'Chrono Field' },
                            { value: 'gt', label: 'Golden Tower' },
                            { value: 'dw', label: 'Death Wave' },
                            { value: 'ilm', label: 'Inner Land Mines' },
                            { value: 'sl', label: 'Spotlight' }
                        ];
                        const UW_TYPE_PREFIX = {
                            sm: 'missile_',
                            bh: 'black_hole_',
                            ps: 'swamp_',
                            cl: 'chain_lightning_',
                            cf: 'chrono_field_',
                            gt: 'golden_tower_',
                            dw: 'death_wave_',
                            ilm: 'inner_mine_',
                            sl: 'spotlight_'
                        };
                        
                        // Helper function to check if all labs of a UW type are maxed
                        function isUWTypeFullyMaxed(typeValue) {
                            const prefix = UW_TYPE_PREFIX[typeValue];
                            let labsForType = uwLabs.filter(l => l.key.startsWith(prefix) && LABS[l.key]?.type === 'Ultimate Weapon');
                            
                            // If no labs found for this type, consider it "not maxed" so it shows up
                            if (labsForType.length === 0) return false;
                            
                            // Check if all labs of this type are maxed
                            return labsForType.every(l => {
                                const labObj = LABS[l.key];
                                const maxLevel = Array.isArray(labObj.levels) ? Math.max(...labObj.levels.map(lvl => lvl.level ?? 0)) : 0;
                                const currentLevel = userSettings.labLevels && userSettings.labLevels[l.key] ? userSettings.labLevels[l.key].startLevel ?? 0 : 0;
                                return currentLevel >= maxLevel;
                            });
                        }
                        
                        // Filter out UW types where all labs are maxed (only if hideMaxedLabs is enabled)
                        let availableUWTypes = UW_TYPE_LIST;
                        if (userSettings.hideMaxedLabs) {
                            availableUWTypes = UW_TYPE_LIST.filter(typeObj => !isUWTypeFullyMaxed(typeObj.value));
                        }
                        
                        // UW type dropdown (always shown)
                        let uwTypeMenu = new StringSelectMenuBuilder()
                            .setCustomId('uw_type')
                            .setPlaceholder('Select Ultimate Weapon');
                        
                        if (availableUWTypes.length > 0) {
                            uwTypeMenu = uwTypeMenu.addOptions(availableUWTypes.map(typeObj => ({
                                label: typeObj.label,
                                value: typeObj.value,
                                default: selectedUWType === typeObj.value
                            })));
                        } else {
                            uwTypeMenu = uwTypeMenu.addOptions([
                                { label: 'All UW types maxed', value: 'none', default: true }
                            ]);
                        }
                        components.push(new ActionRowBuilder().addComponents(uwTypeMenu));
                        // If UW type selected, show filtered labs for that type
                        if (selectedUWType) {
                            const prefix = UW_TYPE_PREFIX[selectedUWType];
                            let labsForType = uwLabs.filter(l => l.key.startsWith(prefix) && LABS[l.key]?.type === 'Ultimate Weapon');
                            if (userSettings.hideMaxedLabs) {
                                labsForType = labsForType.filter(l => {
                                    const labObj = LABS[l.key];
                                    const maxLevel = Array.isArray(labObj.levels) ? Math.max(...labObj.levels.map(lvl => lvl.level ?? 0)) : 0;
                                    const currentLevel = userSettings.labLevels && userSettings.labLevels[l.key] ? userSettings.labLevels[l.key].startLevel ?? 0 : 0;
                                    return currentLevel < maxLevel;
                                });
                            }
                            labsForType = labsForType.slice(0, 25);
                            let labMenuBuilder = new StringSelectMenuBuilder()
                                .setCustomId('lab_lab')
                                .setPlaceholder('Select a lab');
                            if (labsForType.length > 0) {
                                const labOptions = labsForType.map(l => ({
                                    label: l.name,
                                    value: l.key,
                                    default: selectedLab === l.key
                                }));
                                labMenuBuilder = labMenuBuilder.addOptions(labOptions);
                            } else {
                                labMenuBuilder = labMenuBuilder.addOptions([
                                    { label: 'No labs found', value: 'none', default: true }
                                ]);
                            }
                            components.push(new ActionRowBuilder().addComponents(labMenuBuilder));
                        }
                    } else if (selectedCategory) {
                        // Normal labs dropdown
                        let labs = getLabsByCategory(selectedCategory);
                        if (userSettings.hideMaxedLabs) {
                            labs = labs.filter(l => {
                                const labObj = LABS[l.key];
                                const maxLevel = Array.isArray(labObj.levels) ? Math.max(...labObj.levels.map(lvl => lvl.level ?? 0)) : 0;
                                const currentLevel = userSettings.labLevels && userSettings.labLevels[l.key] ? userSettings.labLevels[l.key].startLevel ?? 0 : 0;
                                return currentLevel < maxLevel;
                            });
                        }
                        labs = labs.slice(0, 25);
                        let labMenuBuilder = new StringSelectMenuBuilder()
                            .setCustomId('lab_lab')
                            .setPlaceholder('Select a lab');
                        if (labs.length > 0) {
                            const labOptions = labs.map(l => ({
                                label: l.name,
                                value: l.key,
                                default: selectedLab === l.key
                            }));
                            labMenuBuilder = labMenuBuilder.addOptions(labOptions);
                        } else {
                            labMenuBuilder = labMenuBuilder.addOptions([
                                { label: 'No labs found', value: 'none', default: true }
                            ]);
                        }
                        components.push(new ActionRowBuilder().addComponents(labMenuBuilder));
                    }
                    if (selectedCategory && selectedLab) {
                        components.push(new ActionRowBuilder().addComponents(buildSpeedupDropdown(userSettings.speedUp)));
                    }
                    // Always add toggle button, and rangeButton if both selectedCategory and selectedLab are set
                    const toggleButton = new ButtonBuilder()
                        .setCustomId('lab_toggle_hide_maxed')
                        .setLabel(userSettings.hideMaxedLabs ? 'Show Maxed' : 'Hide Maxed')
                        .setStyle(ButtonStyle.Success);
                    const buttons = [settingsButton, toggleButton];
                    if (selectedCategory && selectedLab) buttons.splice(1, 0, rangeButton); // Insert rangeButton after settingsButton if lab selected
                    buttons.push(closeButton);
                    components.push(new ActionRowBuilder().addComponents(...buttons));
                    // Update main interface
                    await modalInt.update({
                        embeds: [embed],
                        components,
                        files,
                        ephemeral: true
                    });
                } catch (err) {
                    console.error('Failed to update range modal reply:', err);
                    if (!modalInt.replied && !modalInt.deferred) {
                        await modalInt.reply({
                            content: '❌ An error occurred while saving settings.',
                            ephemeral: true
                        });
                    }
                }
            }
        });

        collector.on('end', () => {
            console.log('Lab calculator collector ended.');
        });
    }
};
