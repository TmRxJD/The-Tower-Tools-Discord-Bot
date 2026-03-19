// Enemy Balance Mastery Chart Generator (with proper header spanning and alignment)
const { createCanvas } = require('canvas');
const style = require('./style.js');
const { renderSimpleTableChart } = require('./simpleTableChartRenderer.js');
const {
  enemyBalanceMasteryData,
  enemyBalanceMasteryHeaderGroups,
  enemyBalanceMasterySubheaders,
  enemyBalanceMasteryFooterText,
  toSharedChartTablePreviewRows,
} = require('../../../../../packages/platform/dist/tools/chart-data.js');

// Headers and subheaders for proper spanning
const HEADERS = enemyBalanceMasteryHeaderGroups.map(group => ({
  label: group.label,
  span: group.span,
}));
const SUBHEADERS = [...enemyBalanceMasterySubheaders];
const ROWS = toSharedChartTablePreviewRows(enemyBalanceMasteryData).map(row => [...row]);
const FOOTER_TEXT = enemyBalanceMasteryFooterText;

async function generateEnemyBalanceMasteryChart() {
  const rowHeight = style.baseRowHeight;
  const footerLineHeight = 20;
  const footerTopOffset = 6;
  const footerLeftPadding = 12;
  const footerBottomPadding = 10;

  function wrapText(ctx, text, maxWidth) {
    const words = String(text || '').split(/\s+/).filter(Boolean);
    if (words.length === 0) return [''];

    const lines = [];
    let current = '';
    for (const word of words) {
      const testLine = current ? `${current} ${word}` : word;
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

  const measureCtx = createCanvas(1, 1).getContext('2d');
  const colWidths = SUBHEADERS.map((subheader, colIndex) => {
    let maxWidth = 0;
    measureCtx.font = style.headerFont;
    for (const line of String(subheader || '').split('\n')) {
      maxWidth = Math.max(maxWidth, measureCtx.measureText(line).width);
    }

    measureCtx.font = style.font;
    for (let rowIndex = 0; rowIndex < ROWS.length; rowIndex += 1) {
      for (const line of String(ROWS[rowIndex][colIndex] || '').split('\n')) {
        maxWidth = Math.max(maxWidth, measureCtx.measureText(line).width);
      }
    }

    return Math.ceil(maxWidth) + style.cellPadding * 2;
  });

  const tableWidth = colWidths.reduce((sum, width) => sum + width, 0);
  measureCtx.font = style.footerFont;
  const footerLines = wrapText(measureCtx, FOOTER_TEXT, Math.max(100, tableWidth - footerLeftPadding * 2));
  const footerHeight = footerLines.length * footerLineHeight + footerTopOffset + footerBottomPadding;

  return renderSimpleTableChart({
    data: {
      title: '',
      headers: SUBHEADERS,
      rows: ROWS,
    },
    style,
    titleYOffset: 0,
    headerRowHeight: rowHeight,
    bottomPadding: footerHeight,
    beforeHeader: ({ ctx, y, colWidths, headerBg, headerText, borderColor }) => {
      let x = style.margin;
      let columnIndex = 0;

      ctx.font = style.headerFont;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const header of HEADERS) {
        let width = 0;
        for (let spanIndex = 0; spanIndex < header.span; spanIndex += 1) {
          width += colWidths[columnIndex + spanIndex];
        }

        ctx.fillStyle = headerBg;
        ctx.fillRect(x, y, width, rowHeight);
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, width, rowHeight);

        ctx.fillStyle = headerText;
        ctx.fillText(String(header.label), x + width / 2, y + rowHeight / 2);

        x += width;
        columnIndex += header.span;
      }

      return y + rowHeight;
    },
    afterRows: ({ ctx, y, tableWidth, footerBg, footerColor, footerFont }) => {
      ctx.font = footerFont;
      ctx.fillStyle = footerBg;
      ctx.fillRect(0, y, tableWidth, footerHeight);

      ctx.fillStyle = footerColor;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';

      let textY = y + footerTopOffset;
      for (const line of footerLines) {
        ctx.fillText(line, footerLeftPadding, textY);
        textY += footerLineHeight;
      }
    },
  });
}

module.exports = { generateEnemyBalanceMasteryChart };
