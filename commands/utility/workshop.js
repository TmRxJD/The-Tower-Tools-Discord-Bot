const { AttachmentBuilder, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder } = require('discord.js');
const path = require('path');
const { createCanvas } = require('canvas');
const Database = require('better-sqlite3');
const { formatNumberOutput } = require('./statFinderFunctions.js');


// --- Workshop Data ---
const workshopData = require('./upgradesData/workshopData.js');

// Map UI stat values to workshopData export keys
const STAT_KEY_MAP = {
  damage: 'WSP_DAMAGE',
  rend_armor: 'WSP_REND_ARMOR',
  critical_factor: 'WSP_CRITICAL_FACTOR',
  damage_meter: 'WSP_DAMAGE_PER_METER',
  super_crit_mult: 'WSP_SUPER_CRIT_MULTI',
  attack_speed: 'WSP_ATTACK_SPEED',
  health: 'WSP_HEALTH',
  health_regen: 'WSP_HEALTH_REGEN',
  defense_absolute: 'WSP_DEFENSE_ABSOLUTE',
  land_mine_damage: 'WSP_LAND_MINE_DAMAGE',
  wall_health: 'WSP_WALL_HEALTH',
  orb_size: 'WSP_ORB_SIZE',
  cash_bonus: 'WSP_CASH_BONUS',
  coin_bonus: 'WSP_COIN_BONUS',
  cells_per_kill_bonus: 'WSP_CELLS_PER_KILL_BONUS',
  free_upgrades: 'WSP_FREE_UPGRADES',
  recovery_package: 'WSP_RECOVERY_PACKAGE',
  enemy_level_skip: 'WSP_ENEMY_LEVEL_SKIP'
};

// Workshop sections and stats (ordered as specified)
const WORKSHOP_SECTIONS = [
    {
        label: 'Attack',
        value: 'attack',
        stats: [
            { label: 'Damage', value: 'damage' },
            { label: 'Rend Armor', value: 'rend_armor' },
            { label: 'Critical Factor', value: 'critical_factor' },
            { label: 'Damage/Meter', value: 'damage_meter' },
            { label: 'Super Crit Mult', value: 'super_crit_mult' },
            { label: 'Attack Speed', value: 'attack_speed' },
        ]
    },
    {
        label: 'Defense',
        value: 'defense',
        stats: [
            { label: 'Health', value: 'health' },
            { label: 'Health Regen', value: 'health_regen' },
            { label: 'Defense Absolute', value: 'defense_absolute' },
            { label: 'Land Mine Damage', value: 'land_mine_damage' },
            { label: 'Wall Health', value: 'wall_health' },
            { label: 'Orb Size', value: 'orb_size' },
        ]
    },
    {
        label: 'Utility',
        value: 'utility',
        stats: [
            { label: 'Cash Bonus', value: 'cash_bonus' },
            { label: 'Coin Bonus', value: 'coin_bonus' },
            { label: 'Cells / Kill Bonus', value: 'cells_per_kill_bonus' },
            { label: 'Free Upgrades', value: 'free_upgrades' },
            { label: 'Recovery Package', value: 'recovery_package' },
            { label: 'Enemy Level Skip', value: 'enemy_level_skip' },
        ]
    }
];

// Default user settings
function getDefaultWorkshopSettings() {
    return {
        section: 'attack',
        stat: 'damage',
        currentLevel: 0,
        targetLevel: 10,
        discount: 0
    };
}

// Modal input configuration
const WORKSHOP_MODAL_INPUTS = [
    { id: 'current_level', label: 'Current Level', style: TextInputStyle.Short, required: true },
    { id: 'target_level', label: 'Target Level', style: TextInputStyle.Short, required: true },
    { id: 'discount', label: 'Workshop Discount (%)', style: TextInputStyle.Short, required: true }
];

function createWorkshopModal(settings = {}) {
    const merged = { ...getDefaultWorkshopSettings(), ...settings };
    // Determine max level for the selected stat
    let maxLevel = 0;
    try {
        const statKey = STAT_KEY_MAP[merged.stat];
        const arr = statKey ? workshopData[statKey] : undefined;
        if (Array.isArray(arr)) maxLevel = arr.length;
    } catch {}
    const modal = new ModalBuilder()
        .setCustomId('workshop_settings_modal')
        .setTitle('Workshop Upgrade Settings');
    const inputs = WORKSHOP_MODAL_INPUTS.map(input => {
        let label = input.label;
        if (['current_level', 'target_level'].includes(input.id)) {
            label += ` (0-${maxLevel})`;
        }
        const value = merged[input.id.replace('_level', 'Level')] !== undefined ? String(merged[input.id.replace('_level', 'Level')]) : '';
        const textInput = new TextInputBuilder()
            .setCustomId(input.id)
            .setLabel(label)
            .setStyle(input.style)
            .setRequired(input.required)
            .setValue(value);
        return new ActionRowBuilder().addComponents(textInput);
    });
    modal.addComponents(...inputs);
    return modal;
}

// Cost calculation
function calculateWorkshopCost({ stat, fromLevel, toLevel, discount }) {
    // Map UI stat to export key
    const statKey = STAT_KEY_MAP[stat];
    const costs = workshopData[statKey];
    let total = 0;
    const start = fromLevel + 1;
    for (let lvl = start; lvl <= toLevel; lvl++) {
        const idx = lvl - 1;
        if (costs && costs[idx] !== undefined) {
            total += costs[idx];
        }
    }
    total = total * (1 - 0.01 * (discount || 0));
    return total;
}

// Stat calculation (multiplier: 1.00 + 0.01 * level)
function getWorkshopStatValue(stat, level) {
    // All stats: multiplier increases by 0.01 per level
    if (typeof level === 'number' && !isNaN(level)) {
        return (1 + 0.01 * level).toFixed(2) + 'x';
    }
    return '';
}

// Formatting helpers
function formatNumber(val) {
    return formatNumberOutput(val);
}

// Chart logic
function buildWorkshopUpgradeChart({ stat, fromLevel, toLevel, discount }) {
    const chart = [];
    let cumulativeCost = 0;
    for (let lvl = fromLevel + 1; lvl <= toLevel; lvl++) {
        let cost = calculateWorkshopCost({ stat, fromLevel: lvl - 1, toLevel: lvl, discount });
        cumulativeCost += cost;
        let statValue = getWorkshopStatValue(stat, lvl);
        chart.push({
            level: lvl,
            cost,
            cumulativeCost,
            statValue
        });
    }
    chart.totalCost = cumulativeCost;
    return chart;
}

// Chart image generation
function generateWorkshopChartImage(chart, { fromLevel, toLevel, discount, stat, statLabel }) {
    const columns = ['Level', statLabel, 'Cost', 'Total Cost'];
    const rowHeight = 28;
    const ctxMeasure = createCanvas(1, 1).getContext('2d');
    ctxMeasure.font = 'bold 15px Arial';
    function num(val) { return formatNumberOutput(val); }
    function getMaxColWidth(colIdx) {
        let max = ctxMeasure.measureText(columns[colIdx]).width;
        for (let rowIdx = 0; rowIdx < chart.length; rowIdx++) {
            const row = chart[rowIdx];
            let val = '';
            switch (colIdx) {
                case 0: val = row.level; break;
                case 1: val = row.statValue; break;
                case 2: val = num(row.cost); break;
                case 3: val = num(row.cumulativeCost); break;
            }
            max = Math.max(max, ctxMeasure.measureText(String(val)).width);
        }
        return Math.ceil(max) + 18;
    }
    const colWidths = columns.map((_, idx) => getMaxColWidth(idx));
    const width = colWidths.reduce((a, b) => a + b, 0) + 1;
    const tableRows = chart.length + 2; // header + data + summary
    const settingsSectionHeight = 40;
    const titleHeight = 54;
    const height = tableRows * rowHeight + titleHeight + settingsSectionHeight + 20;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    // Background
    ctx.fillStyle = '#181a20';
    ctx.fillRect(0, 0, width, height);
    // Title
    ctx.font = 'bold 22px Arial';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText('Workshop Enhancements', width / 2, 32);
    ctx.font = 'bold 16px Arial';
    ctx.fillStyle = '#b6fcd5';
    ctx.fillText(`Levels ${fromLevel + 1} - ${toLevel}`, width / 2, 50);
    // Table header
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
        ctx.fillText(columns[i], x + colWidths[i] / 2, titleHeight + 19);
        x += colWidths[i];
    }
    // Data rows
    ctx.font = '15px Arial';
    for (let rowIdx = 0; rowIdx < chart.length; rowIdx++) {
        let x = 0;
        const y = titleHeight + rowHeight * (rowIdx + 1);
        ctx.fillStyle = rowIdx % 2 === 0 ? '#23272f' : '#181a20';
        ctx.fillRect(0, y, width, rowHeight);
        const row = chart[rowIdx];
        const cells = [
            row.level,
            row.statValue,
            num(row.cost),
            num(row.cumulativeCost)
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
    // Summary row
    let y = titleHeight + rowHeight * (chart.length + 1);
    ctx.fillStyle = '#234d2c';
    ctx.fillRect(0, y, width, rowHeight);
    ctx.font = 'bold 15px Arial';
    let totalCost = typeof chart.totalCost === 'number' ? chart.totalCost : (chart.length > 0 ? chart[chart.length - 1].cumulativeCost : 0);
    const summaryCells = [
        'Total', '', '', num(totalCost)
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
    // User settings info section
    ctx.font = 'bold 15px Arial';
    ctx.fillStyle = '#b6fcd5';
    ctx.textAlign = 'center';
    let settingsY = titleHeight + rowHeight * (chart.length + 2) + 24;
    const footerText = `Workshop Discount: ${discount}%`;
    ctx.fillText(footerText, width / 2, settingsY);
    return canvas.toBuffer();
}

// Persistent user settings DB
const db = new Database(path.join(__dirname, 'workshopUserSettings.db'));
db.pragma('journal_mode = WAL');
db.prepare(`CREATE TABLE IF NOT EXISTS user_settings (
    user_id TEXT PRIMARY KEY,
    section TEXT,
    stat TEXT,
    currentLevel INTEGER,
    targetLevel INTEGER,
    discount INTEGER
)`).run();

function getUserSettings(userId) {
    const row = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(userId);
    if (row) {
        return {
            section: row.section,
            stat: row.stat,
            currentLevel: row.currentLevel,
            targetLevel: row.targetLevel,
            discount: row.discount
        };
    }
    return getDefaultWorkshopSettings();
}

function saveUserSettings(userId, settings) {
    db.prepare(`INSERT INTO user_settings (user_id, section, stat, currentLevel, targetLevel, discount)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
            section=excluded.section,
            stat=excluded.stat,
            currentLevel=excluded.currentLevel,
            targetLevel=excluded.targetLevel,
            discount=excluded.discount
    `).run(
        userId,
        settings.section,
        settings.stat,
        settings.currentLevel,
        settings.targetLevel,
        typeof settings.discount === 'number' ? settings.discount : 0
    );
}

// Main command
module.exports = {
    category: 'utility',
    data: new SlashCommandBuilder()
        .setName('workshop')
        .setDescription('Calculate the cost to upgrade a workshop stat.'),
    async execute(interaction) {
        try {
            const userId = interaction.user.id;
            let settings = getUserSettings(userId);
            // Section dropdown
            const sectionMenu = new StringSelectMenuBuilder()
                .setCustomId('workshop_section')
                .setPlaceholder('Select Section')
                .addOptions(WORKSHOP_SECTIONS.map(opt => ({ label: opt.label, value: opt.value, default: opt.value === settings.section })));
            // Stat dropdown
            const sectionObj = WORKSHOP_SECTIONS.find(s => s.value === settings.section) || WORKSHOP_SECTIONS[0];
            const statMenu = new StringSelectMenuBuilder()
                .setCustomId('workshop_stat')
                .setPlaceholder('Select Stat')
                .addOptions(sectionObj.stats.map(opt => ({ label: opt.label, value: opt.value, default: opt.value === settings.stat })));
            // Chart
            let chartAttachment = null;
            let chartImageUrl = null;
            let statLabel = sectionObj.stats.find(s => s.value === settings.stat)?.label || '';
            let totalCost = '-';
            let showChart = false;
            // Validate stat key
            const statKey = STAT_KEY_MAP[settings.stat];
            const costs = statKey ? workshopData[statKey] : undefined;
            if (statKey && Array.isArray(costs) && settings.currentLevel < settings.targetLevel) {
                showChart = true;
                const chartData = buildWorkshopUpgradeChart({
                    stat: settings.stat,
                    fromLevel: settings.currentLevel,
                    toLevel: settings.targetLevel,
                    discount: settings.discount
                });
                totalCost = chartData.totalCost;
                const buf = generateWorkshopChartImage(chartData, {
                    fromLevel: settings.currentLevel,
                    toLevel: settings.targetLevel,
                    discount: settings.discount,
                    stat: settings.stat,
                    statLabel
                });
                const fileName = `workshop_chart_${Date.now()}.png`;
                chartAttachment = new AttachmentBuilder(buf, { name: fileName });
                chartImageUrl = `attachment://${fileName}`;
            } else if (!statKey) {
                statLabel = 'Invalid Stat';
            } else if (!Array.isArray(costs)) {
                statLabel = 'No Data';
            }
            // Embed
            const embed = new EmbedBuilder()
                .setTitle('Workshop Upgrade Calculator')
                .setColor(0x2196F3)
                .setDescription('Configure your workshop upgrade parameters below.')
                .addFields(
                    { name: 'Section', value: sectionObj.label, inline: true },
                    { name: 'Stat', value: statLabel, inline: true },
                    { name: 'Discount', value: String(settings.discount) + '%', inline: true },
                    { name: 'Current Level', value: String(settings.currentLevel), inline: true },
                    { name: 'Target Level', value: String(settings.targetLevel), inline: true },
                    { name: 'Total Cost', value: formatNumber(totalCost), inline: true }
                );
            if (chartImageUrl) {
                embed.setImage(chartImageUrl);
            }
            embed.setFooter({ text: 'Your settings will be saved between uses.' });
            // Components
            const components = [
                new ActionRowBuilder().addComponents(sectionMenu),
                new ActionRowBuilder().addComponents(statMenu),
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('workshop_settings')
                        .setLabel('Enter Settings')
                        .setStyle(ButtonStyle.Primary)
                )
            ];
            // Only update the original message. If not possible, let it error.
            if (!interaction.replied && !interaction.deferred) {
                await interaction.deferReply({ ephemeral: true });
            }
            await interaction.editReply({
                embeds: [embed],
                components,
                files: chartAttachment ? [chartAttachment] : [],
            });
            // Handler
            if (!interaction.client.workshopHandlerRegistered) {
                interaction.client.on('interactionCreate', async int => {
                    if (!int.isStringSelectMenu() && !int.isButton() && !int.isModalSubmit()) return;
                    if (!['workshop_section', 'workshop_stat', 'workshop_settings'].includes(int.customId) && int.customId !== 'workshop_settings_modal') return;
                    const userId = int.user.id;
                    let settings = getUserSettings(userId);
                    if (int.isStringSelectMenu()) {
                        if (int.customId === 'workshop_section') {
                            settings.section = int.values[0];
                            // Default to first stat in new section
                            const sectionObj = WORKSHOP_SECTIONS.find(s => s.value === settings.section) || WORKSHOP_SECTIONS[0];
                            settings.stat = sectionObj.stats[0].value;
                        } else if (int.customId === 'workshop_stat') {
                            settings.stat = int.values[0];
                        }
                        saveUserSettings(userId, settings);

                        // Build the updated embed and components (same as modal)
                        const sectionObj = WORKSHOP_SECTIONS.find(s => s.value === settings.section) || WORKSHOP_SECTIONS[0];
                        const statLabel = sectionObj.stats.find(s => s.value === settings.stat)?.label || '';
                        const statKey = STAT_KEY_MAP[settings.stat];
                        const costs = statKey ? workshopData[statKey] : undefined;
                        let chartAttachment = null;
                        let chartImageUrl = null;
                        let totalCost = '-';
                        if (statKey && Array.isArray(costs) && settings.currentLevel < settings.targetLevel) {
                            const chartData = buildWorkshopUpgradeChart({
                                stat: settings.stat,
                                fromLevel: settings.currentLevel,
                                toLevel: settings.targetLevel,
                                discount: settings.discount
                            });
                            totalCost = chartData.totalCost;
                            const buf = generateWorkshopChartImage(chartData, {
                                fromLevel: settings.currentLevel,
                                toLevel: settings.targetLevel,
                                discount: settings.discount,
                                stat: settings.stat,
                                statLabel
                            });
                            const fileName = `workshop_chart_${Date.now()}.png`;
                            chartAttachment = new AttachmentBuilder(buf, { name: fileName });
                            chartImageUrl = `attachment://${fileName}`;
                        }
                        const embed = new EmbedBuilder()
                            .setTitle('Workshop Upgrade Calculator')
                            .setColor(0x2196F3)
                            .setDescription('Configure your workshop upgrade parameters below.')
                            .addFields(
                                { name: 'Section', value: sectionObj.label, inline: true },
                                { name: 'Stat', value: statLabel, inline: true },
                                { name: 'Discount', value: String(settings.discount) + '%', inline: true },
                                { name: 'Current Level', value: String(settings.currentLevel), inline: true },
                                { name: 'Target Level', value: String(settings.targetLevel), inline: true },
                                { name: 'Total Cost', value: formatNumber(totalCost), inline: true }
                            );
                        if (chartImageUrl) {
                            embed.setImage(chartImageUrl);
                        }
                        embed.setFooter({ text: 'Your settings will be saved between uses.' });
                        const sectionMenu = new StringSelectMenuBuilder()
                            .setCustomId('workshop_section')
                            .setPlaceholder('Select Section')
                            .addOptions(WORKSHOP_SECTIONS.map(opt => ({ label: opt.label, value: opt.value, default: opt.value === settings.section })));
                        const statMenu = new StringSelectMenuBuilder()
                            .setCustomId('workshop_stat')
                            .setPlaceholder('Select Stat')
                            .addOptions(sectionObj.stats.map(opt => ({ label: opt.label, value: opt.value, default: opt.value === settings.stat })));
                        const components = [
                            new ActionRowBuilder().addComponents(sectionMenu),
                            new ActionRowBuilder().addComponents(statMenu),
                            new ActionRowBuilder().addComponents(
                                new ButtonBuilder()
                                    .setCustomId('workshop_settings')
                                    .setLabel('Enter Settings')
                                    .setStyle(ButtonStyle.Primary)
                            )
                        ];
                        await int.update({
                            embeds: [embed],
                            components,
                            files: chartAttachment ? [chartAttachment] : [],
                        });
                    } else if (int.isButton() && int.customId === 'workshop_settings') {
                        const modal = createWorkshopModal(settings);
                        await int.showModal(modal);
                    } else if (int.isModalSubmit() && int.customId === 'workshop_settings_modal') {
                        const cur = parseInt(int.fields.getTextInputValue('current_level'));
                        const tgt = parseInt(int.fields.getTextInputValue('target_level'));
                        const disc = parseFloat(int.fields.getTextInputValue('discount'));
                        settings.currentLevel = isNaN(cur) ? 0 : Math.max(0, cur);
                        settings.targetLevel = isNaN(tgt) ? 10 : Math.max(settings.currentLevel, tgt);
                        settings.discount = isNaN(disc) ? 0 : parseFloat(disc);
                        saveUserSettings(userId, settings);

                        // Build the updated embed and components
                        const sectionObj = WORKSHOP_SECTIONS.find(s => s.value === settings.section) || WORKSHOP_SECTIONS[0];
                        const statLabel = sectionObj.stats.find(s => s.value === settings.stat)?.label || '';
                        const statKey = STAT_KEY_MAP[settings.stat];
                        const costs = statKey ? workshopData[statKey] : undefined;
                        let chartAttachment = null;
                        let chartImageUrl = null;
                        let totalCost = '-';
                        if (statKey && Array.isArray(costs) && settings.currentLevel < settings.targetLevel) {
                            const chartData = buildWorkshopUpgradeChart({
                                stat: settings.stat,
                                fromLevel: settings.currentLevel,
                                toLevel: settings.targetLevel,
                                discount: settings.discount
                            });
                            totalCost = chartData.totalCost;
                            const buf = generateWorkshopChartImage(chartData, {
                                fromLevel: settings.currentLevel,
                                toLevel: settings.targetLevel,
                                discount: settings.discount,
                                stat: settings.stat,
                                statLabel
                            });
                            const fileName = `workshop_chart_${Date.now()}.png`;
                            chartAttachment = new AttachmentBuilder(buf, { name: fileName });
                            chartImageUrl = `attachment://${fileName}`;
                        }
                        const embed = new EmbedBuilder()
                            .setTitle('Workshop Upgrade Calculator')
                            .setColor(0x2196F3)
                            .setDescription('Configure your workshop upgrade parameters below.')
                            .addFields(
                                { name: 'Section', value: sectionObj.label, inline: true },
                                { name: 'Stat', value: statLabel, inline: true },
                                { name: 'Discount', value: String(settings.discount) + '%', inline: true },
                                { name: 'Current Level', value: String(settings.currentLevel), inline: true },
                                { name: 'Target Level', value: String(settings.targetLevel), inline: true },
                                { name: 'Total Cost', value: formatNumber(totalCost), inline: true }
                            );
                        if (chartImageUrl) {
                            embed.setImage(chartImageUrl);
                        }
                        embed.setFooter({ text: 'Your settings will be saved between uses.' });
                        const sectionMenu = new StringSelectMenuBuilder()
                            .setCustomId('workshop_section')
                            .setPlaceholder('Select Section')
                            .addOptions(WORKSHOP_SECTIONS.map(opt => ({ label: opt.label, value: opt.value, default: opt.value === settings.section })));
                        const statMenu = new StringSelectMenuBuilder()
                            .setCustomId('workshop_stat')
                            .setPlaceholder('Select Stat')
                            .addOptions(sectionObj.stats.map(opt => ({ label: opt.label, value: opt.value, default: opt.value === settings.stat })));
                        const components = [
                            new ActionRowBuilder().addComponents(sectionMenu),
                            new ActionRowBuilder().addComponents(statMenu),
                            new ActionRowBuilder().addComponents(
                                new ButtonBuilder()
                                    .setCustomId('workshop_settings')
                                    .setLabel('Enter Settings')
                                    .setStyle(ButtonStyle.Primary)
                            )
                        ];
                        await int.update({
                            embeds: [embed],
                            components,
                            files: chartAttachment ? [chartAttachment] : [],
                        });
                    }
                });
                interaction.client.workshopHandlerRegistered = true;
            }
        } catch (err) {
            console.error('Error in /workshop command:', err);
            try {
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.deferReply({ ephemeral: true });
                }
                await interaction.editReply({ content: 'An error occurred while processing your request. Please try again later.', ephemeral: true });
            } catch {}
        }
    }
};
