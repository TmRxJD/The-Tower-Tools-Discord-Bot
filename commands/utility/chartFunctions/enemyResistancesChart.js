// Enemy Resistances chart generator
const { createCanvas } = require('canvas');
const style = require('./style.js');
const { renderSimpleTableChart } = require('./simpleTableChartRenderer.js');
const {
  enemyResistanceColumns,
  enemyResistanceRows,
  enemyResistanceLegend,
  enemyResistanceFooterSentenceOne,
  enemyResistanceFooterSentenceTwo,
  enemyResistanceFooterCredit,
} = require('../../../../../packages/platform/dist/tools/chart-data.js');

const COLUMNS = [...enemyResistanceColumns];

// type: good | partial | bad | neutral
const ROWS = enemyResistanceRows.map(row => ({
  label: row.label,
  cells: row.cells.map(cell => ({ text: cell.text, type: cell.type })),
}));

const LEGEND = enemyResistanceLegend.map(entry => ({
  label: entry.label,
  type: entry.type,
}));

const CHART_DATA = {
  title: '',
  headers: [...COLUMNS],
  rows: ROWS.map(row => [
    row.label,
    ...row.cells.map(cell => normalizeCell(cell).text || ''),
  ]),
};

function toneToColor(type) {
  switch (type) {
    case 'good':
      return '#2ecc71';
    case 'partial':
      return '#f1c40f';
    case 'neutral':
      return style.evenRowBg;
    case 'bad':
    default:
      return '#e74c3c';
  }
}

function normalizeCell(cell) {
  if (typeof cell === 'string') return { text: '', type: cell };
  return cell || { text: '', type: 'neutral' };
}

async function generateEnemyResistancesChart() {
  const rowHeight = style.baseRowHeight;
  const legendHeight = 60;
  const cellPadding = style.cellPadding;

  const measureCtx = createCanvas(1, 1).getContext('2d');
  const colWidths = CHART_DATA.headers.map((header, colIndex) => {
    let maxWidth = 0;
    measureCtx.font = style.headerFont;
    maxWidth = Math.max(maxWidth, measureCtx.measureText(String(header || '')).width);

    measureCtx.font = style.cellFont || style.font;
    for (let rowIndex = 0; rowIndex < CHART_DATA.rows.length; rowIndex += 1) {
      const value = String(CHART_DATA.rows[rowIndex][colIndex] || '');
      for (const line of value.split('\n')) {
        maxWidth = Math.max(maxWidth, measureCtx.measureText(line).width);
      }
    }

    return Math.ceil(maxWidth + cellPadding * 2);
  });

  const tableWidth = colWidths.reduce((sum, width) => sum + width, 0);
  const footerSentenceOne = enemyResistanceFooterSentenceOne;
  const footerSentenceTwo = enemyResistanceFooterSentenceTwo;
  const footerCredit = enemyResistanceFooterCredit;
  const ctxFooter = createCanvas(1, 1).getContext('2d');
  ctxFooter.font = style.footerFont;
  const footerLines = [
    ...wrapLinesForWidth(ctxFooter, footerSentenceOne, tableWidth - cellPadding * 2),
    ...wrapLinesForWidth(ctxFooter, footerSentenceTwo, tableWidth - cellPadding * 2),
    '',
    ...wrapLinesForWidth(ctxFooter, footerCredit, tableWidth - cellPadding * 2),
  ];
  const footerHeight = footerLines.length * 20 + 12;

  return renderSimpleTableChart({
    data: CHART_DATA,
    style,
    titleYOffset: 0,
    headerRowHeight: rowHeight,
    bottomPadding: legendHeight + footerHeight + style.margin,
    customCellRenderer: ({ ctx, rowIndex, colIndex, x, y, width, height, value }) => {
      const rowBg = rowIndex % 2 === 0 ? style.evenRowBg : style.oddRowBg;
      const isLabelColumn = colIndex === 0;
      const cellTone = isLabelColumn
        ? 'neutral'
        : normalizeCell(ROWS[rowIndex].cells[colIndex - 1]).type;
      const cellBg = isLabelColumn ? rowBg : toneToColor(cellTone);
      const cellTextColor = isLabelColumn ? style.textColor : '#000';

      ctx.fillStyle = cellBg;
      ctx.fillRect(x, y, width, height);
      ctx.strokeStyle = style.borderColor;
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, width, height);

      ctx.fillStyle = cellTextColor;
      ctx.font = style.cellFont || style.font;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      wrapText(ctx, String(value || ''), x + width / 2, y + height / 2, width - style.cellPadding * 2);
      return true;
    },
    afterRows: ({ ctx, y, tableWidth }) => {
      // Legend
      let legendX = style.cellPadding;
      const legendY = y + 8;
      ctx.font = style.subheaderFont;
      for (const entry of LEGEND) {
        const boxSize = 18;
        ctx.fillStyle = toneToColor(entry.type);
        ctx.fillRect(legendX, legendY, boxSize, boxSize);
        ctx.strokeStyle = style.borderColor;
        ctx.strokeRect(legendX, legendY, boxSize, boxSize);
        ctx.fillStyle = style.textColor;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(entry.label, legendX + boxSize + 8, legendY + boxSize / 2);
        legendX += boxSize + 120;
      }

      // Footer
      const footerY = y + legendHeight;
      ctx.fillStyle = style.footerBg;
      ctx.fillRect(0, footerY, tableWidth, footerHeight);
      ctx.font = style.footerFont;
      ctx.fillStyle = style.footerColor;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      let lineY = footerY;
      for (const line of footerLines) {
        ctx.fillText(line, style.cellPadding, lineY);
        lineY += 20;
      }
    },
  });
}

function wrapText(ctx, text, centerX, centerY, maxWidth) {
  const words = String(text || '').split(' ');
  const lines = [];
  let current = '';
  for (const w of words) {
    const test = current.length ? `${current} ${w}` : w;
    if (ctx.measureText(test).width <= maxWidth) {
      current = test;
    } else {
      if (current) lines.push(current);
      current = w;
    }
  }
  if (current) lines.push(current);
  const totalHeight = lines.length * 16;
  let y = centerY - totalHeight / 2 + 8;
  for (const line of lines) {
    ctx.fillText(line, centerX, y);
    y += 16;
  }
}

// Simple word-wrap helper for footer paragraphs
function wrapLinesForWidth(ctx, text, maxWidth) {
  const words = String(text || '').split(/\s+/);
  const lines = [];
  let current = '';
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth) {
      current = test;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

module.exports = {
  generateEnemyResistancesChart,
};
