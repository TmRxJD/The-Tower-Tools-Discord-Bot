// Generates the BHD Coin Boost Chart (Wave Skip Coin Boost) as shown in the provided spreadsheet

const { createCanvas } = require('canvas');
const style = require('./style.js');
const { renderSimpleTableChart } = require('./simpleTableChartRenderer.js');
const {
    waveSkipCoinBoostData,
    waveSkipCoinBoostSubheader,
    toSharedChartTablePreviewRows,
} = require('../../../../../packages/platform/dist/tools/chart-data.js');

// Table data and headers (from spreadsheet)
const HEADERS = waveSkipCoinBoostData.columns.map(column => column.label);
const SUBHEADER = waveSkipCoinBoostSubheader;
const TITLE = waveSkipCoinBoostData.title;
const DATA = toSharedChartTablePreviewRows(waveSkipCoinBoostData).map(row => [...row]);

// Explanatory/footnote text (concise, for footer)
const FOOTER_TEXT = [
    'This chart shows the average expected CPK increase from BHD based on Wave Skip Mastery and total Free-Up Chance,',
    'assuming Ancestral BHD and a maxed Wave Skip card for "None."',
    '',
    'The distribution of Free-Ups between stats does not matter. Actual values may vary due to Wave Skip RNG.',
    'The chart only reflects the portion of Wave Skip Mastery value unique to the BHD module.',
    '',
    'Max Free-Up chance per stat (with maxed workshop, card, and SPB): (90.75 + Substat) × Enhancement × Relic × Keys.',
    '',
    'Credit: Yugiohcd10.'
];

// Main chart generator
async function generateWaveSkipCoinBoostChart() {
    const subheaderFont = 'bold 18px Arial';
    const subheaderHeight = 32;
    const headerRowHeight = 46;
    const titleYOffset = 36;
    const footerLineSpacing = 4;
    const footerPadding = 10;
    const subtitleTopOffset = 2;
    const footerTopOffset = 6;
    const footerLeftPadding = 12;
    const maxFooterWidthPadding = 8;

    function wrapText(ctx, text, font, maxWidth) {
        ctx.font = font;
        if (!text) return [''];
        const words = text.split(' ');
        let lines = [];
        let current = '';
        for (let word of words) {
            const testLine = current ? current + ' ' + word : word;
            if (ctx.measureText(testLine).width > maxWidth && current) {
                lines.push(current);
                current = word;
            } else {
                current = testLine;
            }
        }
        if (current) lines.push(current);
        return lines;
    }

    function getTableWidth(ctx) {
        const colWidths = HEADERS.map((header, index) => {
            let max = 0;
            ctx.font = style.headerCellFont;
            for (const part of String(header).split('\n')) {
                max = Math.max(max, ctx.measureText(part).width);
            }
            ctx.font = style.cellFont;
            for (const row of DATA) {
                max = Math.max(max, ctx.measureText(String(row[index] || '')).width);
            }
            return Math.ceil(max) + style.cellPadding * 2;
        });
        return colWidths.reduce((sum, width) => sum + width, 0);
    }

    const measureCanvas = createCanvas(1, 1);
    const measureCtx = measureCanvas.getContext('2d');
    const tableWidth = getTableWidth(measureCtx);
    const maxFooterWidth = tableWidth - maxFooterWidthPadding;
    const footerLines = [];
    for (const line of FOOTER_TEXT) {
        if (line === '') {
            footerLines.push('');
        } else {
            footerLines.push(...wrapText(measureCtx, line, style.footerFont, maxFooterWidth));
        }
    }
    const footerHeight = footerLines.reduce((sum, line) => sum + (line === '' ? footerPadding : 20 + footerLineSpacing), 0) + style.margin;

    return renderSimpleTableChart({
        data: {
            title: TITLE,
            headers: HEADERS,
            rows: DATA,
        },
        style,
        headerRowHeight,
        titleYOffset,
        bottomPadding: footerHeight,
        beforeHeader: ({ ctx, y, margin, tableWidth, headerText }) => {
            ctx.font = subheaderFont;
            ctx.fillStyle = headerText;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText(SUBHEADER, margin + tableWidth / 2, y + subtitleTopOffset);
            return y + subheaderHeight;
        },
        afterRows: ({ ctx, y }) => {
            ctx.font = style.footerFont;
            ctx.fillStyle = style.footerBg;
            ctx.fillRect(0, y, tableWidth, footerHeight);
            ctx.fillStyle = style.footerColor;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';

            let footerY = y + footerTopOffset;
            for (const line of footerLines) {
                if (line === '') {
                    footerY += footerPadding;
                } else {
                    ctx.fillText(line, footerLeftPadding, footerY);
                    footerY += 20 + footerLineSpacing;
                }
            }
        },
    });
}

module.exports = { generateWaveSkipCoinBoostChart };
