// Programmatic Elite Spawn Chance chart (uses reference column as multiplier)
const style = require('./style.js');
const { renderSimpleTableChart } = require('./simpleTableChartRenderer.js');
const {
    eliteSpawnChanceHeaders,
    eliteSpawnChanceTitle,
    eliteSpawnChanceFooterLines,
    eliteSpawnChanceModifierDisplay,
    eliteSpawnChanceRatioLabel,
    eliteSpawnChanceModifiersHeader,
    eliteSpawnChanceRows,
} = require('../../../../../packages/platform/dist/tools/chart-data.js');

const HEADERS = [...eliteSpawnChanceHeaders];
const DATA = eliteSpawnChanceRows.map(row => [...row]);
const TITLE = eliteSpawnChanceTitle;
const FOOTER_TEXT = [...eliteSpawnChanceFooterLines];

async function generateEliteSpawnChanceChart() {
    const rowHeight = 28;
    const headerRowHeight = 28;
    const titleYOffset = 50;
    const modifiersRowHeight = 28;
    const modifiersHeaderHeight = 24;
    const modifiersSpacing = 18;
    const footerLineSpacing = 3;
    const footerPadding = 8;
    const footerLineHeight = 18;
    const modifiersRow = ['0.9', ...eliteSpawnChanceModifierDisplay];

    function wrapText(ctx, text, font, maxWidth) {
        ctx.font = font;
        if (!text) return [''];
        const words = text.split(' ');
        const lines = [];
        let current = '';
        for (const word of words) {
            const test = current ? `${current} ${word}` : word;
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

    return renderSimpleTableChart({
        data: {
            title: TITLE,
            headers: HEADERS,
            rows: DATA,
        },
        style,
        headerRowHeight,
        dataRowHeight: rowHeight,
        titleYOffset,
        bottomPadding: 210,
        customHeaderRenderer: ({
            ctx,
            y,
            margin,
            colWidths,
            headers,
            borderColor,
            headerBg,
            headerText,
            headerCellFont,
            getHeaderBackground,
        }) => {
            let x = margin;
            ctx.font = headerCellFont;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            for (let col = 0; col < 23; col += 1) {
                ctx.fillStyle = getHeaderBackground
                    ? getHeaderBackground({ colIndex: col, defaultBackground: headerBg })
                    : headerBg;
                ctx.fillRect(x, y, colWidths[col], headerRowHeight);
                ctx.strokeStyle = borderColor;
                ctx.strokeRect(x, y, colWidths[col], headerRowHeight);
                ctx.fillStyle = headerText;
                ctx.fillText(String(headers[col] || ''), x + colWidths[col] / 2, y + headerRowHeight / 2);
                x += colWidths[col];
            }

            const refWidth = colWidths[23] + colWidths[24];
            ctx.fillStyle = headerBg;
            ctx.fillRect(x, y, refWidth, headerRowHeight);
            ctx.strokeStyle = borderColor;
            ctx.strokeRect(x, y, refWidth, headerRowHeight);
            ctx.fillStyle = headerText;
            ctx.fillText('Ref.', x + refWidth / 2, y + headerRowHeight / 2);

            return y + headerRowHeight;
        },
        afterRows: ({
            ctx,
            y,
            margin,
            colWidths,
            tableWidth,
            borderColor,
            headerBg,
            headerText,
            evenRowBg,
            textColor,
            footerFont,
            footerBg,
            footerColor,
        }) => {
            let drawY = y + modifiersSpacing;

            let modX = margin + colWidths[0];
            ctx.font = style.headerCellFont;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            ctx.fillStyle = headerBg;
            ctx.fillRect(modX, drawY, colWidths[1], modifiersHeaderHeight);
            ctx.strokeStyle = borderColor;
            ctx.strokeRect(modX, drawY, colWidths[1], modifiersHeaderHeight);
            ctx.fillStyle = headerText;
            ctx.fillText(eliteSpawnChanceRatioLabel, modX + colWidths[1] / 2, drawY + modifiersHeaderHeight / 2);
            modX += colWidths[1];

            let spanWidth = 0;
            for (let col = 2; col <= 22; col += 1) spanWidth += colWidths[col];
            ctx.fillStyle = headerBg;
            ctx.fillRect(modX, drawY, spanWidth, modifiersHeaderHeight);
            ctx.strokeStyle = borderColor;
            ctx.strokeRect(modX, drawY, spanWidth, modifiersHeaderHeight);
            ctx.fillStyle = headerText;
            ctx.fillText(eliteSpawnChanceModifiersHeader, modX + spanWidth / 2, drawY + modifiersHeaderHeight / 2);

            drawY += modifiersHeaderHeight;
            modX = margin + colWidths[0];
            ctx.font = style.cellFont;
            for (let index = 0; index < modifiersRow.length; index += 1) {
                const width = colWidths[index + 1];
                ctx.fillStyle = evenRowBg;
                ctx.fillRect(modX, drawY, width, modifiersRowHeight);
                ctx.strokeStyle = borderColor;
                ctx.strokeRect(modX, drawY, width, modifiersRowHeight);
                ctx.fillStyle = textColor;
                ctx.fillText(String(modifiersRow[index]), modX + width / 2, drawY + modifiersRowHeight / 2);
                modX += width;
            }

            drawY += modifiersRowHeight;
            const maxFooterWidth = tableWidth - 8;
            const footerLines = [];
            for (const line of FOOTER_TEXT) {
                if (line === '') footerLines.push('');
                else footerLines.push(...wrapText(ctx, line, footerFont, maxFooterWidth));
            }
            const footerHeight = footerLines.reduce(
                (sum, line) => sum + (line === '' ? footerPadding : footerLineHeight + footerLineSpacing),
                style.margin,
            );

            ctx.fillStyle = footerBg;
            ctx.fillRect(0, drawY, margin * 2 + tableWidth, footerHeight);
            ctx.font = footerFont;
            ctx.fillStyle = footerColor;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';

            let footerY = drawY + 5;
            const footerX = margin / 2;
            for (const line of footerLines) {
                if (line === '') footerY += footerPadding;
                else {
                    ctx.fillText(line, footerX, footerY);
                    footerY += footerLineHeight + footerLineSpacing;
                }
            }
        },
    });
}

module.exports = { generateEliteSpawnChanceChart, DATA };
