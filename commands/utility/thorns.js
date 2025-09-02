const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { calculateEnemyHP, calculateEnemyDMG, parseTier, parseNumberInput, formatNumberOutput } = require('./statFinderFunctions.js');
const fs = require('fs');
const puppeteer = require('puppeteer');
const path = require('path');
const sharp = require('sharp'); 
const { createCanvas } = require('canvas');
const style = require('./chartFunctions/style');

const thornsCalculator = {
    func: thornsChart,
    inputs: [
        { id: 'baseThorns', label: 'Thorns %', type: TextInputStyle.Short, min: 0, max: 600 },
        { id: 'tier', label: 'Tier (1-18)', type: TextInputStyle.Short, min: 1, max: 18 },
        { id: 'pcLevel', label: 'Plasma Cannon level (1-7)', type: TextInputStyle.Short, min: 1, max: 7 },
        { id: 'pcMasteryLevel', label: 'Plasma Cannon Mastery level (0-9)', type: TextInputStyle.Short, min: 0, max: 9 },
        { id: 'bcLabLevel', label: 'Battle Condition lab (0-10)', type: TextInputStyle.Short, min: 0, max: 10 }
    ]
};

async function generateChartImageCanvas(
    chart, baseThorns, tier, pcLevel, pcMasteryLevel, bcLabLevel,
    sharpFortitude, compareMode = false, chartSF = null
) {

    // Chart dimensions (dynamic column widths)
    // Dynamically set headers and columns based on PCM value
    const showElitePC = pcMasteryLevel > 0;
    const headers = showElitePC
        ? ['Wall\nThorns%', 'Elites', 'Elites\n& PC', 'Boss', 'Boss\n& PC']
        : ['Wall\nThorns%', 'Elites', 'Boss', 'Boss\n& PC'];
    const numCols = headers.length;
    const numRows = chart.length;
    const cellH = 38;
    const margin = 32;

    // Create a temp canvas for measuring text
    const tempCanvas = createCanvas(10, 10);
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.font = style.cellFont || '16px Arial';

    // Calculate max width for each column
    let colWidths = Array(numCols).fill(0);
    // Check header widths first
    tempCtx.font = style.headerCellFont || 'bold 18px Arial';
    for (let c = 0; c < numCols; c++) {
        colWidths[c] = Math.max(colWidths[c], tempCtx.measureText(headers[c]).width);
    }
    // Check cell values
    tempCtx.font = style.cellFont || '16px Arial';
    for (let c = 0; c < numCols; c++) {
        for (let r = 0; r < chart.length; r++) {
            let val = '';
            let valSF = '';
            // Map columns to data fields depending on showElitePC
            if (showElitePC) {
                switch (c) {
                    case 0:
                        val = chart[r].wallThorns;
                        break;
                    case 1:
                        val = chart[r].hitsToKillElite;
                        if (compareMode) valSF = chartSF[r].hitsToKillElite;
                        break;
                    case 2:
                        val = chart[r].hitsToKillElitePC;
                        if (compareMode) valSF = chartSF[r].hitsToKillElitePC;
                        break;
                    case 3:
                        val = chart[r].hitsToKillBoss;
                        if (compareMode) valSF = chartSF[r].hitsToKillBoss;
                        break;
                    case 4:
                        val = chart[r].hitsToKillBossPC;
                        if (compareMode) valSF = chartSF[r].hitsToKillBossPC;
                        break;
                }
            } else {
                switch (c) {
                    case 0:
                        val = chart[r].wallThorns;
                        break;
                    case 1:
                        val = chart[r].hitsToKillElite;
                        if (compareMode) valSF = chartSF[r].hitsToKillElite;
                        break;
                    case 2:
                        val = chart[r].hitsToKillBoss;
                        if (compareMode) valSF = chartSF[r].hitsToKillBoss;
                        break;
                    case 3:
                        val = chart[r].hitsToKillBossPC;
                        if (compareMode) valSF = chartSF[r].hitsToKillBossPC;
                        break;
                }
            }
            // For compare mode, measure both values side by side
            if (compareMode && c > 0) {
                tempCtx.font = style.cellFont || '16px Arial';
                const valWidth = tempCtx.measureText(String(val)).width;
                tempCtx.font = 'bold 16px Arial';
                const valSFWidth = tempCtx.measureText(String(valSF)).width;
                colWidths[c] = Math.max(colWidths[c], valWidth + 8 + valSFWidth + 8);
            } else {
                tempCtx.font = style.cellFont || '16px Arial';
                colWidths[c] = Math.max(colWidths[c], tempCtx.measureText(String(val)).width);
            }
        }
    }
    // Add padding to each column
    colWidths = colWidths.map(w => Math.ceil(w) + 24);

    // --- Calculate dynamic footer height ---
    // Compose footer values
    const footerValues = [
        `PC Level: ${pcLevel}`,
        `PCM Level: ${pcMasteryLevel}`,
        `BC Lab Level: ${bcLabLevel}`,
        `Sharp Fortitude: ${sharpFortitude ? 'In Bold' : 'OFF'}`
    ];
    // Use the same logic as below to determine how many lines are needed
    // We'll use a temp canvas context for measurement
    const tempFooterFont = style.cellFont || '16px Arial';
    const tempFooterCanvas = createCanvas(10, 10);
    const tempFooterCtx = tempFooterCanvas.getContext('2d');
    tempFooterCtx.font = tempFooterFont;
    const maxFooterWidth = colWidths.reduce((a, b) => a + b, 0); // tableW
    let footerLinesArr = [];
    let currentFooterLine = '';
    for (let i = 0; i < footerValues.length; i++) {
        const value = footerValues[i];
        const testLine = currentFooterLine ? currentFooterLine + '   |   ' + value : value;
        const testWidth = tempFooterCtx.measureText(testLine).width;
        if (testWidth > maxFooterWidth && currentFooterLine) {
            footerLinesArr.push(currentFooterLine);
            currentFooterLine = value;
        } else {
            currentFooterLine = testLine;
        }
    }
    if (currentFooterLine) footerLinesArr.push(currentFooterLine);
    const footerHeight = footerLinesArr.length * 24 + 8; // 24px per line, 8px extra padding

    // Calculate table width/height
    const tableW = colWidths.reduce((a, b) => a + b, 0);
    const tableH = (numRows + 1) * cellH;
    const width = tableW + margin * 2;
    // Height: margin (top) + title + subtitle + headers + table + margin (bottom) + footer
    const headerYOffsetVal = 32 + 28; // must match below
    const height = margin + headerYOffsetVal + tableH + footerHeight + margin;
    const startX = margin, startY = margin;

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Background
    ctx.fillStyle = style.bg || '#181c20';
    ctx.fillRect(0, 0, width, height);

    // Draw title
    ctx.font = style.titleFont || 'bold 24px Arial';
    ctx.fillStyle = style.titleText || '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('Wall Thorns Hits to Kills', width / 2, margin / 2);

    // Draw base thorns% and tier below the title
    ctx.font = style.subtitleFont || '16px Arial';
    ctx.fillStyle = style.subtitleText || '#e6e6e6';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(`Base Thorns: ${baseThorns}%    |    Tier: ${tier}`, width / 2, margin / 2 + 32);

    // Shift headers and table down to make room for title and subtitle
    const headerYOffset = headerYOffsetVal; // Space for title + subtitle
    ctx.font = style.headerCellFont || 'bold 18px Arial';
    ctx.fillStyle = style.headerText || '#8fffd7';
    let colX = startX;
    for (let c = 0; c < numCols; c++) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(colX, startY + headerYOffset, colWidths[c], cellH);
        ctx.fillStyle = style.headerBg || '#23272b';
        ctx.fill();
        ctx.strokeStyle = style.borderColor || '#3a4046';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = style.headerText || '#8fffd7';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const headerLines = headers[c].split('\n');
        for (let l = 0; l < headerLines.length; l++) {
            ctx.fillText(
                headerLines[l],
                colX + colWidths[c] / 2,
                startY + headerYOffset + cellH / 2 + (l - (headerLines.length - 1) / 2) * 16
            );
        }
        ctx.restore();
        colX += colWidths[c];
    }

    // Draw rows (shifted down for title)
    ctx.font = style.cellFont || '16px Arial';
    for (let r = 0; r < chart.length; r++) {
        let colX = startX;
        for (let c = 0; c < numCols; c++) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(colX, startY + headerYOffset + (r + 1) * cellH, colWidths[c], cellH);
            ctx.fillStyle = r % 2 === 0 ? (style.evenRowBg || '#23272b') : (style.oddRowBg || '#1b1e22');
            ctx.fill();
            ctx.strokeStyle = style.borderColor || '#3a4046';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            let val = '';
            let valSF = '';
            // Map columns to data fields depending on showElitePC
            if (showElitePC) {
                switch (c) {
                    case 0:
                        val = chart[r].wallThorns;
                        break;
                    case 1:
                        val = chart[r].hitsToKillElite;
                        if (compareMode) valSF = chartSF[r].hitsToKillElite;
                        break;
                    case 2:
                        val = chart[r].hitsToKillElitePC;
                        if (compareMode) valSF = chartSF[r].hitsToKillElitePC;
                        break;
                    case 3:
                        val = chart[r].hitsToKillBoss;
                        if (compareMode) valSF = chartSF[r].hitsToKillBoss;
                        break;
                    case 4:
                        val = chart[r].hitsToKillBossPC;
                        if (compareMode) valSF = chartSF[r].hitsToKillBossPC;
                        break;
                }
            } else {
                switch (c) {
                    case 0:
                        val = chart[r].wallThorns;
                        break;
                    case 1:
                        val = chart[r].hitsToKillElite;
                        if (compareMode) valSF = chartSF[r].hitsToKillElite;
                        break;
                    case 2:
                        val = chart[r].hitsToKillBoss;
                        if (compareMode) valSF = chartSF[r].hitsToKillBoss;
                        break;
                    case 3:
                        val = chart[r].hitsToKillBossPC;
                        if (compareMode) valSF = chartSF[r].hitsToKillBossPC;
                        break;
                }
            }
            if (!compareMode) {
                ctx.font = 'bold 16px Arial';
                ctx.fillStyle = style.textColor || '#e6e6e6';
                ctx.fillText(val, colX + colWidths[c] / 2, startY + headerYOffset + (r + 1) * cellH + cellH / 2);
            } else {
                // Compare mode: show both values in the same cell, SF value in bold
                ctx.fillStyle = style.textColor || '#e6e6e6';
                if (c > 0) {
                    // Draw normal value (left), SF value (right, bold)
                    // Calculate text widths for proper spacing
                    ctx.font = style.cellFont || '16px Arial';
                    const valWidth = ctx.measureText(String(val)).width;
                    ctx.font = 'bold 16px Arial';
                    const valSFWidth = ctx.measureText(String(valSF)).width;
                    const totalWidth = valWidth + 8 + valSFWidth;
                    const centerX = colX + colWidths[c] / 2;
                    const centerY = startY + headerYOffset + (r + 1) * cellH + cellH / 2;
                    // Draw normal value (right-aligned before center)
                    ctx.font = style.cellFont || '16px Arial';
                    ctx.textAlign = 'right';
                    ctx.fillText(val, centerX - totalWidth / 2 + valWidth, centerY);
                    // Draw SF value (left-aligned after normal)
                    ctx.font = 'bold 16px Arial';
                    ctx.textAlign = 'left';
                    ctx.fillText(valSF, centerX - totalWidth / 2 + valWidth + 8, centerY);
                } else {
                    // First column, just show normal value
                    ctx.font = style.cellFont || '16px Arial';
                    ctx.fillText(val, colX + colWidths[c] / 2, startY + headerYOffset + (r + 1) * cellH + cellH / 2);
                }
            }
            ctx.restore();
            colX += colWidths[c];
        }
    }

    // Bottom Inputs: PC Level, PCM Level, BC Lab Level, Sharp Fortitude (with wrapping)
    ctx.font = style.cellFont || '16px Arial';
    ctx.fillStyle = style.textColor || '#e6e6e6';
    ctx.textAlign = 'center';
    // Use the precomputed footerLinesArr and footerHeight
    const footerYOffset = headerYOffset + (numRows + 1) * cellH + margin;
    for (let i = 0; i < footerLinesArr.length; i++) {
        ctx.fillText(
            footerLinesArr[i],
            width / 2,
            footerYOffset + i * 24
        );
    }

    // Save image
    const outPath = path.resolve(`./thorns_chart_${Date.now()}.png`);
    const out = fs.createWriteStream(outPath);
    const stream = canvas.createPNGStream();
    stream.pipe(out);
    await new Promise(res => out.on('finish', res));
    return outPath;
}

function thornsChart(baseThorns, tier, pcLevel, pcMasteryLevel, bcLabLevel, sharpFortitude = false) {
    const thornTierEffectiveness = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0.75, 0.5, 0.4, 0.3, 0.2];
    const pcTierEffectiveness = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0.75, 0.6, 0.5, 0.4, 0.2];
    const tierIndex = tier - 1;

    const adjustedEffectiveness = thornTierEffectiveness[tierIndex] + (bcLabLevel * 0.02);
    const pcBaseEffectiveness = pcLevel > 0 ? 0.3 + (pcLevel - 1) * 0.04 : 0;
    const pcEffectiveBoss = pcLevel > 0 ? pcBaseEffectiveness * pcTierEffectiveness[tierIndex] : 0;
    const pcEffectiveElite = pcLevel >= 7 && pcMasteryLevel > 0 ? pcBaseEffectiveness * (0.05 + (pcMasteryLevel - 1) * 0.05) : 0;

    const chart = [];
    for (let wallThorns = 1; wallThorns <= 20; wallThorns++) {
        // Helper to calculate hits to kill with or without Sharp Fortitude
        function calcHitsToKill(dmgPerHitFn, label) {
            let total = 0;
            let hits = 0;
            let debugArr = [];
            while (total < 100 && hits < 1000) { // safety cap
                hits++;
                let effectiveWallThorns = wallThorns;
                // Apply SF as multiplicative: wallThorns * (1 + 0.01 * (hits - 1))
                if (sharpFortitude && hits > 1) effectiveWallThorns = wallThorns * (1 + 0.01 * (hits - 1));
                const dmg = dmgPerHitFn(effectiveWallThorns);
                total += dmg;
                debugArr.push({hit: hits, effWallThorns: effectiveWallThorns, dmg, total});
            }
            // No per-hit debug output
            return hits;
        }

        // Elite
        const hitsToKillElite = calcHitsToKill((wt) => baseThorns * ((wt / 100) * adjustedEffectiveness), 'Elite');
        // Elite + PC
        const hitsToKillElitePC = pcLevel > 0
            ? calcHitsToKill((wt) => baseThorns * ((wt / 100) * adjustedEffectiveness) * (1 + pcEffectiveElite), 'Elite+PC')
            : hitsToKillElite;
        // Boss
        const hitsToKillBoss = calcHitsToKill((wt) => (baseThorns * ((wt / 100) * adjustedEffectiveness)) / 2, 'Boss');
        // Boss + PC
        const hitsToKillBossPC = pcLevel > 0
            ? calcHitsToKill((wt) => (baseThorns * ((wt / 100) * adjustedEffectiveness) * (1 + pcEffectiveBoss)) / 2, 'Boss+PC')
            : hitsToKillBoss;

        chart.push({
            wallThorns,
            hitsToKillElite,
            hitsToKillElitePC,
            hitsToKillBoss,
            hitsToKillBossPC
        });
    }

    // Print the chart in a readable text table
    console.log(`\n[Sharp Fortitude: ${sharpFortitude ? 'ON' : 'OFF'}] Wall Thorns Chart:`);
    console.log('WallThorns | Elite | Elite+PC | Boss | Boss+PC');
    chart.forEach(row => {
        console.log(
            `${row.wallThorns.toString().padStart(9)} | ` +
            `${row.hitsToKillElite.toString().padStart(5)} | ` +
            `${row.hitsToKillElitePC.toString().padStart(8)} | ` +
            `${row.hitsToKillBoss.toString().padStart(4)} | ` +
            `${row.hitsToKillBossPC.toString().padStart(7)}`
        );
    });
    return chart;
}

async function showModalAndGetValues(interaction) {
    const modal = new ModalBuilder()
        .setCustomId('thorns_calculator_modal')
        .setTitle('Enter values for Thorns Calculator');

    const actionRows = thornsCalculator.inputs.map(input =>
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId(input.id)
                .setLabel(input.label)
                .setStyle(input.type)
                .setRequired(true)
        )
    );

    modal.addComponents(...actionRows);
    await interaction.showModal(modal);

    const modalSubmit = await interaction.awaitModalSubmit({
        filter: m => m.customId === 'thorns_calculator_modal' && m.user.id === interaction.user.id,
        time: 120000
    });

    const values = thornsCalculator.inputs.map(input => {
        const rawValue = modalSubmit.fields.getTextInputValue(input.id);

        // Parse numeric inputs
        return parseFloat(rawValue);
    });

    return { values, modalSubmit };
}

async function handleButtonInteraction(interaction, values) {
    const buttonId = interaction.customId;
    const [field, action] = buttonId.split('_');

    const index = thornsCalculator.inputs.findIndex(input => input.id === field);
    if (index === -1) {
        return interaction.reply({ content: 'Invalid button interaction.', ephemeral: true });
    }

    if (action === 'up') {
        values[index]++;
    } else if (action === 'down') {
        values[index]--;
    }

    const response = thornsCalculator.func(...values);

    await interaction.update({
        content: `${response}`,
        components: createButtons(values)
    });
}

function createButtons(values) {
    return thornsCalculator.inputs.map((input, index) => {
        return new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`${input.id}_up`)
                .setLabel(`${input.label} +`)
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(`${input.id}_down`)
                .setLabel(`${input.label} -`)
                .setStyle(ButtonStyle.Danger)
        );
    });
}

// Store SF state per interaction (ephemeral, not persistent)
const sharpFortitudeState = {};

module.exports = {
    category: 'utility',
    data: new SlashCommandBuilder()
        .setName('thorns')
        .setDescription('Calculate number of wall thorn hits required to kill'),

    async execute(interaction) {
        try {
            const modal = new ModalBuilder()
                .setCustomId('thorns_calculator_modal')
                .setTitle('Enter values for Thorns Calculator');

            const actionRows = thornsCalculator.inputs.map(input =>
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId(input.id)
                        .setLabel(input.label)
                        .setStyle(input.type)
                        .setRequired(true)
                )
            );

            modal.addComponents(...actionRows);
            await interaction.showModal(modal);

            const modalSubmit = await interaction.awaitModalSubmit({
                filter: m => m.customId === 'thorns_calculator_modal' && m.user.id === interaction.user.id,
                time: 120000
            });

            const values = thornsCalculator.inputs.map(input => parseFloat(modalSubmit.fields.getTextInputValue(input.id)));
            const [baseThorns, tier, pcLevel, pcMasteryLevel, bcLabLevel] = values;

            // Default: SF off
            sharpFortitudeState[modalSubmit.id] = false;

            // Helper to send chart with toggle
            // Helper to build the Edit button
            function buildEditButton(id) {
                return new ButtonBuilder()
                    .setCustomId(`edit_modal_${id}`)
                    .setLabel('Edit')
                    .setStyle(ButtonStyle.Primary);
            }

            // Helper to build the SF toggle button
            function buildToggleButton(sfEnabled, id) {
                return new ButtonBuilder()
                    .setCustomId(`toggle_sf_${id}`)
                    .setLabel(`Sharp Fortitude: ${sfEnabled ? 'ON' : 'OFF'}`)
                    .setStyle(sfEnabled ? ButtonStyle.Success : ButtonStyle.Secondary);
            }


            // Helper to build chart row (returns {files, components})
            async function buildChartReply(sfEnabled, modalId, values) {
                const [baseThorns, tier, pcLevel, pcMasteryLevel, bcLabLevel] = values;
                let chart, chartSF, screenshotPath;
                if (sfEnabled) {
                    // Show comparison: chart = SF OFF, chartSF = SF ON
                    chart = thornsChart(baseThorns, tier, pcLevel, pcMasteryLevel, bcLabLevel, false);
                    chartSF = thornsChart(baseThorns, tier, pcLevel, pcMasteryLevel, bcLabLevel, true);
                    screenshotPath = await generateChartImageCanvas(chart, baseThorns, tier, pcLevel, pcMasteryLevel, bcLabLevel, true, true, chartSF);
                } else {
                    chart = thornsChart(baseThorns, tier, pcLevel, pcMasteryLevel, bcLabLevel, false);
                    screenshotPath = await generateChartImageCanvas(chart, baseThorns, tier, pcLevel, pcMasteryLevel, bcLabLevel, false, false);
                }
                const row = new ActionRowBuilder().addComponents(
                    buildEditButton(modalId),
                    buildToggleButton(sfEnabled, modalId)
                );
                return { files: [screenshotPath], components: [row], ephemeral: true };
    // chartSF is only used in compare mode
            }

            // Initial reply
            if (!modalSubmit.replied && !modalSubmit.deferred) {
                await modalSubmit.reply(await buildChartReply(false, modalSubmit.id, values));
            }

            // Collector logic refactored to allow new collector per edit, with new modalId each time
            async function activateCollector(replyMsg, modalId) {
                const collector = replyMsg.createMessageComponentCollector({
                    filter: i => (i.customId === `toggle_sf_${modalId}` || i.customId === `edit_modal_${modalId}`) && i.user.id === interaction.user.id,
                    time: 300000
                });
                collector.on('collect', async i => {
                    if (i.customId === `toggle_sf_${modalId}`) {
                        sharpFortitudeState[modalId] = !sharpFortitudeState[modalId];
                        const sfEnabled = sharpFortitudeState[modalId];
                        if (i.isButton() && !i.replied && !i.deferred) {
                            await i.deferUpdate();
                        }
                        await i.editReply(await buildChartReply(sfEnabled, modalId, values));
                    } else if (i.customId === `edit_modal_${modalId}`) {
                        // Always create a new ModalBuilder instance for editing
                        const newModalId = Date.now().toString();
                        const editModal = new ModalBuilder()
                            .setCustomId('thorns_calculator_modal_edit_' + newModalId) // Unique customId for each edit
                            .setTitle('Edit values for Thorns Calculator');
                        const actionRows = thornsCalculator.inputs.map((input, idx) =>
                            new ActionRowBuilder().addComponents(
                                new TextInputBuilder()
                                    .setCustomId(input.id)
                                    .setLabel(input.label)
                                    .setStyle(input.type)
                                    .setRequired(true)
                                    .setValue(values[idx].toString())
                            )
                        );
                        editModal.addComponents(...actionRows);
                        await i.showModal(editModal);

                        try {
                            // Accept any customId that starts with 'thorns_calculator_modal_edit' for this user
                            const editModalSubmit = await i.awaitModalSubmit({
                                filter: m => m.customId.startsWith('thorns_calculator_modal_edit') && m.user.id === interaction.user.id,
                                time: 120000
                            });
                            const newValues = thornsCalculator.inputs.map(input => parseFloat(editModalSubmit.fields.getTextInputValue(input.id)));
                            // Update values in closure
                            values[0] = newValues[0];
                            values[1] = newValues[1];
                            values[2] = newValues[2];
                            values[3] = newValues[3];
                            values[4] = newValues[4];
                            // Reset SF to OFF on edit
                            sharpFortitudeState[newModalId] = false;
                            if (editModalSubmit.isModalSubmit && editModalSubmit.isModalSubmit() && !editModalSubmit.replied && !editModalSubmit.deferred) {
                                await editModalSubmit.deferUpdate();
                            }
                            await editModalSubmit.editReply(await buildChartReply(false, newModalId, values));
                            // Stop the current collector
                            collector.stop();
                            // Start a new collector for the new reply with the new modalId
                            const newReplyMsg = await editModalSubmit.fetchReply();
                            activateCollector(newReplyMsg, newModalId);
                            // Clean up old state
                            delete sharpFortitudeState[modalId];
                        } catch (err) {
                            await i.followUp({ content: 'Edit timed out or failed.', ephemeral: true });
                        }
                    }
                });
                collector.on('end', () => {
                    delete sharpFortitudeState[modalId];
                });
            }

            const replyMsg = await modalSubmit.fetchReply();
            activateCollector(replyMsg, modalSubmit.id);
        } catch (error) {
            console.error('Error executing Thorns Calculator command:', error);
            await interaction.reply({ content: 'There was an error executing the command.', ephemeral: true });
        }
    }
};