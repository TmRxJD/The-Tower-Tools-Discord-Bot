// Generates the Card Mastery Cost and Bonuses chart
const { createCanvas } = require('canvas');
const style = require('./style.js');
const { renderSimpleTableChart } = require('./simpleTableChartRenderer.js');
const {
    cardMasteryCostData,
    cardMasteryCostFooterLines,
    toSharedChartTablePreviewRows,
} = require('../../../../../packages/platform/dist/tools/chart-data.js');

const TITLE = cardMasteryCostData.title;
const HEADERS = cardMasteryCostData.columns.map(column => column.label);
const DATA = toSharedChartTablePreviewRows(cardMasteryCostData).map(row => [...row]);
const FOOTER_TEXT = [...cardMasteryCostFooterLines];


async function generateCardMasteryCostChart() {
    const headerRowHeight = 30;
    const titleYOffset = 36;
    const footerLineSpacing = 4;
    const footerPadding = 10;
    const footerTopOffset = 6;
    const footerLeftPadding = 12;
    const maxFooterWidthPadding = 8;

    function getColumnWidths(ctx) {
      return HEADERS.map((header, i) => {
        let max = 0;
        for (const part of String(header).split('\n')) {
            ctx.font = style.headerCellFont;
            max = Math.max(max, ctx.measureText(part).width);
        }
        ctx.font = style.cellFont;
        for (const row of DATA) {
            max = Math.max(max, ctx.measureText(row[i]).width);
        }
        return Math.ceil(max) + style.cellPadding * 2;
      });
    }

    function wrapText(ctx, text, font, maxWidth) {
        ctx.font = font;
        if (!text) return [''];
        const words = text.split(' ');
        let lines = [];
        let current = '';
        for (let word of words) {
            const test = current ? current + ' ' + word : word;
            if (ctx.measureText(test).width > maxWidth && current) {
                lines.push(current);
                current = word;
            } else {
                current = test;
            }
        }
        if (current) lines.push(current);
        return lines;
    }

        const measureCtx = createCanvas(1, 1).getContext('2d');
        const colWidths = getColumnWidths(measureCtx);
        const tableWidth = colWidths.reduce((sum, width) => sum + width, 0);
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
            afterRows: ({ ctx, y, tableWidth, footerBg, footerColor, footerFont }) => {
                ctx.font = footerFont;
                ctx.fillStyle = footerBg;
                ctx.fillRect(0, y, tableWidth, footerHeight);
                ctx.fillStyle = footerColor;
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

module.exports = { generateCardMasteryCostChart };
