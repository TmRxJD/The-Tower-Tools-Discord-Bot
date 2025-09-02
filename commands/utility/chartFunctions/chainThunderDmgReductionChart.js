// Chain Thunder Dmg Reduction Chart
const { createCanvas } = require('canvas');
const style = require('./style.js');

const CHAIN_THUNDER_DMG_REDUCTION = {
  title: 'Chain Thunder Dmg Reduction',
  headers: [
    'CT Lab Level', 'CT Reduction %', 'CL+ Required'
  ],
  rows: [
    ['1', '3%', '+0'],
    ['2', '6%', '+0'],
    ['3', '9%', '+1'],
    ['4', '12%', '+1'],
    ['5', '15%', '+1'],
    ['6', '18%', '+2'],
    ['7', '21%', '+2'],
    ['8', '24%', '+2'],
    ['9', '27%', '+3'],
    ['10', '30%', '+3'],
    ['11', '33%', '+3'],
    ['12', '36%', '+4'],
    ['13', '39%', '+4'],
    ['14', '42%', '+5'],
    ['15', '45%', '+5'],
    ['16', '48%', '+5'],
    ['17', '51%', '+6'],
    ['18', '54%', '+6'],
    ['19', '57%', '+6'],
    ['20', '60%', '+7'],
    ['21', '63%', '+7'],
    ['22', '66%', '+7'],
    ['23', '69%', '+8'],
    ['24', '72%', '+8'],
    ['25', '75%', '+8'],
    ['26', '78%', '+9'],
    ['27', '81%', '+9'],
    ['28', '84%', '+10'],
    ['29', '87%', '+10'],
    ['30', '90%', '+10'],
  ]
};

// Color map for rows (by index)
const colorMap = {
  cyan:   [2,3,4,5,6,7],
  magenta:[8,9,10,11,12,13],
  orange: [14,15,16,17,18,19],
  red:    [20,21,22,23,24,25],
  green:  [26,27,28,29,30]
};

function getRowColor(rowIdx) {
  if (colorMap.cyan.includes(rowIdx+1)) return '#00ffff';
  if (colorMap.magenta.includes(rowIdx+1)) return '#ff00ff';
  if (colorMap.orange.includes(rowIdx+1)) return '#ff9900';
  if (colorMap.green.includes(rowIdx+1)) return '#00ff00';
  if (colorMap.red.includes(rowIdx+1)) return '#ff0000';
  return null;
}

async function generateChainThunderDmgReductionChart() {
  const data = CHAIN_THUNDER_DMG_REDUCTION;
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
    const color = getRowColor(r);
    for (let c = 0; c < data.headers.length; c++) {
      ctx2.fillStyle = rowBg;
      ctx2.fillRect(rx, y, colWidths[c], baseRowHeight);
      ctx2.strokeStyle = borderColor;
      ctx2.strokeRect(rx, y, colWidths[c], baseRowHeight);
      ctx2.fillStyle = color || textColor;
      ctx2.textAlign = 'center';
      ctx2.textBaseline = 'middle';
      ctx2.fillText(String(data.rows[r][c] || ''), rx + colWidths[c] / 2, y + baseRowHeight / 2);
      rx += colWidths[c];
    }
    y += baseRowHeight;
  }

  return canvas.toBuffer('image/png');
}

module.exports = { generateChainThunderDmgReductionChart };
