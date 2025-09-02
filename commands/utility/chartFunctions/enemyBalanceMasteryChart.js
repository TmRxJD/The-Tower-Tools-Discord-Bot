// Enemy Balance Mastery Chart Generator (with proper header spanning and alignment)
const { createCanvas } = require('canvas');
const style = require('./style.js');

// Headers and subheaders for proper spanning
const HEADERS = [
  { label: 'Chance of x2 Elite Spawn', span: 2 },
  { label: '# of Elites Spawned', span: 3 },
  { label: 'Avg # of Elite Kills/Wave', span: 2 }
];
const SUBHEADERS = [
  'Lab #', 'Chance %', '2', '3', '4', 'Ray/Vamp', 'Scatters'
];
const ROWS = [
  ['no EB mastery', '0%', '100%', '0%', '0%', '2.00', '62.0'],
  ['lab 0', '6%', '88%', '11%', '0%', '2.12', '65.7'],
  ['lab 1', '12%', '77%', '21%', '1%', '2.24', '69.4'],
  ['lab 2', '18%', '67%', '30%', '3%', '2.36', '73.2'],
  ['lab 3', '24%', '58%', '36%', '6%', '2.48', '76.9'],
  ['lab 4', '30%', '49%', '42%', '9%', '2.60', '80.6'],
  ['lab 5', '36%', '41%', '46%', '13%', '2.72', '84.3'],
  ['lab 6', '42%', '34%', '49%', '16%', '2.84', '88.0'],
  ['lab 7', '48%', '27%', '50%', '23%', '2.96', '91.8'],
  ['lab 8', '54%', '21%', '50%', '29%', '3.08', '95.5'],
  ['lab 9', '60%', '16%', '48%', '36%', '3.20', '99.2'],
];

const FOOTER_TEXT =
  'When elites spawn they spawn 2, 3, or 4 identical elites after you reach the spawn rate cap. Each scatter elite counts for 31 kills toward GT+, so when a scatter spawns you will get 62, 93, or 124 kills toward GT+ that wave.';

async function generateEnemyBalanceMasteryChart() {
  // Use global style variables
  const rowHeight = style.baseRowHeight;
  const font = style.font;
  const headerFont = style.headerFont;
  const cellPadding = style.cellPadding;
  const borderColor = style.borderColor;
  const headerBg = style.headerBg;
  const headerText = style.headerText;
  const evenRowBg = style.evenRowBg;
  const oddRowBg = style.oddRowBg;
  const textColor = style.textColor;
  const footerFont = style.footerFont;
  const footerBg = style.footerBg;
  const footerColor = style.footerColor;

  // Calculate column widths for subheaders
  const colCount = SUBHEADERS.length;
  const ctxMeasure = createCanvas(1, 1).getContext('2d');
  ctxMeasure.font = headerFont;
  const colWidths = Array(colCount).fill(0);
  for (let c = 0; c < colCount; c++) {
    let maxWidth = 0;
    // Check subheader
    ctxMeasure.font = headerFont;
    const sub = SUBHEADERS[c] || '';
    for (const line of String(sub).split('\n')) {
      maxWidth = Math.max(maxWidth, ctxMeasure.measureText(line).width);
    }
    // Check all data rows
    ctxMeasure.font = font;
    for (let r = 0; r < ROWS.length; r++) {
      const cell = ROWS[r][c] || '';
      for (const line of String(cell).split('\n')) {
        maxWidth = Math.max(maxWidth, ctxMeasure.measureText(line).width);
      }
    }
    colWidths[c] = Math.ceil(maxWidth) + cellPadding * 2;
  }
  // For header row, calculate merged cell widths
  const headerColWidths = [];
  let ci = 0;
  for (const h of HEADERS) {
    if (typeof h === 'string') {
      headerColWidths.push(colWidths[ci]);
      ci++;
    } else if (typeof h === 'object' && h.span) {
      let spanWidth = 0;
      for (let j = 0; j < h.span; j++) {
        spanWidth += colWidths[ci];
        ci++;
      }
      headerColWidths.push(spanWidth);
    }
  }
  const tableWidth = colWidths.reduce((a, b) => a + b, 0);
  const tableHeight = rowHeight * (2 + ROWS.length);
  // Footer sizing
  ctxMeasure.font = footerFont;
  const footerLines = FOOTER_TEXT.match(/.{1,90}(\s|$)/g) || [FOOTER_TEXT];
  const footerHeight = footerLines.length * 20 + 10;
  // Canvas size
  const width = tableWidth;
  const height = tableHeight + footerHeight + 20;

  // --- Draw ---
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  // Background
  ctx.fillStyle = '#181a20';
  ctx.fillRect(0, 0, width, height);
  // Header row (merged cells)
  let y = 0;
  let x = 0;
  ctx.font = headerFont;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < HEADERS.length; i++) {
    ctx.fillStyle = headerBg;
    ctx.fillRect(x, y, headerColWidths[i], rowHeight);
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, headerColWidths[i], rowHeight);
    ctx.fillStyle = headerText;
    const label = typeof HEADERS[i] === 'string' ? HEADERS[i] : HEADERS[i].label;
    for (const line of String(label).split('\n')) {
      ctx.fillText(line, x + headerColWidths[i] / 2, y + rowHeight / 2);
    }
    x += headerColWidths[i];
  }
  // Subheader row
  y += rowHeight;
  x = 0;
  for (let c = 0; c < colCount; c++) {
    ctx.fillStyle = headerBg;
    ctx.fillRect(x, y, colWidths[c], rowHeight);
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, colWidths[c], rowHeight);
    ctx.fillStyle = headerText;
    ctx.font = headerFont;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const line of String(SUBHEADERS[c]).split('\n')) {
      ctx.fillText(line, x + colWidths[c] / 2, y + rowHeight / 2);
    }
    x += colWidths[c];
  }
  // Data rows
  y += rowHeight;
  for (let r = 0; r < ROWS.length; r++) {
    x = 0;
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = (r % 2 === 0) ? evenRowBg : oddRowBg;
    ctx.fillRect(0, y, width, rowHeight);
    for (let c = 0; c < colCount; c++) {
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, colWidths[c], rowHeight);
      ctx.fillStyle = textColor;
      const cell = ROWS[r][c] || '';
      for (const line of String(cell).split('\n')) {
        ctx.fillText(line, x + colWidths[c] / 2, y + rowHeight / 2);
      }
      x += colWidths[c];
    }
    y += rowHeight;
  }
  // Footer
  ctx.font = footerFont;
  ctx.fillStyle = footerBg;
  ctx.fillRect(0, y, width, footerHeight);
  ctx.fillStyle = footerColor;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  let fy = y + 6;
  for (const line of footerLines) {
    ctx.fillText(line.trim(), 12, fy);
    fy += 20;
  }
  return canvas.toBuffer();
}

module.exports = { generateEnemyBalanceMasteryChart };