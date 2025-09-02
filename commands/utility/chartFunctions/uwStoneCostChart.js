// Ultimate Weapon Stone Cost Chart Generator (bespoke for all-stats view)
// This is a standalone chart generator for the UW stone cost chart, for use in chartFunctions index.

const { createCanvas } = require('canvas');
const UW_DATA = require('../upgradesData/uwData.js');
const style = require('./style');

// Helper: format number
function num(val) {
    return typeof val === 'number' && !isNaN(val) ? val.toLocaleString() : '';
}

// Main chart generator: always shows all stats for a given UW key
async function generateUWStoneCostChart(uwKey) {
    const uw = UW_DATA[uwKey];
    if (!uw) throw new Error('Invalid UW key');
    const statsToShow = uw.stats;
    const statIndexes = uw.stats.map((_, idx) => idx);
    // Find the last level for each stat that has a valid cost
    const lastValidLevelForStat = statsToShow.map(stat => {
        let max = 0;
        for (const lvl of stat.levels) {
            if (typeof lvl.cost === 'number' && lvl.cost !== 0) {
                if (lvl.level > max) max = lvl.level;
            }
        }
        // If all costs are zero, fallback to highest level present
        if (max === 0 && stat.levels.length > 0) {
            max = Math.max(...stat.levels.map(l => l.level));
        }
        return max;
    });
    // Build chart data (all levels for all stats)
    const maxLevels = Math.max(...statsToShow.map(s => s.levels.length ? Math.max(...s.levels.map(l => l.level)) : 0));
    const chartRows = [];
    for (let lvl = 0; lvl <= maxLevels; lvl++) {
        let row = { level: lvl, stats: [], costs: [] };
        for (let s = 0; s < statsToShow.length; s++) {
            const stat = statsToShow[s];
            const statData = stat.levels.find(l => l.level === lvl);
            row.stats.push(statData ? statData.value : '');
            // For level 0, always show cost as 0 (not blank)
            if (statData && lvl === 0) {
                row.costs.push(0);
            } else if (statData && lvl <= lastValidLevelForStat[s]) {
                row.costs.push(statData.cost);
            } else {
                row.costs.push('');
            }
        }
        chartRows.push(row);
    }
    // --- Column split logic: if any stat has >2x the levels of the next, split it ---
    const statLevelsCounts = statsToShow.map(s => s.levels.length);
    let splitStatIdx = null;
    if (statLevelsCounts.length > 1) {
        const maxCount = Math.max(...statLevelsCounts);
        const secondMax = Math.max(...statLevelsCounts.filter(v => v !== maxCount));
        if (maxCount > 2 * secondMax) {
            splitStatIdx = statLevelsCounts.indexOf(maxCount);
        }
    }
    // --- Table columns ---
    let columns = ['Level'];
    statsToShow.forEach(s => {
        columns.push(s.name);
        columns.push('Cost');
    });
    // --- Canvas sizing ---
    const rowHeight = style.baseRowHeight - 4; // Slightly tighter for this chart
    const ctxMeasure = createCanvas(1, 1).getContext('2d');
    ctxMeasure.font = style.headerCellFont;
    function getMaxColWidth(colIdx) {
        let max = ctxMeasure.measureText(columns[colIdx]).width;
        for (let rowIdx = 0; rowIdx < chartRows.length; rowIdx++) {
            let val = '';
            if (colIdx === 0) val = chartRows[rowIdx].level;
            else {
                const statIdx = Math.floor((colIdx - 1) / 2);
                if ((colIdx - 1) % 2 === 0) val = chartRows[rowIdx].stats[statIdx];
                else val = num(chartRows[rowIdx].costs[statIdx]);
            }
            max = Math.max(max, ctxMeasure.measureText(String(val)).width);
        }
        return Math.ceil(max) + style.cellPadding;
    }
    const colWidths = columns.map((_, idx) => getMaxColWidth(idx));
    const width = colWidths.reduce((a, b) => a + b, 0) + 1;
    const titleHeight = 40;
    const tableRows = chartRows.length + 2; // header + data + summary
    const height = tableRows * rowHeight + titleHeight;
    // --- Draw ---
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = style.oddRowBg;
    ctx.fillRect(0, 0, width, height);
    // Title
    ctx.font = 'bold 22px Arial';
    ctx.fillStyle = style.headerText;
    ctx.textAlign = 'center';
    ctx.fillText(`${uw.name}`, width / 2, 30);
    // Table header
    let x = 0;
    ctx.font = style.headerCellFont;
    ctx.textAlign = 'center';
    for (let i = 0; i < columns.length; i++) {
        ctx.fillStyle = style.headerBg;
        ctx.fillRect(x, titleHeight, colWidths[i], rowHeight);
        ctx.strokeStyle = style.borderColor;
        ctx.lineWidth = 1;
        ctx.strokeRect(x, titleHeight, colWidths[i], rowHeight);
        ctx.fillStyle = style.headerText;
        ctx.fillText(columns[i], x + colWidths[i] / 2, titleHeight + rowHeight / 2 + 2);
        x += colWidths[i];
    }
    // Data rows
    ctx.font = style.cellFont;
    for (let rowIdx = 0; rowIdx < chartRows.length; rowIdx++) {
        let x = 0;
        const y = titleHeight + rowHeight * (rowIdx + 1);
        ctx.fillStyle = rowIdx % 2 === 0 ? style.evenRowBg : style.oddRowBg;
        ctx.fillRect(0, y, width, rowHeight);
        const row = chartRows[rowIdx];
        const cells = [row.level];
        for (let s = 0; s < statIndexes.length; s++) {
            cells.push(row.stats[s]);
            cells.push(num(row.costs[s]));
        }
        for (let i = 0; i < columns.length; i++) {
            ctx.strokeStyle = style.borderColor;
            ctx.lineWidth = 1;
            ctx.strokeRect(x, y, colWidths[i], rowHeight);
            ctx.fillStyle = style.textColor;
            ctx.textAlign = 'center';
            ctx.fillText(String(cells[i]), x + colWidths[i] / 2, y + 19);
            x += colWidths[i];
        }
    }
    // Summary row (cumulative totals for each cost column, label 'Cumulative')
    let summaryY = titleHeight + rowHeight * (chartRows.length + 1);
    ctx.fillStyle = '#234d2c'; // Custom summary row color, can be added to style.js if needed
    ctx.fillRect(0, summaryY, width, rowHeight);
    ctx.font = style.headerCellFont;
    ctx.strokeStyle = style.borderColor;
    ctx.lineWidth = 1;
    x = 0;
    ctx.fillStyle = style.headerText;
    ctx.textAlign = 'center';
    ctx.fillText('Total', colWidths[0] / 2, summaryY + 19);
    let colIdx = 1;
    for (let s = 0; s < statsToShow.length; s++) {
        // Max stat value
        const stat = statsToShow[s];
        const maxLevel = Math.max(...stat.levels.map(lvl => typeof lvl.level === 'number' ? lvl.level : Number.NEGATIVE_INFINITY));
        const maxVal = stat.levels.find(lvl => lvl.level === maxLevel)?.value ?? '';
        // Cumulative cost for this stat (sum all costs, treat blank/undefined as 0)
        const totalCost = chartRows.reduce((sum, row) => sum + (typeof row.costs[s] === 'number' && !isNaN(row.costs[s]) ? row.costs[s] : 0), 0);
        ctx.fillText(maxVal, colWidths.slice(0, colIdx + 1).reduce((a, b) => a + b, 0) - colWidths[colIdx] / 2, summaryY + 19);
        colIdx++;
        ctx.fillText(num(totalCost), colWidths.slice(0, colIdx + 1).reduce((a, b) => a + b, 0) - colWidths[colIdx] / 2, summaryY + 19);
        colIdx++;
    }
    ctx.strokeStyle = style.headerText;
    ctx.lineWidth = 2;
    ctx.strokeRect(0, titleHeight, width, rowHeight * (chartRows.length + 2));
    return canvas.toBuffer();
}

module.exports = { generateUWStoneCostChart };
