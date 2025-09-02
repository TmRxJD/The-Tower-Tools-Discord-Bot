// Bonus Multipliers Chart (Modules > Project Funding)
const { createCanvas } = require('canvas');
const style = require('./style.js');

const BONUS_MULTIPLIERS = {
  title: 'Bonus Multipliers',
  headers: [
    'Cash Value', 'Number of Digits', 'Epic Multiplier', 'Legendary Multiplier', 'Mythic Multiplier', 'Ancestral Multiplier'
  ],
  rows: [
    ['1k', 4, 0.5, 1.0, 2.0, 4.0],
    ['10k', 5, 0.625, 1.25, 2.5, 5.0],
    ['100k', 6, 0.75, 1.5, 3.0, 6.0],
    ['1m', 7, 0.875, 1.75, 3.5, 7.0],
    ['10m', 8, 1.0, 2.0, 4.0, 8.0],
    ['100m', 9, 1.125, 2.25, 4.5, 9.0],
    ['1b', 10, 1.25, 2.5, 5.0, 10.0],
    ['10b', 11, 1.375, 2.75, 5.5, 11.0],
    ['100b', 12, 1.5, 3.0, 6.0, 12.0],
    ['1t', 13, 1.625, 3.25, 6.5, 13.0],
    ['10t', 14, 1.75, 3.5, 7.0, 14.0],
    ['100t', 15, 1.875, 3.75, 7.5, 15.0],
    ['1q', 16, 2.0, 4.0, 8.0, 16.0],
  ]
};

async function generateBonusMultipliersChart() {
  const data = BONUS_MULTIPLIERS;
  // Use global style variables
  const font = style.font;
  const headerFont = style.headerFont;
  const cellFont = style.cellFont;
  const headerCellFont = style.headerCellFont;
  const cellPadding = style.cellPadding;
  const baseRowHeight = style.baseRowHeight;
  const margin = style.margin;
  const borderColor = style.borderColor;
  const headerBg = style.headerBg;
  const headerText = style.headerText;
  const evenRowBg = style.evenRowBg;
  const oddRowBg = style.oddRowBg;
  const textColor = style.textColor;

  // Header wrapping logic
  const ctx = createCanvas(10, 10).getContext('2d');
  ctx.font = cellFont;
  function getWrappedLines(text, font, maxWidth) {
    ctx.font = font;
    const words = text.split(' ');
    let lines = [];
    let current = '';
    for (let i = 0; i < words.length; i++) {
      let test = current ? current + ' ' + words[i] : words[i];
      if (ctx.measureText(test).width > maxWidth && current) {
        lines.push(current);
        current = words[i];
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);
    return lines;
  }
  const MAX_HEADER_WIDTH = 120;
  ctx.font = cellFont;
  const colWidths = data.headers.map((header, i) => {
    ctx.font = headerCellFont;
    let headerLines = getWrappedLines(header, headerCellFont, MAX_HEADER_WIDTH);
    let headerWidth = Math.max(...headerLines.map(line => ctx.measureText(line).width));
    ctx.font = cellFont;
    let max = headerWidth;
    for (const row of data.rows) {
      max = Math.max(max, ctx.measureText(String(row[i] || '')).width);
    }
    return Math.max(max, headerWidth) + cellPadding * 2;
  });
  const tableWidth = colWidths.reduce((a, b) => a + b, 0);
  // Header wrapping height
  let headerMaxLines = 1;
  const headerWrappedLines = data.headers.map(header => {
    const lines = getWrappedLines(header, headerCellFont, MAX_HEADER_WIDTH);
    headerMaxLines = Math.max(headerMaxLines, lines.length);
    return lines;
  });
  const headerLineHeight = 18;
  const headerActualRowHeight = headerMaxLines * headerLineHeight + 8;
  const tableHeight = headerActualRowHeight + data.rows.length * baseRowHeight;
  const bottomPadding = 36;
  const canvas = createCanvas(tableWidth + margin * 2, tableHeight + margin * 2 + bottomPadding);
  const ctx2 = canvas.getContext('2d');
  ctx2.fillStyle = oddRowBg;
  ctx2.fillRect(0, 0, canvas.width, canvas.height);

  // Draw title
  ctx2.font = headerFont;
  ctx2.fillStyle = headerText;
  ctx2.textAlign = 'center';
  ctx2.textBaseline = 'top';
  ctx2.fillText(data.title, canvas.width / 2, margin / 2);

  // Draw table
  let x = margin;
  let y = margin + 36;
  // Header row with wrapping
  ctx2.font = headerCellFont;
  let hx = x;
  for (let i = 0; i < data.headers.length; i++) {
    ctx2.fillStyle = headerBg;
    ctx2.fillRect(hx, y, colWidths[i], headerActualRowHeight);
    ctx2.strokeStyle = borderColor;
    ctx2.strokeRect(hx, y, colWidths[i], headerActualRowHeight);
    ctx2.fillStyle = headerText;
    ctx2.textAlign = 'center';
    ctx2.textBaseline = 'middle';
    // Draw each line of wrapped header
    const lines = headerWrappedLines[i];
    const totalTextHeight = lines.length * headerLineHeight;
    const startY = y + (headerActualRowHeight - totalTextHeight) / 2 + headerLineHeight / 2;
    for (let l = 0; l < lines.length; l++) {
      ctx2.fillText(lines[l], hx + colWidths[i] / 2, startY + l * headerLineHeight);
    }
    hx += colWidths[i];
  }
  y += headerActualRowHeight;

  // Data rows
  ctx2.font = cellFont;
  for (let r = 0; r < data.rows.length; r++) {
    let rx = x;
    const rowBg = r % 2 === 0 ? evenRowBg : oddRowBg;
    for (let c = 0; c < data.headers.length; c++) {
      ctx2.fillStyle = rowBg;
      ctx2.fillRect(rx, y, colWidths[c], baseRowHeight);
      ctx2.strokeStyle = borderColor;
      ctx2.strokeRect(rx, y, colWidths[c], baseRowHeight);
      ctx2.fillStyle = textColor;
      ctx2.textAlign = 'center';
      ctx2.textBaseline = 'middle';
      ctx2.fillText(String(data.rows[r][c] || ''), rx + colWidths[c] / 2, y + baseRowHeight / 2);
      rx += colWidths[c];
    }
    y += baseRowHeight;
  }

  return canvas.toBuffer('image/png');
}

module.exports = { generateBonusMultipliersChart };
