// Gold Bot vs Death Wave Uptime Chart Generator
// Matches the style of previous charts (dark mode, robust layout, color-coded blocks)
const { createCanvas } = require('canvas');

// Color constants (use global style variables)
const style = require('./style.js');
const BG_COLOR = style.evenRowBg;
const GRID_COLOR = style.accentGrid;
const LABEL_COLOR = style.accentLabel;
const GOLD_BOT_COLOR = style.accentGold;
const DEATH_WAVE_COLOR = style.accentRed;
const WAVE_COLOR = style.accentWave;


// Chart parameters for grid (updated for correct logic)
const NUM_WAVES = 9; // number of DW waves per activation
const WAVE_LENGTH = 4; // seconds per wave
const DW_DURATION = NUM_WAVES * WAVE_LENGTH; // 36s
const LINGER_DURATION = 2; // seconds of offset between DW activations (not drawn as bar)
const BOT_DURATION = 40; // seconds
const BOT_COOLDOWN = 50; // seconds
const DW_COOLDOWN = 48; // seconds (change to 47 or 48 as needed)
const MAX_SYNC = 90; // x-axis: sync offset (seconds)
const CHART_TOP = style.chartTop;
const CHART_LEFT = style.chartLeft;
const LEGEND_HEIGHT = style.legendHeight;
const FONT = style.headerFont;

// For stacked bar: show 50s as in the reference chart
const TOTAL_TIME = 50; // 50s, y-axis is time within the activation cycle

// Only use sync offsets as in the reference image: 0, 2, 4, ..., 50, but decrement for drift direction
const SYNC_OFFSETS = [];
for (let i = 0; i <= 50; i += 2) SYNC_OFFSETS.push((50 - i + 50) % 50);

// Landscape layout: wide bars, short chart
const MIN_CELL_SIZE = style.minCellSize;
const MIN_CELL_GAP = style.minCellGap;
const MIN_CELL_HEIGHT = style.minCellHeight;
const MIN_ROW_GAP = style.minRowGap;
const MAX_CHART_WIDTH = style.maxChartWidth;
const MAX_CHART_HEIGHT = style.maxChartHeight;

// Calculate cell/bar size and gap for landscape
const numBars = 1 + Math.floor(50 / 2); // SYNC_OFFSETS.length
let CELL_SIZE = MIN_CELL_SIZE; // bar width
let CELL_GAP = MIN_CELL_GAP;
let CELL_HEIGHT = MIN_CELL_HEIGHT; // bar height (row)
let ROW_GAP = MIN_ROW_GAP;
// Remove extra right space: no +220, just a small right margin (e.g., +8)
let chartWidth = CHART_LEFT + numBars * (CELL_SIZE + CELL_GAP) + 8;
let chartHeight = CHART_TOP + (TOTAL_TIME) * (CELL_HEIGHT + ROW_GAP) + LEGEND_HEIGHT + 180;
if (chartWidth > MAX_CHART_WIDTH) {
    CELL_SIZE = Math.max(16, Math.floor((MAX_CHART_WIDTH - CHART_LEFT - 8) / numBars) - CELL_GAP);
    chartWidth = CHART_LEFT + numBars * (CELL_SIZE + CELL_GAP) + 8;
}
if (chartHeight > MAX_CHART_HEIGHT) {
    CELL_HEIGHT = Math.max(4, Math.floor((MAX_CHART_HEIGHT - CHART_TOP - LEGEND_HEIGHT - 180) / TOTAL_TIME) - ROW_GAP);
    chartHeight = CHART_TOP + (TOTAL_TIME) * (CELL_HEIGHT + ROW_GAP) + LEGEND_HEIGHT + 180;
}


// For a given sync offset, return DW overlap and linger durations relative to GB
function getDWStats(syncOffset) {
    // Gold Bot: always 0-39 (40s)
    // DW: starts at syncOffset, lasts 36s
    let overlap = 0;
    let linger = 0;
    for (let t = 0; t < DW_DURATION; t++) {
        const dwTime = syncOffset + t;
        if (dwTime < BOT_DURATION) {
            overlap++;
        } else {
            linger++;
        }
    }
    return { overlap, linger };
}

async function generateGoldBotVsDeathWaveUptimeChart(options = {}) {
    // Each pair: left = GB (fixed), right = DW (offset)
    const numPairs = SYNC_OFFSETS.length;
    let cellSize = CELL_SIZE;
    let cellGap = CELL_GAP;
    let cellHeight = CELL_HEIGHT;
    let rowGap = ROW_GAP;
    // Each pair is two columns, plus one for averages
    // Make chart less tall and columns wider for better x axis spacing
    // Reduce column width by about 15% twice (total ~28%) and reduce gap for a more compact chart
    cellSize = Math.max(16, Math.floor((1800 * 0.7) / (numPairs * 2 + 1)) - 2); // much narrower bars
    cellGap = Math.max(2, Math.floor(cellGap * 0.7)); // reduce gap as well
    cellHeight = Math.max(10, Math.floor(800 / 50) - rowGap); // less tall chart
    // Layout: title, chart, x-axis labels, legend, footer
    const TITLE_HEIGHT = 70;
    const XAXIS_LABELS_HEIGHT = 32;
    const LEGEND_HEIGHT = 32;
    const FOOTER_HEIGHT = 70;
    const NEW_CHART_TOP = 10;
    // Chart area height
    const CHART_AREA_HEIGHT = 50 * (cellHeight + rowGap);
    // Calculate width: ensure equal padding on both left and right (match CHART_LEFT)
    // The last DW bar's right edge is at: CHART_LEFT + (numPairs * 2 - 1) * (cellSize + cellGap) + cellSize
    // Add CHART_LEFT as right padding for symmetry
    // Recalculate width with new cellSize and cellGap
    let width = CHART_LEFT + (numPairs * 2 - 1) * (cellSize + cellGap) + cellSize + CHART_LEFT;
    // Calculate all vertical positions before creating the canvas to ensure footer is never cut off
    const footerText = `Each column pair shows the overlap between Gold Bot (yellow) and Death Wave (red) and DW Final Wave (orange) over a 50s cooldown cycle.\n\n- Yellow bars represent the 40s duration of Gold Bot's active period.\n- Red bars show the 36s active duration of Death Wave for each sync offset.\n- Orange bars indicate the 4s of last outgoing wave: the final wave of DW that extends beyond its main duration.\n\n"Linger" is the amount of offset between the activations of DW and GB. This chart shows for 2s linger offset (48s CD) and the would be values for 3s (47s CD).\n\nHaving DW in perfect sync with GB (i.e., both activating together every 50s) maximizes the overlap, ensuring you recieve all DW coin benefits from GB's effect.\nLowering DW's cooldown below 50s causes DW to drift out of sync, reducing the percentage of time both are active together and increasing the offset period, which is\nless effective. It is more desirable to achieve a 50s GB sync using MVN with Ancestral DW CD and Mythic GT CD substats\n\nX-Axis shows each activation averages leading back to a 50s sync\nY-axis is GB activation time in seconds (1–50).`;
    const footerLines = footerText.split('\n').length;
    const FOOTER_LINE_HEIGHT = 22;
    const chartTopY = NEW_CHART_TOP + TITLE_HEIGHT;
    const chartBottom = chartTopY + CHART_AREA_HEIGHT;
    const labelGapY = 22;
    const xAxisY = chartBottom + 18;
    const labelBaseY = chartBottom + XAXIS_LABELS_HEIGHT + 8;
    const legendY = chartBottom + XAXIS_LABELS_HEIGHT + 2 * labelGapY + 18;
    // Averages table base Y (directly after last x axis label row)
    const avgBaseY = labelBaseY + 4 * labelGapY;
    // Footer starts after averages table (3 rows) + extra gap
    const footerStartY = avgBaseY + 3 * labelGapY + 32;
    // Dynamically calculate total height: footerStartY + all footer lines + bottom margin
    let height = footerStartY + (footerLines * FOOTER_LINE_HEIGHT) + 16;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Background
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, width, height);

    // Draw title above chart (larger font)
    ctx.font = 'bold 38px Arial';
    ctx.fillStyle = LABEL_COLOR;
    ctx.textAlign = 'center';
    ctx.fillText('DW Uptime % (per GB Activation)', CHART_LEFT + ((numPairs * 2 + 1) / 2) * (cellSize + cellGap), TITLE_HEIGHT - 10);

    // Store stats for averages
    let totalUptime = 0;
    let totalLinger = 0;
    let totalLinger3 = 0;
    let statsArr = [];

    // Draw pairs: GB (yellow, always the same), DW (red/orange, offset, wraps if needed, always 50s tall)
    for (let pairIdx = 0; pairIdx < SYNC_OFFSETS.length; pairIdx++) {
        const sync = SYNC_OFFSETS[pairIdx];
        // Gold Bot bar (draw cell-by-cell, only rows 0-39)
        let xGB = CHART_LEFT + pairIdx * 2 * (cellSize + cellGap);
        let yGB = NEW_CHART_TOP + TITLE_HEIGHT;
        ctx.fillStyle = GOLD_BOT_COLOR;
        for (let t = 0; t < BOT_DURATION; t++) {
            if (t < 50) {
                ctx.fillRect(xGB, yGB + t * (cellHeight + rowGap), cellSize, cellHeight);
            }
        }

        // DW bar (red 36s, orange 4s)
        let xDW = xGB + cellSize + cellGap;
        let dwInsideGB = 0;
        let dwPlusLingerInsideGB = 0;
        let dwPlusLinger3InsideGB = 0;
        for (let i = 0; i < 40; i++) {
            let t = (sync + i) % 50;
            ctx.fillStyle = (i < 36) ? DEATH_WAVE_COLOR : WAVE_COLOR;
            ctx.fillRect(xDW, NEW_CHART_TOP + TITLE_HEIGHT + t * (cellHeight + rowGap), cellSize, cellHeight);
            if (t >= 0 && t < BOT_DURATION) {
                if (i < 36) dwInsideGB++;
                dwPlusLingerInsideGB++;
            }
        }
        // For 3s linger (DW = 36s + 3s = 39s)
        for (let i = 0; i < 39; i++) {
            let t = (sync + i) % 50;
            if (t >= 0 && t < BOT_DURATION) {
                dwPlusLinger3InsideGB++;
            }
        }
        const uptimePct = (dwInsideGB / 40) * 100;
        const lingerPct = (dwPlusLingerInsideGB / 40) * 100;
        const linger3Pct = (dwPlusLinger3InsideGB / 40) * 100;
        statsArr.push({ uptimePct, lingerPct, linger3Pct });
        totalUptime += uptimePct;
        totalLinger += lingerPct;
        totalLinger3 += linger3Pct;
    }

    // Calculate averages (for bolding only)
    const avgUptime = totalUptime / statsArr.length;
    const avgLinger = totalLinger / statsArr.length;
    const avgLinger3 = totalLinger3 / statsArr.length;

    // Draw y-axis tick labels (10, 20, ..., 50), perfectly aligned with the center of the cell
    for (let t = 10; t <= 50; t += 10) {
        // y = row (t-1), so (t-1) * (cellHeight + rowGap)
        const y = NEW_CHART_TOP + TITLE_HEIGHT + (t - 1) * (cellHeight + rowGap) + cellHeight / 2;
        ctx.save();
        ctx.font = '12px Arial';
        ctx.fillStyle = LABEL_COLOR;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(t.toString(), CHART_LEFT - 6, y);
        ctx.restore();
    }

    // Draw x-axis labels (activation numbers, not sync offsets)
    ctx.save();
    ctx.font = '14px Arial';
    ctx.fillStyle = LABEL_COLOR;
    ctx.textAlign = 'center';
    for (let pairIdx = 0; pairIdx < SYNC_OFFSETS.length; pairIdx++) {
        const x = CHART_LEFT + (pairIdx * 2 + 1) * (cellSize + cellGap) + cellSize / 2;
        // First column is 'Sync', others are just numbers (2, 3, ...)
        let label = pairIdx === 0 ? 'Sync' : `${pairIdx + 1}`;
        ctx.fillText(label, x, xAxisY);
    }
    ctx.restore();

    // Axis labels
    // Y axis label
    ctx.font = FONT;
    ctx.fillStyle = LABEL_COLOR;
    ctx.textAlign = 'center';
    ctx.save();
    ctx.translate(CHART_LEFT - 44, chartTopY + (50 / 2) * (cellHeight + rowGap));
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('GB Activation Period (Seconds)', 0, 0);
    ctx.restore();

    // Draw DW uptime % and linger % under each DW bar, not rotated
    ctx.save();
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';
    ctx.fillStyle = LABEL_COLOR;
    // Draw y-axis labels for the averages table (DW Uptime %, 2s Linger %, 3s Linger %)
    ctx.save();
    ctx.font = 'bold 15px Arial';
    ctx.textAlign = 'right';
    ctx.fillStyle = LABEL_COLOR;
    const avgLabelX = CHART_LEFT + Math.floor(cellSize / 2) - 8;
    ctx.fillText('DW%', avgLabelX, labelBaseY);
    ctx.fillText('2s%', avgLabelX, labelBaseY + labelGapY);
    ctx.fillText('3s%', avgLabelX, labelBaseY + 2 * labelGapY);
    ctx.restore();

    // Draw the actual values for each column
    for (let pairIdx = 0; pairIdx < SYNC_OFFSETS.length; pairIdx++) {
        const { uptimePct, lingerPct, linger3Pct } = statsArr[pairIdx];
        const x = CHART_LEFT + (pairIdx * 2 + 1) * (cellSize + cellGap) + cellSize / 2;
        // Top label: DW uptime %
        ctx.fillStyle = LABEL_COLOR;
        ctx.fillText(uptimePct.toFixed(1) + '%', x, labelBaseY);
        // Middle label: 2s linger %
        ctx.fillText(lingerPct.toFixed(1) + '%', x, labelBaseY + labelGapY);
        // Bottom label: 3s linger %
        ctx.fillText(linger3Pct.toFixed(1) + '%', x, labelBaseY + 2 * labelGapY);
        ctx.fillStyle = LABEL_COLOR;
    }
    // Bold averages below all columns, directly after the last x axis/column label row
    // (avgBaseY already calculated above)
    ctx.font = 'bold 16px Arial';
    ctx.fillStyle = LABEL_COLOR;
    ctx.textAlign = 'center';
    ctx.fillText('DW Uptime Avg: ' + avgUptime.toFixed(1) + '%', CHART_LEFT + ((numPairs * 2) * (cellSize + cellGap)) / 2, avgBaseY);
    ctx.fillText('2s Linger Avg: ' + avgLinger.toFixed(1) + '%', CHART_LEFT + ((numPairs * 2) * (cellSize + cellGap)) / 2, avgBaseY + labelGapY);
    ctx.fillText('3s Linger Avg: ' + avgLinger3.toFixed(1) + '%', CHART_LEFT + ((numPairs * 2) * (cellSize + cellGap)) / 2, avgBaseY + 2 * labelGapY);
    ctx.restore();

    // Legend (update for new segment meanings)
    // const legendY = TITLE_HEIGHT + NEW_CHART_TOP + CHART_AREA_HEIGHT + XAXIS_LABELS_HEIGHT + 2 * labelGapY + 18; // removed redeclaration
    const legendX = CHART_LEFT + 20;
    ctx.font = 'bold 15px Arial';
    ctx.textAlign = 'left';
    ctx.fillStyle = GOLD_BOT_COLOR;
    ctx.fillRect(legendX, legendY, 24, 18);
    ctx.fillStyle = LABEL_COLOR;
    ctx.fillText('Gold Bot Duration', legendX + 32, legendY + 14);
    ctx.fillStyle = DEATH_WAVE_COLOR;
    ctx.fillRect(legendX + 160, legendY, 24, 18);
    ctx.fillStyle = LABEL_COLOR;
    ctx.fillText('DW Duration', legendX + 192, legendY + 14);
    ctx.fillStyle = WAVE_COLOR;
    ctx.fillRect(legendX + 280, legendY, 24, 18);
    ctx.fillStyle = LABEL_COLOR;
    ctx.fillText('DW Final Wave', legendX + 312, legendY + 14);
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(legendX + 440, legendY, 24, 18);
    // Draw border around inactive color
    ctx.strokeStyle = '#888';
    ctx.lineWidth = 2;
    ctx.strokeRect(legendX + 440, legendY, 24, 18);
    ctx.fillStyle = LABEL_COLOR;
    ctx.fillText('Inactive', legendX + 472, legendY + 14);

    // Footer description (move further down below averages, align left)
    ctx.font = '18px Arial';
    ctx.fillStyle = LABEL_COLOR;
    ctx.textAlign = 'left';
    // Place footer below averages block
    const footerX = CHART_LEFT;
    // footerStartY already calculated above
    const lines = footerText.split('\n');
    for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], footerX, footerStartY + i * FOOTER_LINE_HEIGHT);
    }

    // Border
    ctx.strokeStyle = '#888';
    ctx.lineWidth = 2;
    ctx.strokeRect(
        CHART_LEFT - 2,
        NEW_CHART_TOP + TITLE_HEIGHT - 2,
        (numPairs * 2) * (cellSize + cellGap) - cellGap + 4,
        CHART_AREA_HEIGHT + 4
    );

    return canvas.toBuffer('image/png');
}


module.exports = {
    generateGoldBotVsDeathWaveUptimeChart
};
