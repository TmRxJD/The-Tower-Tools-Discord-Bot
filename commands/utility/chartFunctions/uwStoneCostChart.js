// Ultimate Weapon Stone Cost Chart Generator (bespoke for all-stats view)
// This is a standalone chart generator for the UW stone cost chart, for use in chartFunctions index.

const { createCanvas } = require('canvas');
const { uwStoneChartData: UW_DATA } = require('../../../../../packages/platform/dist/tools/uw-stone-chart-data.js');
const style = require('./style.js');
const { renderSimpleTableChart } = require('./simpleTableChartRenderer.js');

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
        // --- Table columns ---
    let columns = ['Level'];
    statsToShow.forEach(s => {
        columns.push(s.name);
        columns.push('Cost');
    });
        const tableRows = chartRows.map(row => {
            const cells = [row.level];
            for (let s = 0; s < statIndexes.length; s++) {
                cells.push(row.stats[s]);
                cells.push(num(row.costs[s]));
            }
            return cells;
        });

        const rowHeight = style.baseRowHeight - 4;

        // compute table width for border/sizing in afterRows
        const measureCtx = createCanvas(1, 1).getContext('2d');
        const colWidths = columns.map((column, colIdx) => {
            measureCtx.font = style.headerCellFont;
            let max = measureCtx.measureText(String(column || '')).width;
            measureCtx.font = style.cellFont;
            for (const row of tableRows) {
                max = Math.max(max, measureCtx.measureText(String(row[colIdx] || '')).width);
            }
            return Math.ceil(max) + style.cellPadding;
        });
        const tableWidth = colWidths.reduce((sum, width) => sum + width, 0);

        return renderSimpleTableChart({
            data: {
                title: uw.name,
                headers: columns,
                rows: tableRows,
            },
            style,
            headerRowHeight: rowHeight,
            titleYOffset: 40,
            bottomPadding: rowHeight + 4,
            afterRows: ({ ctx, y, margin, colWidths }) => {
                // Summary row (max value + cumulative cost)
                ctx.fillStyle = '#234d2c';
                ctx.fillRect(margin, y, tableWidth, rowHeight);
                ctx.font = style.headerCellFont;
                ctx.fillStyle = style.headerText;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.strokeStyle = style.borderColor;
                ctx.lineWidth = 1;

                let x = margin;
                for (let colIdx = 0; colIdx < colWidths.length; colIdx += 1) {
                    ctx.strokeRect(x, y, colWidths[colIdx], rowHeight);
                    x += colWidths[colIdx];
                }

                ctx.fillText('Total', margin + colWidths[0] / 2, y + rowHeight / 2);

                let drawX = margin + colWidths[0];
                for (let s = 0; s < statsToShow.length; s++) {
                    const stat = statsToShow[s];
                    const maxLevel = Math.max(...stat.levels.map(level => Number(level.level) || 0));
                    const maxVal = stat.levels.find(level => Number(level.level) === maxLevel)?.value ?? '';
                    const totalCost = chartRows.reduce((sum, row) => (
                        sum + (typeof row.costs[s] === 'number' && !Number.isNaN(row.costs[s]) ? row.costs[s] : 0)
                    ), 0);

                    ctx.fillText(String(maxVal), drawX + colWidths[s * 2 + 1] / 2, y + rowHeight / 2);
                    drawX += colWidths[s * 2 + 1];
                    ctx.fillText(num(totalCost), drawX + colWidths[s * 2 + 2] / 2, y + rowHeight / 2);
                    drawX += colWidths[s * 2 + 2];
                }

                ctx.strokeStyle = style.headerText;
                ctx.lineWidth = 2;
                ctx.strokeRect(margin, 40, tableWidth, rowHeight * (tableRows.length + 2));
            },
        });
}

module.exports = { generateUWStoneCostChart };
