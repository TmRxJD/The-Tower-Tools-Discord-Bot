const { createCanvas } = require('canvas');
const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const UW_DATA = require('./upgradesData/uwData.js');
const { getUserUWSettings, saveUserUWSettings } = require('./dbHandler.js');
const path = require('path');

// Chart generator for UW stone cost (table style, similar to labCalc)
// Accepts optional statFilterIdx to show only one stat (for stat filter dropdown)
// Optionally accepts statsEntered and targetLevels for single stat filtering
async function generateUWChartImage(uwKey, chart, statFilterIdx = null, statsEntered = null, targetLevels = null) {
    const uw = UW_DATA[uwKey];
    if (!uw || !chart) return null;
    let statsToShow, statIndexes, filteredRows, chartToUse;
    if (typeof statFilterIdx === 'number' && !isNaN(statFilterIdx) && statsEntered && targetLevels) {
        statsToShow = [uw.stats[statFilterIdx]];
        statIndexes = [statFilterIdx];
        // Regenerate chart for just this stat, using the entered and target level
        let singleStatsEntered = [];
        let singleTargetLevels = {};
        singleStatsEntered[statFilterIdx] = statsEntered[statFilterIdx];
        singleTargetLevels[statFilterIdx] = targetLevels[statFilterIdx];
        chartToUse = calculateUWChart(uwKey, singleStatsEntered, singleTargetLevels);
        // Only include rows for the selected stat's entered-to-target range
        const enteredLevel = statsEntered[statFilterIdx];
        const targetLevel = targetLevels[statFilterIdx];
        filteredRows = chartToUse.rows.filter(
            row => row.level >= enteredLevel && row.level <= targetLevel
        );
    } else {
        statsToShow = uw.stats;
        statIndexes = uw.stats.map((_, idx) => idx);
        filteredRows = chart.rows;
    }
    // Build columns: Level | Stat1 | Cost | ... | Cumulative (only for single stat)
    // If a stat has more than twice the levels of the 2nd longest, split its column
    const statLevelsCounts = statsToShow.map(s => s.levels.length);
    let splitStatIdx = null;
    let splitStatRepeat = 1;
    let columns = ['Level'];
    if (statsToShow.length === 1) {
        // Single stat filter: split into exactly 2 columns if more than 30 displayed rows
        const statLen = filteredRows.length;
        if (statLen > 30) {
            splitStatIdx = 0;
            splitStatRepeat = 2;
            // Columns: Level1 | Stat1 | Cost1 | Cumulative1 | Level2 | Stat2 | Cost2 | Cumulative2
            columns = ['Level', statsToShow[0].name, 'Cost', 'Cumulative', 'Level', statsToShow[0].name, 'Cost', 'Cumulative'];
        } else {
            columns = ['Level', statsToShow[0].name, 'Cost', 'Cumulative'];
            splitStatIdx = null;
            splitStatRepeat = 1;
        }
    } else {
        // Multi-stat view: use split logic based on this UW's stats only
        if (statLevelsCounts.length > 1) {
            // Find the stat with the most displayed rows for this UW
            const maxCount = Math.max(...statLevelsCounts);
            const secondMax = Math.max(...statLevelsCounts.filter(v => v !== maxCount));
            if (maxCount > 2 * secondMax) {
                splitStatIdx = statLevelsCounts.indexOf(maxCount);
            }
        }
        if (splitStatIdx !== null) {
            splitStatRepeat = Math.ceil(statLevelsCounts[splitStatIdx] / (statLevelsCounts.filter((v, i) => i !== splitStatIdx).reduce((a, b) => Math.max(a, b), 0) * 2));
            for (let i = 0; i < statsToShow.length; i++) {
                if (i === splitStatIdx) {
                    for (let j = 0; j < splitStatRepeat; j++) {
                        columns.push(statsToShow[i].name);
                        columns.push('Cost');
                    }
                } else {
                    columns.push(statsToShow[i].name);
                    columns.push('Cost');
                }
            }
        } else {
            statsToShow.forEach(s => {
                columns.push(s.name);
                columns.push('Cost');
            });
        }
        // Only add trailing Cumulative if not in split mode and only for multi-stat
        // (showCumulative will be declared below for all modes)
    }
    // Declare showCumulative for all modes, after columns are built
    const showCumulative = (statIndexes.length === 1 && !(statsToShow.length === 1 && filteredRows.length > 30));
    // Only add trailing Cumulative if not in split mode and only for multi-stat
    if (showCumulative && statsToShow.length > 1) columns.push('Cumulative');
    const rowHeight = 28;
    const ctxMeasure = createCanvas(1, 1).getContext('2d');
    ctxMeasure.font = 'bold 15px Arial';
    // Helper to get max width for a column
    function getMaxColWidth(colIdx) {
        const headerLines = columns[colIdx].split('\n');
        let max = Math.max(...headerLines.map(line => ctxMeasure.measureText(line).width));
        for (let rowIdx = 0; rowIdx < filteredRows.length; rowIdx++) {
            const row = filteredRows[rowIdx];
            let val = '';
            if (colIdx === 0) val = row.level;
            else {
                // Stat and cost columns alternate
                const statIdx = Math.floor((colIdx - 1) / 2);
                if ((colIdx - 1) % 2 === 0) {
                    // Stat value
                    val = row.stats[statIdx];
                } else {
                    // Stat cost
                    val = num(row.costs[statIdx]);
                }
            }
            max = Math.max(max, ctxMeasure.measureText(String(val)).width);
        }
        return Math.ceil(max) + 18;
    }
    const colWidths = columns.map((_, idx) => getMaxColWidth(idx));
    const width = colWidths.reduce((a, b) => a + b, 0) + 1;
    const titleHeight = 40;
    // Calculate dataRowCountLocal for canvas height and summary row logic
    let dataRowCountLocal;
    if (splitStatIdx !== null) {
        if (statsToShow.length === 1) {
            // Single-stat split mode: only show rows for the stat's actual range
            // (filteredRows.length is the correct count)
            if (statLevelsCounts[splitStatIdx] > 30) {
                // Split into two columns
                const leftLen = Math.ceil(statLevelsCounts[splitStatIdx] / 2);
                const rightLen = statLevelsCounts[splitStatIdx] - leftLen;
                dataRowCountLocal = Math.max(leftLen, rightLen);
            } else {
                dataRowCountLocal = filteredRows.length;
            }
        } else {
            // Multi-stat split mode: only show rows for the actual stat ranges
            // For the split stat, splitLen is the number of rows per split column
            const splitLen = Math.ceil(statLevelsCounts[splitStatIdx] / splitStatRepeat);
            // For other stats, use their actual length
            const otherMaxLen = Math.max(...statLevelsCounts.filter((v, i) => i !== splitStatIdx));
            // The number of rows is the max of splitLen and the max of the other stats
            dataRowCountLocal = Math.max(splitLen, otherMaxLen);
        }
    } else {
        // Not split: only show rows for the actual stat range (filteredRows.length)
        dataRowCountLocal = filteredRows.length;
    }
    const tableRows = dataRowCountLocal + 2; // header + data + summary
    const height = tableRows * rowHeight + titleHeight + 0;

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    // Background
    ctx.fillStyle = '#181a20';
    ctx.fillRect(0, 0, width, height);
    // Title
    ctx.font = 'bold 22px Arial';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText(`${uw.name}`, width / 2, 30);
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
        const headerLines = columns[i].split('\n');
        const lineHeight = 16;
        const totalHeaderHeight = headerLines.length * lineHeight;
        const startY = titleHeight + (rowHeight - totalHeaderHeight) / 2 + lineHeight - 2;
        for (let j = 0; j < headerLines.length; j++) {
            ctx.fillText(headerLines[j], x + colWidths[i] / 2, startY + j * lineHeight);
        }
        x += colWidths[i];
    }
    // Data rows
    ctx.font = '15px Arial';
    let cumulativeCost = 0;
    let cumulative = 0;
    if (splitStatIdx !== null) {
        // --- Unified single-stat row-building logic ---
        let splitLen;
        let allRows = [];
        // For multi-stat split mode, define totalRows
        let totalRows;
        if (statsToShow.length === 1) {
            // Build all rows for single-stat mode (split or not)
            let cumulative = 0;
            for (let rowIdx = 0; rowIdx < filteredRows.length; rowIdx++) {
                const row = filteredRows[rowIdx] || { level: '', stats: [], costs: [] };
                const statVal = row.stats[0];
                const costVal = row.costs[0];
                cumulative += costVal || 0;
                allRows.push({
                    level: row.level,
                    stat: statVal !== undefined ? statVal : '',
                    cost: (costVal && costVal !== 0) ? num(costVal) : '',
                    cumulative: num(cumulative)
                });
            }
            if (statLevelsCounts[splitStatIdx] > 30) {
                // Split into two columns
                splitLen = [
                    Math.ceil(statLevelsCounts[splitStatIdx] / 2),
                    statLevelsCounts[splitStatIdx] - Math.ceil(statLevelsCounts[splitStatIdx] / 2)
                ];
                let leftRows = allRows.slice(0, splitLen[0]);
                let rightRows = allRows.slice(splitLen[0]);
                let totalRows = Math.max(leftRows.length, rightRows.length);
                for (let rowIdx = 0; rowIdx < totalRows; rowIdx++) {
                    let x = 0;
                    const y = titleHeight + rowHeight * (rowIdx + 1);
                    ctx.fillStyle = rowIdx % 2 === 0 ? '#23272f' : '#181a20';
                    ctx.fillRect(0, y, width, rowHeight);
                    const cells = [];
                    // Left split
                    if (rowIdx < leftRows.length) {
                        const r = leftRows[rowIdx];
                        cells.push(r.level);
                        cells.push(r.stat);
                        cells.push(r.cost);
                        cells.push(r.cumulative);
                    } else {
                        cells.push('');
                        cells.push('');
                        cells.push('');
                        cells.push('');
                    }
                    // Right split
                    if (rowIdx < rightRows.length) {
                        const r = rightRows[rowIdx];
                        cells.push(r.level);
                        cells.push(r.stat);
                        cells.push(r.cost);
                        cells.push(r.cumulative);
                    } else {
                        cells.push('');
                        cells.push('');
                        cells.push('');
                        cells.push('');
                    }
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
            } else {
                // Not split, just render all rows
                for (let rowIdx = 0; rowIdx < allRows.length; rowIdx++) {
                    let x = 0;
                    const y = titleHeight + rowHeight * (rowIdx + 1);
                    ctx.fillStyle = rowIdx % 2 === 0 ? '#23272f' : '#181a20';
                    ctx.fillRect(0, y, width, rowHeight);
                    const r = allRows[rowIdx];
                    const cells = [r.level, r.stat, r.cost, r.cumulative];
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
            }
        } else {
            // Multi-stat split mode: original logic
            // Define totalRows for multi-stat split mode
            splitLen = Math.ceil(statLevelsCounts[splitStatIdx] / splitStatRepeat);
            const otherMaxLen = Math.max(...statLevelsCounts.filter((v, i) => i !== splitStatIdx));
            totalRows = Math.max(splitLen, otherMaxLen);
            for (let rowIdx = 0; rowIdx < totalRows; rowIdx++) {
                let x = 0;
                const y = titleHeight + rowHeight * (rowIdx + 1);
                ctx.fillStyle = rowIdx % 2 === 0 ? '#23272f' : '#181a20';
                ctx.fillRect(0, y, width, rowHeight);
                const cells = [];
                // Level column: show the level for the first split stat column that has a value, else blank
                let levelVal = '';
                for (let split = 0; split < splitStatRepeat; split++) {
                    const statLevelIdx = split * splitLen + rowIdx;
                    if (statLevelIdx < statLevelsCounts[splitStatIdx]) {
                        const row = filteredRows[statLevelIdx] || { level: '', stats: [], costs: [] };
                        if (levelVal === '' && row.level !== undefined && row.level !== '') levelVal = row.level;
                    }
                }
                cells.push(levelVal);
                let rowTotal = 0;
                for (let s = 0; s < statsToShow.length; s++) {
                    if (s === splitStatIdx) {
                        for (let split = 0; split < splitStatRepeat; split++) {
                            const statLevelIdx = split * splitLen + rowIdx;
                            if (statLevelIdx < statLevelsCounts[splitStatIdx]) {
                                const row = filteredRows[statLevelIdx] || { stats: [], costs: [] };
                                const statVal = row.stats[statIndexes[s]];
                                const costVal = row.costs[statIndexes[s]];
                                cells.push(statVal !== undefined ? statVal : '');
                                cells.push((costVal && costVal !== 0) ? num(costVal) : '');
                                rowTotal += costVal || 0;
                            } else {
                                cells.push('');
                                cells.push('');
                            }
                        }
                    } else {
                        // For other stats, only fill if rowIdx < their levels
                        if (rowIdx < statLevelsCounts[s]) {
                            const row = filteredRows[rowIdx] || { stats: [], costs: [] };
                            const statVal = row.stats[statIndexes[s]];
                            const costVal = row.costs[statIndexes[s]];
                            cells.push(statVal !== undefined ? statVal : '');
                            cells.push((costVal && costVal !== 0) ? num(costVal) : '');
                            rowTotal += costVal || 0;
                        } else {
                            cells.push('');
                            cells.push('');
                        }
                    }
                }
                if (showCumulative) {
                    cumulative += rowTotal;
                    cells.push(num(cumulative));
                }
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
        }
    } else {
        for (let rowIdx = 0; rowIdx < filteredRows.length; rowIdx++) {
            let x = 0;
            const y = titleHeight + rowHeight * (rowIdx + 1);
            ctx.fillStyle = rowIdx % 2 === 0 ? '#23272f' : '#181a20';
            ctx.fillRect(0, y, width, rowHeight);
            const row = filteredRows[rowIdx];
            // Build cells: Level | stat1 | cost1 | ... | [Cumulative]
            const cells = [row.level];
            let rowTotal = 0;
            for (let s = 0; s < statIndexes.length; s++) {
                const idx = statIndexes[s];
                // Stat value
                cells.push(row.stats[idx]);
                // Stat cost: leave blank if 0 or undefined
                const costVal = row.costs[idx];
                cells.push((costVal && costVal !== 0) ? num(costVal) : '');
                rowTotal += costVal || 0;
            }
            if (showCumulative) {
                cumulative += rowTotal;
                cells.push(num(cumulative));
            }
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
    }
    // Summary row
    let summaryY;
    summaryY = titleHeight + rowHeight * (dataRowCountLocal + 1);
    ctx.fillStyle = '#234d2c';
    ctx.fillRect(0, summaryY, width, rowHeight);
    ctx.font = 'bold 15px Arial';
    // For each stat, sum the costs (only for shown stats) and get max value and max bonus
    const statTotals = statIndexes.map(s => filteredRows.reduce((sum, row) => sum + (row.costs[s] || 0), 0));
    // Get max stat value and max bonus value for each stat column (handles split columns)
    let statMaxValues = [];
    let statMaxBonuses = [];
    let splitShift = 0;
    if (splitStatIdx !== null) {
        // For split stat, repeat max for each split column
        for (let s = 0; s < statsToShow.length; s++) {
            if (s === splitStatIdx) {
                const stat = statsToShow[s] || uw.stats[statIndexes[s]];
                const levels = stat && stat.levels ? stat.levels : [];
                const splitLen = Math.ceil(levels.length / splitStatRepeat);
                for (let split = 0; split < splitStatRepeat; split++) {
                    // For each split, get the max value and the bonus at the max level in that segment
                    const start = split * splitLen;
                    const end = Math.min(start + splitLen, levels.length);
                    const segment = levels.slice(start, end);
                    // Find the max level in this segment
                    let maxLevel = '';
                    if (segment.length > 0) {
                        maxLevel = Math.max(...segment.map(lvl => typeof lvl.level === 'number' ? lvl.level : Number.NEGATIVE_INFINITY));
                    }
                    // Find the bonus at the max level in this segment
                    let maxBonus = '';
                    if (segment.length > 0 && maxLevel !== '' && maxLevel !== Number.NEGATIVE_INFINITY) {
                        const maxLevelObj = segment.find(lvl => lvl.level === maxLevel);
                        if (maxLevelObj && typeof maxLevelObj.bonus !== 'undefined') {
                            maxBonus = maxLevelObj.bonus;
                        }
                    }
                    // Find the stat value at the max level in this segment
                    let maxVal = '';
                    if (segment.length > 0 && maxLevel !== '' && maxLevel !== Number.NEGATIVE_INFINITY) {
                        const maxLevelObj = segment.find(lvl => lvl.level === maxLevel);
                        if (maxLevelObj && typeof maxLevelObj.value !== 'undefined') {
                            maxVal = maxLevelObj.value;
                        }
                    }
                    statMaxValues.push(maxVal !== undefined ? maxVal : '');
                    statMaxBonuses.push(maxBonus !== undefined ? maxBonus : '');
                }
                splitShift = s * (splitStatRepeat * 2 - 2); // for shifting summary row
            } else {
                const stat = statsToShow[s] || uw.stats[statIndexes[s]];
                const levels = stat && stat.levels ? stat.levels : [];
                // Find the max level for this stat
                let maxLevel = '';
                if (levels.length > 0) {
                    maxLevel = Math.max(...levels.map(lvl => typeof lvl.level === 'number' ? lvl.level : Number.NEGATIVE_INFINITY));
                }
                // Find the bonus at the max level
                let maxBonus = '';
                if (levels.length > 0 && maxLevel !== '' && maxLevel !== Number.NEGATIVE_INFINITY) {
                    const maxLevelObj = levels.find(lvl => lvl.level === maxLevel);
                    if (maxLevelObj && typeof maxLevelObj.bonus !== 'undefined') {
                        maxBonus = maxLevelObj.bonus;
                    }
                }
                // Find the stat value at the max level
                let maxVal = '';
                if (levels.length > 0 && maxLevel !== '' && maxLevel !== Number.NEGATIVE_INFINITY) {
                    const maxLevelObj = levels.find(lvl => lvl.level === maxLevel);
                    if (maxLevelObj && typeof maxLevelObj.value !== 'undefined') {
                        maxVal = maxLevelObj.value;
                    }
                }
                statMaxValues.push(maxVal !== undefined ? maxVal : '');
                statMaxBonuses.push(maxBonus !== undefined ? maxBonus : '');
            }
        }
    } else {
        statMaxValues = statIndexes.map((s, idx) => {
            const stat = statsToShow[idx] || uw.stats[s];
            const levels = stat && stat.levels ? stat.levels : [];
            // Find the max level for this stat
            let maxLevel = '';
            if (levels.length > 0) {
                maxLevel = Math.max(...levels.map(lvl => typeof lvl.level === 'number' ? lvl.level : Number.NEGATIVE_INFINITY));
            }
            // Find the stat value at the max level
            let maxVal = '';
            if (levels.length > 0 && maxLevel !== '' && maxLevel !== Number.NEGATIVE_INFINITY) {
                const maxLevelObj = levels.find(lvl => lvl.level === maxLevel);
                if (maxLevelObj && typeof maxLevelObj.value !== 'undefined') {
                    maxVal = maxLevelObj.value;
                }
            }
            return maxVal !== undefined ? maxVal : '';
        });
        statMaxBonuses = statIndexes.map((s, idx) => {
            const stat = statsToShow[idx] || uw.stats[s];
            const levels = stat && stat.levels ? stat.levels : [];
            // Find the max level for this stat
            let maxLevel = '';
            if (levels.length > 0) {
                maxLevel = Math.max(...levels.map(lvl => typeof lvl.level === 'number' ? lvl.level : Number.NEGATIVE_INFINITY));
            }
            // Find the bonus at the max level
            let maxBonus = '';
            if (levels.length > 0 && maxLevel !== '' && maxLevel !== Number.NEGATIVE_INFINITY) {
                const maxLevelObj = levels.find(lvl => lvl.level === maxLevel);
                if (maxLevelObj && typeof maxLevelObj.bonus !== 'undefined') {
                    maxBonus = maxLevelObj.bonus;
                }
            }
            return maxBonus !== undefined ? maxBonus : '';
        });
    }
    // Build summary row ONCE and use for both image and console
    function buildSummaryRow(columns, statsToShow, statMaxValues, statTotals, splitStatIdx, splitStatRepeat, showCumulative) {
        let summaryCells = [];
        let statCostPairs = [];
        if (splitStatIdx !== null) {
            for (let s = 0; s < statsToShow.length; s++) {
                if (s === splitStatIdx) {
                    for (let split = 0; split < splitStatRepeat; split++) {
                        statCostPairs.push({
                            statIdx: s,
                            splitIdx: split,
                            isSplit: true
                        });
                    }
                } else {
                    statCostPairs.push({
                        statIdx: s,
                        splitIdx: null,
                        isSplit: false
                    });
                }
            }
        } else {
            for (let s = 0; s < statsToShow.length; s++) {
                statCostPairs.push({
                    statIdx: s,
                    splitIdx: null,
                    isSplit: false
                });
            }
        }
        let statMaxIdx = 0;
        let pairIdx = 0;
        for (let i = 0; i < columns.length; i++) {
            const col = columns[i];
            if (i === 0) {
                summaryCells.push('Total');
                continue;
            }
            if (showCumulative && col === 'Cumulative') {
                summaryCells.push(num(statTotals[0]));
                continue;
            }
            if (pairIdx < statCostPairs.length) {
                const pair = statCostPairs[pairIdx];
                if (col === statsToShow[pair.statIdx].name) {
                    if (pair.isSplit && pair.splitIdx !== splitStatRepeat - 1) {
                        summaryCells.push('');
                    } else {
                        summaryCells.push(statMaxValues[statMaxIdx] !== undefined ? statMaxValues[statMaxIdx] : '');
                    }
                    continue;
                }
                if (col === 'Cost') {
                    if (pair.isSplit && pair.splitIdx !== splitStatRepeat - 1) {
                        summaryCells.push('');
                    } else {
                        summaryCells.push(num(statTotals[pair.statIdx]));
                    }
                    statMaxIdx++;
                    pairIdx++;
                    continue;
                }
            }
            summaryCells.push('');
        }
        return summaryCells;
    }
    // Build summary row once
    let summaryCells = buildSummaryRow(columns, statsToShow, statMaxValues, statTotals, splitStatIdx, splitStatRepeat, showCumulative);
    // Draw summary row in image
    x = 0;
    for (let i = 0; i < columns.length; i++) {
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, summaryY, colWidths[i], rowHeight);
        ctx.fillStyle = '#b6fcd5';
        ctx.textAlign = 'center';
        ctx.fillText(String(summaryCells[i]), x + colWidths[i] / 2, summaryY + 19);
        x += colWidths[i];
    }
    // Outer border
    ctx.strokeStyle = '#b6fcd5';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, titleHeight, width, rowHeight * (dataRowCountLocal + 2));
    // --- DEBUG OUTPUT: Save chart image to disk for visual inspection ---
    // --- DEBUG OUTPUT: Print chart to console for agent-side debugging ---
    function pad(str, len, align = 'center') {
        str = String(str ?? '');
        if (str.length >= len) return str;
        const padLen = len - str.length;
        if (align === 'left') return str + ' '.repeat(padLen);
        if (align === 'right') return ' '.repeat(padLen) + str;
        // center
        const left = Math.floor(padLen / 2);
        const right = padLen - left;
        return ' '.repeat(left) + str + ' '.repeat(right);
    }
    // Build a 2D array of all rows: header, data, summary
    let tableRowsForConsole = [];
    // Header
    tableRowsForConsole.push(columns);
    // Data rows
    if (splitStatIdx !== null) {
        let splitLen;
        let allRows = [];
        // For multi-stat split mode, define totalRows
        let totalRows;
        if (statsToShow.length === 1) {
            // Unified single-stat row-building logic for console
            let cumulative = 0;
            for (let rowIdx = 0; rowIdx < filteredRows.length; rowIdx++) {
                const row = filteredRows[rowIdx] || { level: '', stats: [], costs: [] };
                const statVal = row.stats[0];
                const costVal = row.costs[0];
                cumulative += costVal || 0;
                allRows.push({
                    level: row.level,
                    stat: statVal !== undefined ? statVal : '',
                    cost: (costVal && costVal !== 0) ? num(costVal) : '',
                    cumulative: num(cumulative)
                });
            }
            if (statLevelsCounts[splitStatIdx] > 30) {
                // Split into two columns
                splitLen = [
                    Math.ceil(statLevelsCounts[splitStatIdx] / 2),
                    statLevelsCounts[splitStatIdx] - Math.ceil(statLevelsCounts[splitStatIdx] / 2)
                ];
                let leftRows = allRows.slice(0, splitLen[0]);
                let rightRows = allRows.slice(splitLen[0]);
                let totalRows = Math.max(leftRows.length, rightRows.length);
                for (let rowIdx = 0; rowIdx < totalRows; rowIdx++) {
                    const cells = [];
                    // Left split
                    if (rowIdx < leftRows.length) {
                        const r = leftRows[rowIdx];
                        cells.push(r.level);
                        cells.push(r.stat);
                        cells.push(r.cost);
                        cells.push(r.cumulative);
                    } else {
                        cells.push('');
                        cells.push('');
                        cells.push('');
                        cells.push('');
                    }
                    // Right split
                    if (rowIdx < rightRows.length) {
                        const r = rightRows[rowIdx];
                        cells.push(r.level);
                        cells.push(r.stat);
                        cells.push(r.cost);
                        cells.push(r.cumulative);
                    } else {
                        cells.push('');
                        cells.push('');
                        cells.push('');
                        cells.push('');
                    }
                    tableRowsForConsole.push(cells);
                }
            } else {
                // Not split, just render all rows
                for (let rowIdx = 0; rowIdx < allRows.length; rowIdx++) {
                    const r = allRows[rowIdx];
                    const cells = [r.level, r.stat, r.cost, r.cumulative];
                    tableRowsForConsole.push(cells);
                }
            }
        } else {
            // Multi-stat split mode: original logic
            // Define totalRows for multi-stat split mode
            splitLen = Math.ceil(statLevelsCounts[splitStatIdx] / splitStatRepeat);
            const otherMaxLen = Math.max(...statLevelsCounts.filter((v, i) => i !== splitStatIdx));
            totalRows = Math.max(splitLen, otherMaxLen);
            for (let rowIdx = 0; rowIdx < totalRows; rowIdx++) {
                let cells = [];
                // Level column
                let levelVal = '';
                for (let split = 0; split < splitStatRepeat; split++) {
                    const statLevelIdx = split * splitLen + rowIdx;
                    if (statLevelIdx < statLevelsCounts[splitStatIdx]) {
                        const row = filteredRows[statLevelIdx] || { level: '', stats: [], costs: [] };
                        if (levelVal === '' && row.level !== undefined && row.level !== '') levelVal = row.level;
                    }
                }
                cells.push(levelVal);
                let rowTotal = 0;
                for (let s = 0; s < statsToShow.length; s++) {
                    if (s === splitStatIdx) {
                        for (let split = 0; split < splitStatRepeat; split++) {
                            const statLevelIdx = split * splitLen + rowIdx;
                            if (statLevelIdx < statLevelsCounts[splitStatIdx]) {
                                const row = filteredRows[statLevelIdx] || { stats: [], costs: [] };
                                const statVal = row.stats[statIndexes[s]];
                                const costVal = row.costs[statIndexes[s]];
                                cells.push(statVal !== undefined ? statVal : '');
                                cells.push((costVal && costVal !== 0) ? num(costVal) : '');
                                rowTotal += costVal || 0;
                            } else {
                                cells.push('');
                                cells.push('');
                            }
                        }
                    } else {
                        if (rowIdx < statLevelsCounts[s]) {
                            const row = filteredRows[rowIdx] || { stats: [], costs: [] };
                            const statVal = row.stats[statIndexes[s]];
                            const costVal = row.costs[statIndexes[s]];
                            cells.push(statVal !== undefined ? statVal : '');
                            cells.push((costVal && costVal !== 0) ? num(costVal) : '');
                            rowTotal += costVal || 0;
                        } else {
                            cells.push('');
                            cells.push('');
                        }
                    }
                }
                if (showCumulative) {
                    cumulative += rowTotal;
                    cells.push(num(cumulative));
                }
                tableRowsForConsole.push(cells);
            }
        }
    } else {
        for (let rowIdx = 0; rowIdx < filteredRows.length; rowIdx++) {
            const row = filteredRows[rowIdx];
            const cells = [row.level];
            let rowTotal = 0;
            for (let s = 0; s < statIndexes.length; s++) {
                const idx = statIndexes[s];
                cells.push(row.stats[idx]);
                const costVal = row.costs[idx];
                cells.push((costVal && costVal !== 0) ? num(costVal) : '');
                rowTotal += costVal || 0;
            }
            if (showCumulative) {
                cumulative += rowTotal;
                cells.push(num(cumulative));
            }
            tableRowsForConsole.push(cells);
        }
    }
    // (REMOVED DUPLICATE/ERRONEOUS BLOCKS)
    // Summary row - completely rewritten with direct column mapping approach
    // Use the same summary row for the console output
    tableRowsForConsole.push(summaryCells);
    // Calculate column widths for console output
    let colWidthsConsole = columns.map((col, i) => {
        let max = String(col).length;
        for (let r = 1; r < tableRowsForConsole.length; r++) {
            const val = tableRowsForConsole[r][i] !== undefined ? String(tableRowsForConsole[r][i]) : '';
            if (val.length > max) max = val.length;
        }
        return max;
    });
    // Print table to console
    let border = '+' + colWidthsConsole.map(w => '-'.repeat(w + 2)).join('+') + '+';
    console.log('\n[DEBUG] UW CHART (text table):');
    console.log(border);
    for (let r = 0; r < tableRowsForConsole.length; r++) {
        let row = tableRowsForConsole[r];
        let line = '|';
        for (let c = 0; c < columns.length; c++) {
            let align = (r === 0) ? 'center' : (c === 0 ? 'right' : 'center');
            line += ' ' + pad(row[c] !== undefined ? row[c] : '', colWidthsConsole[c], align) + ' |';
        }
        console.log(line);
        if (r === 0 || r === tableRowsForConsole.length - 2) console.log(border);
    }
    console.log(border);
    return canvas.toBuffer();
}


// --- UW Stat Level Pagination ---
const STAT_LEVEL_PAGE_SIZE = 25;

function getStatLevelsPaged(uwKey, statIdx, page = 0) {
    if (!UW_DATA[uwKey] || !UW_DATA[uwKey].stats[statIdx]) return [];
    const levels = UW_DATA[uwKey].stats[statIdx].levels;
    const start = page * STAT_LEVEL_PAGE_SIZE;
    return levels.slice(start, start + STAT_LEVEL_PAGE_SIZE);
}

// Helper: format number
function num(val) {
    return typeof val === 'number' && !isNaN(val) ? val.toLocaleString() : '';
}

function getUWList() {
    return Object.entries(UW_DATA).map(([key, uw]) => ({ label: uw.name, value: key }));
}

function getStatList(uwKey) {
    if (!UW_DATA[uwKey]) return [];
    return UW_DATA[uwKey].stats.map((stat, idx) => ({ label: stat.name, value: idx.toString() }));
}

function getStatLevels(uwKey, statIdx) {
    if (!UW_DATA[uwKey] || !UW_DATA[uwKey].stats[statIdx]) return [];
    return UW_DATA[uwKey].stats[statIdx].levels;
}

function buildEmbed(state) {
    const embed = new EmbedBuilder()
        .setTitle('Ultimate Weapon Stone Cost Calculator')
        .setDescription('Select an Ultimate Weapon and its stats to calculate stone costs.')
        .setColor(0x4CAF50);
    if (!state.uwKey) {
        // Show the unlock cost chart as an image instead of a code block table
        embed.setImage('attachment://uw_unlock_chart.png');
        return embed;
    }

    embed.setDescription(`Selected: **${UW_DATA[state.uwKey].name}**`);
    // Only show info for the selected stat if a stat filter is active, else show all
    const uw = UW_DATA[state.uwKey];
    let statFields = [];
    let statIndexesToShow = [];
    if (state.statFilter && state.statFilter !== 'all') {
        const idx = parseInt(state.statFilter);
        if (!isNaN(idx) && uw.stats[idx]) {
            statIndexesToShow = [idx];
        } else {
            statIndexesToShow = uw.stats.map((_, i) => i);
        }
    } else {
        statIndexesToShow = uw.stats.map((_, i) => i);
    }
    for (const idx of statIndexesToShow) {
        const stat = uw.stats[idx];
        const entered = state.statsEntered[idx];
        const target = state.targetLevels ? state.targetLevels[idx] : undefined;
        let cost = '';
        // Find the stat value for entered and target levels
        let enteredVal = '-';
        let targetVal = '-';
        if (typeof entered === 'number') {
            const statData = stat.levels.find(lvl => lvl.level === entered);
            if (statData && statData.value !== undefined) {
                enteredVal = `${entered} (${statData.value})`;
            } else {
                enteredVal = String(entered);
            }
        }
        if (typeof target === 'number') {
            const statData = stat.levels.find(lvl => lvl.level === target);
            if (statData && statData.value !== undefined) {
                targetVal = `${target} (${statData.value})`;
            } else {
                targetVal = String(target);
            }
        }
        // Always show cumulative cost from 0 to max if no user input, or from entered+1 to target if set
        if (
            state.chart &&
            Array.isArray(state.chart.rows)
        ) {
            let from = 0;
            let to = Math.max(...stat.levels.map(lvl => lvl.level));
            if (typeof entered === 'number' && typeof target === 'number' && target >= entered) {
                from = entered + 1;
                to = target;
            }
            let total = 0;
            for (const row of state.chart.rows) {
                if (row.level >= from && row.level <= to) {
                    total += row.costs[idx] || 0;
                }
            }
            cost = num(total);
        }
        statFields.push(
            { name: `${stat.name}`, value: entered !== undefined ? enteredVal : '-', inline: true },
            { name: 'Target Lvl', value: target !== undefined ? targetVal : '-', inline: true },
            { name: 'Stone Cost', value: cost || '-', inline: true }
        );
    }
    if (statFields.length > 0) {
        embed.addFields(statFields);
    }

    // Calculate current spent stones (from min up to entered for each stat)
    let currentTotal = 0;
    let maxTotal = 0;
    if (state.chart && Array.isArray(state.chart.rows)) {
        for (let idx = 0; idx < uw.stats.length; idx++) {
            const entered = state.statsEntered[idx];
            const target = state.targetLevels ? state.targetLevels[idx] : undefined;
            const minLevel = Math.min(...uw.stats[idx].levels.map(lvl => lvl.level));
            // Current: sum from min up to entered (inclusive)
            if (
                typeof entered === 'number' &&
                typeof target === 'number' &&
                entered > 0 &&
                target > 0 &&
                entered >= minLevel
            ) {
                let statSpent = 0;
                for (const row of state.chart.rows) {
                    if (row.level >= minLevel && row.level <= entered) {
                        statSpent += row.costs[idx] || 0;
                    }
                }
                currentTotal += statSpent;
            }
            // Max: sum from min up to target (inclusive)
            let statMax = 0;
            if (
                typeof target === 'number' &&
                target > 0
            ) {
                for (const row of state.chart.rows) {
                    if (row.level >= minLevel && row.level <= target) {
                        statMax += row.costs[idx] || 0;
                    }
                }
            }
            maxTotal += statMax;
        }
    }

    // Show as X / total if not all stats entered, else just total
    if (state.chart && uw.stats.length > 0) {
        let totalString = '';
        // Stat filter logic: if a stat filter is active, only show total for that stat
        let statFilterIdx = null;
        if (state.statFilter && state.statFilter !== 'all') {
            const idx = parseInt(state.statFilter);
            if (!isNaN(idx)) statFilterIdx = idx;
        }
        if (statFilterIdx !== null) {
            // Only show the filtered stat's total, always as investment / total
            let filteredCurrent = 0;
            let filteredMax = 0;
            const entered = state.statsEntered[statFilterIdx];
            const target = state.targetLevels ? state.targetLevels[statFilterIdx] : undefined;
            const minLevel = Math.min(...uw.stats[statFilterIdx].levels.map(lvl => lvl.level));
            // Current: sum from min up to entered (inclusive)
            if (
                typeof entered === 'number' &&
                typeof target === 'number' &&
                entered > 0 &&
                target > 0 &&
                entered >= minLevel
            ) {
                for (const row of state.chart.rows) {
                    if (row.level >= minLevel && row.level <= entered) {
                        filteredCurrent += row.costs[statFilterIdx] || 0;
                    }
                }
            }
            // Max: sum from min up to target (inclusive)
            if (
                typeof target === 'number' &&
                target > 0
            ) {
                for (const row of state.chart.rows) {
                    if (row.level >= minLevel && row.level <= target) {
                        filteredMax += row.costs[statFilterIdx] || 0;
                    }
                }
            }
            totalString = `${num(filteredCurrent)} / ${num(filteredMax)}`;
        } else {
            // All stats, always as investment / total
            totalString = `${num(currentTotal)} / ${num(maxTotal)}`;
        }
        embed.addFields({ name: 'Total Stones', value: totalString, inline: false });
        if (state.step === uw.stats.length && state.chart.rows && state.chart.rows.length > 0) {
            embed.setImage('attachment://uw_chart.png');
        }
    }
    return embed;
}

// Generates a visually appealing chart image for UW/UW+ unlock costs
async function generateUnlockCostChartImage() {
    const uwRows = [
        { uw: 0, cost: 0, uwp: 0, costp: 0 },
        { uw: 1, cost: 5, uwp: 1, costp: 500 },
        { uw: 2, cost: 50, uwp: 2, costp: 625 },
        { uw: 3, cost: 150, uwp: 3, costp: 750 },
        { uw: 4, cost: 300, uwp: 4, costp: 975 },
        { uw: 5, cost: 800, uwp: 5, costp: 1250 },
        { uw: 6, cost: 1250, uwp: 6, costp: 1650 },
        { uw: 7, cost: 1750, uwp: 7, costp: 2200 },
        { uw: 8, cost: 2400, uwp: 8, costp: 2900 },
        { uw: 9, cost: 3000, uwp: 9, costp: 3800 },
    ];
    // --- Match the style of the main stone cost chart generator exactly ---
    // Dynamic column widths based on text
    const headers = ['UW', 'Cost', 'UW+', 'Cost+'];
    const rows = uwRows.map(row => [row.uw, row.cost, row.uwp, row.costp]);
    const ctxMeasure = createCanvas(1, 1).getContext('2d');
    ctxMeasure.font = 'bold 16px Arial';
    function getColWidth(idx) {
        let max = ctxMeasure.measureText(headers[idx]).width;
        for (const row of rows) {
            const val = row[idx].toLocaleString();
            max = Math.max(max, ctxMeasure.measureText(val).width);
        }
        return Math.ceil(max) + 18;
    }
    const colWidths = headers.map((_, idx) => getColWidth(idx));
    const tableWidth = colWidths.reduce((a, b) => a + b, 0);
    const margin = 18;
    const rowHeight = 28;
    const headerHeight = 28;
    const titleHeight = 40;
    const width = tableWidth + margin * 2;
    const height = titleHeight + headerHeight + rowHeight * uwRows.length + margin;
    const bgColor = '#181a20';
    const tableBg = '#23272f';
    const tableAlt = '#181a20';
    const borderColor = '#333';
    const outerBorderColor = '#b6fcd5';
    const textColor = '#e6e6e6';
    const headerColor = '#b6fcd5';
    const headerBg = '#1e3a2a';
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    // Background
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, width, height);
    // Title
    ctx.font = 'bold 22px Arial';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText('Unlock Costs', width / 2, 30);
    // Table header
    let x = margin;
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    for (let i = 0; i < headers.length; i++) {
        ctx.fillStyle = headerBg;
        ctx.fillRect(x, titleHeight, colWidths[i], headerHeight);
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 1;
        ctx.strokeRect(x, titleHeight, colWidths[i], headerHeight);
        ctx.fillStyle = headerColor;
        ctx.fillText(headers[i], x + colWidths[i] / 2, titleHeight + headerHeight / 2 + 6);
        x += colWidths[i];
    }
    // Table rows
    ctx.font = '15px Arial';
    for (let r = 0; r < uwRows.length; r++) {
        let y = titleHeight + headerHeight + r * rowHeight;
        ctx.fillStyle = r % 2 === 0 ? tableBg : tableAlt;
        ctx.fillRect(margin, y, tableWidth, rowHeight);
        x = margin;
        for (let c = 0; c < headers.length; c++) {
            ctx.strokeStyle = borderColor;
            ctx.lineWidth = 1;
            ctx.strokeRect(x, y, colWidths[c], rowHeight);
            ctx.fillStyle = textColor;
            ctx.textAlign = 'center';
            ctx.fillText(rows[r][c].toLocaleString(), x + colWidths[c] / 2, y + 19);
            x += colWidths[c];
        }
    }
    // Outer border
    ctx.strokeStyle = outerBorderColor;
    ctx.lineWidth = 2;
    ctx.strokeRect(margin, titleHeight, tableWidth, headerHeight + rowHeight * uwRows.length);
    return canvas.toBuffer();
}

function calculateUWChart(uwKey, statsEntered, targetLevels) {
    // statsEntered: [level1, level2, ...] for each stat
    // targetLevels: { statIdx: targetLevel }
    const uw = UW_DATA[uwKey];
    if (!uw) return null;
    let totalStones = 0;
    let chartRows = [];
    // For each stat, determine the max level (custom or default)
    const statMaxLevels = uw.stats.map((stat, idx) => {
        const custom = targetLevels && targetLevels[idx];
        if (custom !== undefined && custom !== null && !isNaN(custom) && Number.isInteger(custom) && custom >= 0) {
            return custom;
        }
        // Use the highest level in the stat's levels array
        return Math.max(...stat.levels.map(lvl => lvl.level));
    });
    // For each stat, use the user-entered value or 0 if available, else min
    const statMinLevels = uw.stats.map((stat, idx) => {
        const entered = statsEntered && statsEntered[idx];
        // If level 0 exists, default to 0, else min in array
        const hasZero = stat.levels.some(lvl => lvl.level === 0);
        if (entered !== undefined && entered !== null && !isNaN(entered) && Number.isInteger(entered) && entered >= 0) {
            return entered;
        }
        return hasZero ? 0 : Math.min(...stat.levels.map(lvl => lvl.level));
    });
    // Chart always starts at 0 if any stat has level 0, else min of all stats
    const hasAnyZero = uw.stats.some(stat => stat.levels.some(lvl => lvl.level === 0));
    const chartMinLevel = hasAnyZero ? 0 : Math.min(...statMinLevels);
    const chartMaxLevel = Math.max(...statMaxLevels);
    // DEBUG: Log min/max levels
    console.log('DEBUG chartMinLevel:', chartMinLevel, 'chartMaxLevel:', chartMaxLevel);
    for (let lvl = chartMinLevel; lvl <= chartMaxLevel; lvl++) {
        let row = { level: lvl, stats: [], costs: [], totalCost: 0 };
        for (let s = 0; s < uw.stats.length; s++) {
            // Only include stat value/cost if within the stat's max level
            if (lvl <= statMaxLevels[s]) {
                let statData = uw.stats[s].levels.find(l => l.level === lvl);
                row.stats.push(statData ? statData.value : '');
                // For level 0, always show cost as 0 (not blank)
                let cost = 0;
                if (statData && lvl === 0) {
                    cost = 0;
                } else if (statData) {
                    cost = statData.cost;
                }
                row.costs.push(cost);
                row.totalCost += cost;
            } else {
                row.stats.push('');
                row.costs.push(0);
            }
        }
        // Only add to totalStones if this is above the entered level for all stats
        // (But always include all rows in chartRows for display)
        chartRows.push(row);
    }
    // Adjust totalStones: only sum costs for levels strictly above the entered level for each stat
    // (for the overall total, sum all costs for each stat from entered+1 up to target)
    totalStones = 0;
    for (let s = 0; s < uw.stats.length; s++) {
        const entered = statsEntered && statsEntered[s];
        const minLevel = (entered !== undefined && entered !== null && !isNaN(entered) && Number.isInteger(entered) && entered >= 0)
            ? entered
            : (uw.stats[s].levels.some(lvl => lvl.level === 0) ? 0 : Math.min(...uw.stats[s].levels.map(lvl => lvl.level)));
        const maxLevel = statMaxLevels[s];
        for (let lvl = minLevel + 1; lvl <= maxLevel; lvl++) {
            let statData = uw.stats[s].levels.find(l => l.level === lvl);
            // For level 0, always treat cost as 0
            let cost = 0;
            if (statData && lvl === 0) {
                cost = 0;
            } else if (statData) {
                cost = statData.cost;
            }
            if (cost) {
                totalStones += cost;
            }
        }
    }
    return { rows: chartRows, totalStones };
}

module.exports = {
    category: 'utility',
    data: new SlashCommandBuilder()
        .setName('test_stone')
        .setDescription('Ultimate Weapon Stone Cost Calculator'),
    async execute(interaction) {
        // Load user state (adapted for new DB format)
        let allUWLevels = await getUserUWSettings(interaction.user.id) || {};
        let userState = {};
        userState.uwKey = null;
        userState.statsEntered = [];
        userState.targetLevels = {};
        userState.statLevelPage = {};
        userState.step = 0;
        userState.chart = null;

        // Helper to prefill statsEntered and targetLevels from DB for a given UW
        // Now expects statLevels[stat.name] = { value, userSet }
        function prefillUserUWLevels(uwKey) {
            if (!uwKey || !UW_DATA[uwKey]) return;
            const statLevels = allUWLevels[uwKey] || {};
            UW_DATA[uwKey].stats.forEach((stat, idx) => {
                const dbEntry = statLevels[stat.name];
                if (dbEntry && typeof dbEntry.value === 'number' && dbEntry.userSet) {
                    userState.statsEntered[idx] = dbEntry.value;
                } else {
                    userState.statsEntered[idx] = Math.min(...stat.levels.map(lvl => lvl.level));
                }
                // Prefill target level from DB if available, else max
                if (typeof userState.targetLevels[idx] !== 'number') {
                    userState.targetLevels[idx] = Math.max(...stat.levels.map(lvl => lvl.level));
                }
            });
        }

        // When a UW is selected, default targetLevels to max and statsEntered to min for each stat
        function ensureTargetLevelsAndStatsEntered(uwKey, targetLevelsObj, statsEnteredArr) {
            if (!uwKey || !UW_DATA[uwKey]) return;
            UW_DATA[uwKey].stats.forEach((stat, idx) => {
                // Target levels default to max
                if (!(typeof targetLevelsObj[idx] === 'number' && isFinite(targetLevelsObj[idx]) && Number.isInteger(targetLevelsObj[idx]) && targetLevelsObj[idx] > 0)) {
                    targetLevelsObj[idx] = Math.max(...stat.levels.map(lvl => lvl.level));
                }
                // Base stat levels default to min
                if (!(typeof statsEnteredArr[idx] === 'number' && isFinite(statsEnteredArr[idx]) && Number.isInteger(statsEnteredArr[idx]) && statsEnteredArr[idx] > 0)) {
                    statsEnteredArr[idx] = Math.min(...stat.levels.map(lvl => lvl.level));
                }
            });
        }

        // Helper to update reply
        async function updateReply(i, state, files = []) {

            let components = [];
            // Row 1: UW selector dropdown
            const uwOptions = getUWList();
            const uwMenu = new StringSelectMenuBuilder()
                .setCustomId('uw_select')
                .setPlaceholder(state.uwKey ? UW_DATA[state.uwKey].name : 'Select Ultimate Weapon')
                .addOptions(uwOptions.map(opt => ({ ...opt, default: opt.value === state.uwKey })));
            components.push(new ActionRowBuilder().addComponents(uwMenu));

            // Row 2: Stat selector (stat filter) dropdown if UW is selected
            if (state.uwKey && state.chart) {
                let statFilterIdx = null;
                if (state.statFilter && state.statFilter !== 'all') {
                    const idx = parseInt(state.statFilter);
                    if (!isNaN(idx)) statFilterIdx = idx;
                }
                const statOptions = [
                    { label: 'All Stats', value: 'all', default: statFilterIdx === null },
                    ...UW_DATA[state.uwKey].stats.map((stat, idx) => ({
                        label: stat.name,
                        value: idx.toString(),
                        default: statFilterIdx === idx
                    }))
                ];
                let placeholder = 'Filter by stat (or show all)';
                if (statFilterIdx !== null) {
                    placeholder = UW_DATA[state.uwKey].stats[statFilterIdx].name;
                } else {
                    placeholder = 'All Stats';
                }
                const filterMenu = new StringSelectMenuBuilder()
                    .setCustomId('uw_stat_filter')
                    .setPlaceholder(placeholder)
                    .addOptions(statOptions);
                components.push(new ActionRowBuilder().addComponents(filterMenu));
            }

            // Row 3: Set Starting Levels | Set Target Levels buttons (if UW is selected)
            if (state.uwKey) {
                const buttonRow = new ActionRowBuilder();
                buttonRow.addComponents(
                    new ButtonBuilder()
                        .setCustomId('uw_starting_levels')
                        .setLabel('Set Starting Levels')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('uw_target_levels')
                        .setLabel('Set Target Levels')
                        .setStyle(ButtonStyle.Success)
                );
                components.push(buttonRow);
            }

            // Row 4: Close button
            const closeRow = new ActionRowBuilder();
            closeRow.addComponents(new ButtonBuilder().setCustomId('uw_close').setLabel('Close').setStyle(ButtonStyle.Danger));
            components.push(closeRow);

            // Reply
            if (i.replied || i.deferred) {
                await i.editReply({
                    embeds: [buildEmbed(state)],
                    components,
                    files,
                    ephemeral: true
                });
            } else {
                await i.update({
                    embeds: [buildEmbed(state)],
                    components,
                    files,
                    ephemeral: true
                });
            }
        }

        // Initial reply
        // If no UW selected, attach unlock cost chart image and use updateReply for consistency
        let initialFiles = [];
        if (!userState.uwKey) {
            const unlockChartBuffer = await generateUnlockCostChartImage();
            if (unlockChartBuffer) {
                initialFiles.push(new AttachmentBuilder(unlockChartBuffer, { name: 'uw_unlock_chart.png' }));
            }
        }
        // Use updateReply to ensure consistent handling of embeds, components, and files
        // Create a fake interaction object with replied = false, deferred = false for initial call
        const fakeInitialInteraction = {
            replied: false,
            deferred: false,
            update: async (opts) => interaction.reply(opts),
            editReply: async (opts) => interaction.editReply(opts)
        };
        await updateReply(fakeInitialInteraction, userState, initialFiles);

        const msg = await interaction.fetchReply();
        const collector = msg.createMessageComponentCollector({ time: 15 * 60 * 1000 });

        collector.on('collect', async i => {
            if (i.user.id !== interaction.user.id) {
                await i.reply({ content: 'This is not your calculator session.', ephemeral: true });
                return;
            }
            let handled = false;
            try {
                if (i.customId === 'uw_close') {
                    await i.update({ content: 'Closed.', embeds: [], components: [], files: [] });
                    collector.stop();
                    handled = true;
                } else if (i.customId === 'uw_select') {
                    userState.uwKey = i.values[0];
                    userState.statsEntered = [];
                    userState.targetLevels = {};
                    // Prefill from DB for this UW
                    prefillUserUWLevels(userState.uwKey);
                    ensureTargetLevelsAndStatsEntered(userState.uwKey, userState.targetLevels, userState.statsEntered);
                    // Save as { statName: { value, userSet } }
                    let saveLevels = {};
                    const statLevels = allUWLevels[userState.uwKey] || {};
                    UW_DATA[userState.uwKey].stats.forEach((stat, idx) => {
                        const dbEntry = statLevels[stat.name];
                        saveLevels[stat.name] = dbEntry && typeof dbEntry.value === 'number' && dbEntry.userSet
                            ? { value: dbEntry.value, userSet: true }
                            : { value: userState.statsEntered[idx], userSet: false };
                    });
                    await saveUserUWSettings(i.user.id, userState.uwKey, saveLevels);
                    allUWLevels = await getUserUWSettings(interaction.user.id) || {};
                    // Always show chart immediately after selecting UW
                    userState.chart = calculateUWChart(userState.uwKey, userState.statsEntered, userState.targetLevels);
                    // Generate chart image
                    let chartFiles = [];
                    if (userState.chart && userState.chart.rows && userState.chart.rows.length > 0) {
                        let chartBuffer = await generateUWChartImage(userState.uwKey, userState.chart);
                        if (chartBuffer) {
                            chartFiles = [new AttachmentBuilder(chartBuffer, { name: 'uw_chart.png' })];
                        }
                    }
                    await updateReply(i, userState, chartFiles);
                    handled = true;
                } else if (i.customId === 'uw_starting_levels') {
                    // Show modal for starting levels
                    const uw = UW_DATA[userState.uwKey];
                    if (!uw) return;
                    const modal = new ModalBuilder()
                        .setCustomId('uw_starting_levels_modal')
                        .setTitle('Set Starting Levels');
                    for (let s = 0; s < uw.stats.length; s++) {
                        const stat = uw.stats[s];
                        const minLevel = Math.min(...stat.levels.map(lvl => lvl.level));
                        const current = userState.statsEntered[s] !== undefined ? userState.statsEntered[s] : minLevel;
                        modal.addComponents(
                            new ActionRowBuilder().addComponents(
                                new TextInputBuilder()
                                    .setCustomId(`start_${s}`)
                                    .setLabel(`${stat.name} Starting Level`)
                                    .setStyle(TextInputStyle.Short)
                                    .setRequired(true)
                                    .setValue(String(current))
                            )
                        );
                    }
                    await i.showModal(modal);
                    handled = true;
                } else if (i.customId === 'uw_target_levels') {
                    // Show modal for target levels
                    const uw = UW_DATA[userState.uwKey];
                    if (!uw) return;
                    const modal = new ModalBuilder()
                        .setCustomId('uw_target_levels_modal')
                        .setTitle('Set Target Levels');
                    for (let s = 0; s < uw.stats.length; s++) {
                        const stat = uw.stats[s];
                        const maxLevel = Math.max(...stat.levels.map(lvl => lvl.level));
                        const current = userState.targetLevels[s] !== undefined ? userState.targetLevels[s] : maxLevel;
                        modal.addComponents(
                            new ActionRowBuilder().addComponents(
                                new TextInputBuilder()
                                    .setCustomId(`target_${s}`)
                                    .setLabel(`${stat.name} Target Level`)
                                    .setStyle(TextInputStyle.Short)
                                    .setRequired(true)
                                    .setValue(String(current))
                            )
                        );
                    }
                    await i.showModal(modal);
                    handled = true;
                } else if (i.customId === 'uw_settings') {
                    // (Settings button/modal removed)
                    // No longer handled
                } else if (i.customId === 'uw_stat_filter') {
                    // Handle stat filter dropdown (just update chart, do not show modal)
                    const filterValue = i.values[0];
                    userState.statFilter = filterValue;
                    let chartFiles = [];
                    let statFilterIdx = null;
                    if (filterValue !== 'all') {
                        const statIdx = parseInt(filterValue);
                        if (!isNaN(statIdx)) statFilterIdx = statIdx;
                    }
                    if (userState.chart && userState.chart.rows && userState.chart.rows.length > 0) {
                        let chartBuffer;
                        if (statFilterIdx !== null) {
                            chartBuffer = await generateUWChartImage(
                                userState.uwKey,
                                userState.chart,
                                statFilterIdx,
                                userState.statsEntered,
                                userState.targetLevels
                            );
                        } else {
                            chartBuffer = await generateUWChartImage(userState.uwKey, userState.chart);
                        }
                        if (chartBuffer) {
                            chartFiles = [new AttachmentBuilder(chartBuffer, { name: 'uw_chart.png' })];
                        }
                    }
                    await updateReply(i, userState, chartFiles);
                    handled = true;
                }
            } catch (err) {
                console.error('Error in UW interaction handler:', err);
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

            // Handle starting levels modal
            if (modalInt.customId === 'uw_starting_levels_modal') {
                const uw = UW_DATA[userState.uwKey];
                for (let s = 0; s < uw.stats.length; s++) {
                    let parsed = parseInt(modalInt.fields.getTextInputValue(`start_${s}`));
                    userState.statsEntered[s] = (typeof parsed === 'number' && isFinite(parsed) && Number.isInteger(parsed) && parsed >= 0)
                        ? parsed
                        : Math.min(...uw.stats[s].levels.map(lvl => lvl.level));
                }
                userState.chart = calculateUWChart(userState.uwKey, userState.statsEntered, userState.targetLevels);
                // Save stat levels for this UW (persist immediately, always set userSet true for starting levels)
                let saveLevels = {};
                if (UW_DATA[userState.uwKey]) {
                    UW_DATA[userState.uwKey].stats.forEach((stat, idx) => {
                        if (userState.statsEntered[idx] !== undefined) {
                            saveLevels[stat.name] = { value: userState.statsEntered[idx], userSet: true };
                        }
                    });
                }
                await saveUserUWSettings(modalInt.user.id, userState.uwKey, saveLevels);
                allUWLevels = await getUserUWSettings(interaction.user.id) || {};
                await modalInt.deferUpdate();
                let chartFiles = [];
                if (userState.chart && userState.chart.rows && userState.chart.rows.length > 0) {
                    let chartBuffer;
                    let statFilterIdx = null;
                    if (userState.statFilter && userState.statFilter !== 'all') {
                        const idx = parseInt(userState.statFilter);
                        if (!isNaN(idx)) statFilterIdx = idx;
                    }
                    if (statFilterIdx !== null) {
                        chartBuffer = await generateUWChartImage(
                            userState.uwKey,
                            userState.chart,
                            statFilterIdx,
                            userState.statsEntered,
                            userState.targetLevels
                        );
                    } else {
                        chartBuffer = await generateUWChartImage(userState.uwKey, userState.chart);
                    }
                    if (chartBuffer) {
                        chartFiles = [new AttachmentBuilder(chartBuffer, { name: 'uw_chart.png' })];
                    }
                }
                await updateReply(interaction, userState, chartFiles);
                return;
            }

            // Handle target levels modal
            if (modalInt.customId === 'uw_target_levels_modal') {
                const uw = UW_DATA[userState.uwKey];
                for (let s = 0; s < uw.stats.length; s++) {
                    let parsed = parseInt(modalInt.fields.getTextInputValue(`target_${s}`));
                    userState.targetLevels[s] = (typeof parsed === 'number' && isFinite(parsed) && Number.isInteger(parsed) && parsed > 0)
                        ? parsed
                        : Math.max(...uw.stats[s].levels.map(lvl => lvl.level));
                }
                userState.chart = calculateUWChart(userState.uwKey, userState.statsEntered, userState.targetLevels);
                // Save stat levels for this UW (persist immediately, preserve userSet for starting, but always save target)
                let saveLevels = {};
                if (UW_DATA[userState.uwKey]) {
                    UW_DATA[userState.uwKey].stats.forEach((stat, idx) => {
                        // Always save the current starting level and userSet for each stat
                        let userSet = false;
                        if (allUWLevels[userState.uwKey] && allUWLevels[userState.uwKey][stat.name] && allUWLevels[userState.uwKey][stat.name].userSet) {
                            userSet = true;
                        }
                        saveLevels[stat.name] = { value: userState.statsEntered[idx], userSet };
                    });
                }
                // Also save the target levels in a separate DB key if needed (optional, not shown here)
                await saveUserUWSettings(modalInt.user.id, userState.uwKey, saveLevels);
                allUWLevels = await getUserUWSettings(interaction.user.id) || {};
                await modalInt.deferUpdate();
                let chartFiles = [];
                if (userState.chart && userState.chart.rows && userState.chart.rows.length > 0) {
                    let chartBuffer;
                    let statFilterIdx = null;
                    if (userState.statFilter && userState.statFilter !== 'all') {
                        const idx = parseInt(userState.statFilter);
                        if (!isNaN(idx)) statFilterIdx = idx;
                    }
                    if (statFilterIdx !== null) {
                        chartBuffer = await generateUWChartImage(
                            userState.uwKey,
                            userState.chart,
                            statFilterIdx,
                            userState.statsEntered,
                            userState.targetLevels
                        );
                    } else {
                        chartBuffer = await generateUWChartImage(userState.uwKey, userState.chart);
                    }
                    if (chartBuffer) {
                        chartFiles = [new AttachmentBuilder(chartBuffer, { name: 'uw_chart.png' })];
                    }
                }
                await updateReply(interaction, userState, chartFiles);
                return;
            }

            // Handle legacy/settings modal (cap levels)
            // (Settings modal removed)
        });
    }
};
