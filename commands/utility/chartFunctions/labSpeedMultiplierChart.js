// Generates the Most Efficient Lab Speed Multiplier chart
const { createCanvas } = require('canvas');
const style = require('./style.js');
const { renderSimpleTableChart } = require('./simpleTableChartRenderer.js');
const {
    labSpeedMultiplierData,
    labSpeedMultiplierFooterLines,
    toSharedChartTablePreviewRows,
} = require('../../../../../packages/platform/dist/tools/chart-data.js');

const HEADERS = labSpeedMultiplierData.columns.map(column => column.label);
const TITLE = labSpeedMultiplierData.title;
const FOOTER_TEXT = [...labSpeedMultiplierFooterLines];
const DATA = toSharedChartTablePreviewRows(labSpeedMultiplierData).map(row => [...row]);

async function generateLabSpeedMultiplierChart() {
    const footerLineSpacing = 4;
    const footerPadding = 10;
    const titleYOffset = 36;
    const footerTopOffset = 6;
    const footerLeftPadding = 12;
    const maxFooterWidthPadding = 8;

    // Color palette for each multiplier value (dark mode friendly, muted)
    const valueColors = {
        '1':   '#23272f', // dark gray
        '1.5': '#1e3a2a', // muted red
        '2':   '#23272f', // muted purple
        '3':   '#1e3a2a', // muted green
        '4':   '#23272f', // muted brown/orange
        '5':   '#1e3a2a', // muted blue
        '6':   '#23272f', // deeper/darker purple for 6
    };

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

    function buildFooterLines(ctx, tableWidth) {
        const maxFooterWidth = tableWidth - maxFooterWidthPadding;
        const footerLines = [];
        for (const line of FOOTER_TEXT) {
            if (line === '') {
                footerLines.push('');
            } else {
                footerLines.push(...wrapText(ctx, line, style.footerFont, maxFooterWidth));
            }
        }
        return footerLines;
    }

    function getFooterHeight(lines) {
        return lines.reduce((sum, line) => sum + (line === '' ? footerPadding : 20 + footerLineSpacing), 0) + style.margin;
    }

    const measurementCanvas = createCanvas(1, 1);
    const measurementCtx = measurementCanvas.getContext('2d');
    const columnWidths = HEADERS.map((header, index) => {
        let max = 0;
        measurementCtx.font = style.headerCellFont;
        max = Math.max(max, measurementCtx.measureText(String(header)).width);
        measurementCtx.font = style.cellFont;
        for (const row of DATA) {
            max = Math.max(max, measurementCtx.measureText(String(row[index] || '')).width);
        }
        return Math.ceil(max) + style.cellPadding * 2;
    });
    const tableWidth = columnWidths.reduce((sum, width) => sum + width, 0);
    const footerLines = buildFooterLines(measurementCtx, tableWidth);
    const footerHeight = getFooterHeight(footerLines);

    return renderSimpleTableChart({
        data: {
            title: TITLE,
            headers: HEADERS,
            rows: DATA,
        },
        style,
        headerRowHeight: 30,
        titleYOffset,
        bottomPadding: footerHeight,
        customCellRenderer: ({ ctx, row, colIndex, x, y, width, height, value, textColor }) => {
            let cellBg = '#181a20';
            if (colIndex < 5) {
                cellBg = valueColors[String(row[colIndex])] || '#181a20';
            }

            ctx.fillStyle = cellBg;
            ctx.fillRect(x, y, width, height);
            ctx.strokeStyle = style.borderColor;
            ctx.lineWidth = 1;
            ctx.strokeRect(x, y, width, height);
            ctx.fillStyle = textColor;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(String(value), x + width / 2, y + height / 2);
            return true;
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

module.exports = { generateLabSpeedMultiplierChart };
