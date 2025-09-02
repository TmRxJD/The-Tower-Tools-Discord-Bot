// Wave Skip Multi-Skip Chances Chart Generator
// Category: Masteries/Cards > Wave Skip > Multi-Skip Chances
// Shows the probability of different multi-skips with Maxed Wave Skip card, WS#0, and WS#9.

const { createCanvas } = require('canvas');
const style = require('./style');

const TITLE = 'Wave Skip Multi-Skip Chances';
const DESCRIPTION = 'Probability of different multi-skips with Maxed Wave Skip card, WS#0, and WS#9.';

// Table columns and data (from provided image)
const HEADERS = [
  'Base Card No Mastery',
  'Base Card + Mastery Unlock',
  'Base Card + Maxed Mastery'
];
const SUBHEADERS = [
  '19% chance, no mastery',
  '19% chance, 10% mastery',
  '19% chance, 55% mastery'
];
const DATA = [
  // Each subarray: [No Mastery, Mastery Unlock, Maxed Mastery]
  ['8 skips: (0.0001%)',  '10 skips: (0.0001%)',  '13 skips: (0.0001%)'],
  ['7 skips: (0.0007%)',  '9 skips: (0.0002%)',   '12 skips: (0.00029%)'],
  ['6 skips: (0.0038%)',  '8 skips: (0.0009%)',   '11 skips: (0.00074%)'],
  ['5 skips: (0.0201%)',  '7 skips: (0.0035%)',   '10 skips: (0.0023%)'],
  ['4 skips: (0.1056%)',  '6 skips: (0.0143%)',   '9 skips: (0.0054%)'],
  ['3 skips: (0.5556%)',  '5 skips: (0.0576%)',   '8 skips: (0.0171%)'],
  ['2 skips: (2.9241%)',  '4 skips: (0.2335%)',   '7 skips: (0.0374%)'],
  ['1 skips: (15.3900%)', '3 skips: (0.9314%)',   '6 skips: (0.1335%)'],
  ['0 skips: (81.00%)',   '2 skips: (3.9075%)',   '5 skips: (0.2484%)'],
  ['',                   '1 skips: (13.8510%)',  '4 skips: (1.0745%)'],
  ['',                   '0 skips: (81.0000%)',  '3 skips: (1.4981%)'],
  ['',                   '',                     '2 skips: (9.0566%)'],
  ['',                   '',                     '1 skips: (6.9255%)'],
  ['',                   '',                     '0 skips: (81.0000%)'],
];

async function generateWaveSkipMultiSkipChanceChart() {
  // Style
  const font = style.font;
  const headerFont = style.headerCellFont;
  const cellFont = style.cellFont;
  const cellPadding = style.cellPadding;
  const rowHeight = style.baseRowHeight;
  const margin = style.margin;
  const borderColor = style.borderColor;
  const headerBg = style.headerBg;
  const headerText = style.headerText;
  const evenRowBg = style.evenRowBg;
  const oddRowBg = style.oddRowBg;
  const textColor = style.textColor;

  // Calculate column widths
  const ctx = createCanvas(10, 10).getContext('2d');
  ctx.font = headerFont;
  const colWidths = HEADERS.map((header, i) => {
    let max = 0;
    // Header
    for (const part of String(header).split('\n')) {
      max = Math.max(max, ctx.measureText(part).width);
    }
    // Subheader
    ctx.font = cellFont;
    max = Math.max(max, ctx.measureText(SUBHEADERS[i]).width);
    // Data
    for (const row of DATA) {
      if (row[i]) max = Math.max(max, ctx.measureText(row[i]).width);
    }
    return Math.ceil(max) + cellPadding * 2;
  });
  const tableWidth = colWidths.reduce((a, b) => a + b, 0);
  const width = tableWidth + margin * 2;

  // Calculate heights
  ctx.font = headerFont;
  const headerHeight = rowHeight;
  ctx.font = cellFont;
  const subheaderHeight = rowHeight - 4;
  const dataRows = DATA.length;
  const dataHeight = dataRows * rowHeight;
  const descLines = DESCRIPTION.split('\n');
  const descHeight = descLines.length * 20 + 10;
  const titleHeight = 44;
  const totalHeight = margin + titleHeight + descHeight + headerHeight + subheaderHeight + dataHeight + margin;

  // Create canvas
  const canvas = createCanvas(width, totalHeight);
  const ctx2 = canvas.getContext('2d');
  ctx2.fillStyle = oddRowBg;
  ctx2.fillRect(0, 0, width, totalHeight);

  // Draw title
  ctx2.font = 'bold 22px Arial';
  ctx2.fillStyle = headerText;
  ctx2.textAlign = 'center';
  ctx2.textBaseline = 'top';
  ctx2.fillText(TITLE, width / 2, margin / 2);

  // Draw description
  ctx2.font = cellFont;
  ctx2.fillStyle = textColor;
  ctx2.textAlign = 'left';
  let descY = margin / 2 + titleHeight;
  for (const line of descLines) {
    ctx2.fillText(line, margin, descY);
    descY += 20;
  }

  // Draw table headers
  let x = margin;
  let y = margin / 2 + titleHeight + descHeight;
  ctx2.font = headerFont;
  ctx2.textAlign = 'center';
  ctx2.textBaseline = 'middle';
  for (let i = 0; i < HEADERS.length; i++) {
    ctx2.fillStyle = headerBg;
    ctx2.fillRect(x, y, colWidths[i], headerHeight);
    ctx2.strokeStyle = borderColor;
    ctx2.lineWidth = 1;
    ctx2.strokeRect(x, y, colWidths[i], headerHeight);
    ctx2.fillStyle = headerText;
    // Multi-line header support
    const headerParts = String(HEADERS[i]).split('\n');
    for (let j = 0; j < headerParts.length; j++) {
      ctx2.fillText(headerParts[j], x + colWidths[i] / 2, y + (headerHeight / 2) + (j - (headerParts.length-1)/2) * 12);
    }
    x += colWidths[i];
  }

  // Draw subheaders
  x = margin;
  y += headerHeight;
  ctx2.font = cellFont;
  ctx2.textAlign = 'center';
  ctx2.textBaseline = 'middle';
  for (let i = 0; i < SUBHEADERS.length; i++) {
    ctx2.fillStyle = evenRowBg;
    ctx2.fillRect(x, y, colWidths[i], subheaderHeight);
    ctx2.strokeStyle = borderColor;
    ctx2.lineWidth = 1;
    ctx2.strokeRect(x, y, colWidths[i], subheaderHeight);
    ctx2.fillStyle = textColor;
    ctx2.fillText(SUBHEADERS[i], x + colWidths[i] / 2, y + subheaderHeight / 2);
    x += colWidths[i];
  }

  // Draw data rows
  y += subheaderHeight;
  ctx2.font = cellFont;
  for (let r = 0; r < DATA.length; r++) {
    x = margin;
    ctx2.textAlign = 'center';
    ctx2.textBaseline = 'middle';
    ctx2.fillStyle = (r % 2 === 0) ? evenRowBg : oddRowBg;
    ctx2.fillRect(margin, y, tableWidth, rowHeight);
    for (let i = 0; i < HEADERS.length; i++) {
      ctx2.strokeStyle = borderColor;
      ctx2.lineWidth = 1;
      ctx2.strokeRect(x, y, colWidths[i], rowHeight);
      ctx2.fillStyle = textColor;
      if (DATA[r][i]) {
        ctx2.fillText(DATA[r][i], x + colWidths[i] / 2, y + rowHeight / 2);
      }
      x += colWidths[i];
    }
    y += rowHeight;
  }

  return canvas.toBuffer('image/png');
}

module.exports = { generateWaveSkipMultiSkipChanceChart };
