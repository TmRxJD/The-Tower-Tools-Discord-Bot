// Wave Accelerator Mastery: Spawn Rates Chart Generator

const { createCanvas } = require('canvas');
const style = require('./style');

// Headers and subheaders for proper spanning
const HEADERS = [
  { label: 'Spawn Rate Reduction', span: 11 }
];
const SUBHEADERS = [
  'Normal', '10.00%', '20.00%', '30.00%', '40.00%', '50.00%', '60.00%', '70.00%', '80.00%', '90.00%', '100.00%'
];
const ROWS = [
  [37, 1000, 909, 833, 769, 714, 667, 625, 588, 556, 526, 500],
  [39, 1500, 1364, 1250, 1154, 1071, 1000, 938, 882, 833, 789, 750],
  [40, 2000, 1818, 1667, 1538, 1429, 1333, 1250, 1176, 1111, 1053, 1000],
  [42, 2500, 2273, 2083, 1923, 1786, 1667, 1563, 1471, 1389, 1316, 1250],
  [44, 3000, 2727, 2500, 2308, 2143, 2000, 1875, 1765, 1667, 1579, 1500],
  [46, 3500, 3182, 2917, 2692, 2500, 2333, 2188, 2059, 1944, 1842, 1750],
  [48, 4000, 3636, 3333, 3077, 2857, 2667, 2500, 2353, 2222, 2105, 2000],
  [49, 4500, 4091, 3750, 3462, 3214, 3000, 2813, 2647, 2500, 2368, 2250],
  [50, 5000, 4545, 4167, 3846, 3571, 3333, 3125, 2941, 2778, 2632, 2500],
  [52, 5500, 5000, 4583, 4231, 3929, 3667, 3438, 3235, 3056, 2895, 2750],
  [54, 6000, 5455, 5000, 4615, 4286, 4000, 3750, 3529, 3333, 3158, 3000],
  [56, 6500, 5909, 5417, 5000, 4643, 4333, 4063, 3824, 3611, 3421, 3250],
];

const FOOTER_TEXT =
  `Each column shows the wave you need to reach to achieve the spawn count shown in the leftmost column.\n
  The header is the amount of spawn rate reduction from the mastery.`;

async function generateWaveAcceleratorSpawnRatesChart() {
  // --- Chart style (matches other mastery charts) ---
  const rowHeight = style.baseRowHeight;
  const font = style.font;
  const headerFont = style.headerCellFont;
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
    if (typeof h === 'object' && h.span) {
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
  ctx.fillStyle = oddRowBg;
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
    const label = HEADERS[i].label;
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

module.exports = { generateWaveAcceleratorSpawnRatesChart };
