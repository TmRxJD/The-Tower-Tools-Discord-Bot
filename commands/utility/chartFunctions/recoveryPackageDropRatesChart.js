// Recovery Package Chance (Care Package) Mastery: Drop Rates Chart Generator

const { createCanvas } = require('canvas');
const style = require('./style');

const HEADERS = [
  { label: '', span: 14 }
];

const TITLE = [
  { label: 'Recovery Package Chance Expected Shards', span: 14 }
];
const SUBHEADERS = [
    { label: 'Shatter\nShards', span: 2 },
    { label: 'No\nRPC+', span: 1 },
    { label: '0', span: 1 },
    { label: '1', span: 1 },
    { label: '2', span: 1 },
    { label: '3', span: 1 },
    { label: '4', span: 1 },
    { label: '5', span: 1 },
    { label: '6', span: 1 },
    { label: '7', span: 1 },
    { label: '8', span: 1 },
    { label: '9', span: 1 }
];
const SUBSUBHEADERS = [
  'Level', 'Value', '0.0%', '0.4%', '0.8%', '1.2%', '1.6%', '2.0%', '2.4%', '2.8%', '3.2%', '3.6%', '4.0%'
];

const ROWS_15000 = [
  [0, 1.0, 1140, 1344, 1547, 1751, 1955, 2158, 2362, 2565, 2769, 2973, 3176],
  [1, 1.2, 1230, 1474, 1719, 1963, 2207, 2452, 2696, 2941, 3185, 3429, 3674],
  [2, 1.4, 1320, 1605, 1890, 2175, 2460, 2745, 3031, 3316, 3601, 3886, 4171],
  [3, 1.6, 1410, 1736, 2062, 2387, 2713, 3039, 3365, 3691, 4017, 4342, 4668],
  [4, 1.8, 1500, 1867, 2233, 2600, 2966, 3333, 3699, 4066, 4432, 4799, 5165],
  [5, 2.0, 1590, 1997, 2405, 2812, 3219, 3626, 4034, 4441, 4848, 5255, 5663],
];
const ROWS_10000 = [
  [0, 1.0, 990, 1126, 1262, 1397, 1533, 1669, 1805, 1940, 2076, 2212, 2348],
  [1, 1.2, 1050, 1213, 1376, 1539, 1702, 1865, 2027, 2190, 2353, 2516, 2679],
  [2, 1.4, 1110, 1300, 1490, 1680, 1870, 2060, 2250, 2440, 2630, 2821, 3011],
  [3, 1.6, 1170, 1387, 1604, 1822, 2039, 2256, 2473, 2690, 2908, 3125, 3342],
  [4, 1.8, 1230, 1474, 1719, 1963, 2207, 2452, 2696, 2941, 3185, 3429, 3674],
  [5, 2.0, 1290, 1562, 1833, 2105, 2376, 2648, 2919, 3191, 3462, 3734, 4005],
];

const FOOTER_TEXT =
    `Each table shows the number of shards received per day for a given Shatter Lab level and RPC mastery level, for 15,000 and 10,000 waves.\n\n

    
  Assumptions:\n
  Maxed Rare/Common Drop labs\n
  Package After Boss Lab done\n
  Shards per Daily Mission = 115\n
  Package Chance = 82%\n
  wave skip = 19%\n`

async function generateRecoveryPackageDropRatesChart() {
  // --- Chart style (matches other mastery charts) ---
  const rowHeight = style.baseRowHeight;
  const font = style.font;
  const headerFont = style.headerCellFont;
  // Tighter dynamic cell padding and max column width
  const minCellPadding = 2;
  const maxCellPadding = 8;
  const maxColWidth = 90;
  const cellPadding = (textWidth) => {
    if (textWidth < 40) return maxCellPadding;
    if (textWidth > 90) return minCellPadding;
    return Math.round(maxCellPadding - (textWidth - 40) * (maxCellPadding - minCellPadding) / (90 - 40));
  };
  const borderColor = style.borderColor;
  const headerBg = style.headerBg;
  const headerText = style.headerText;
  const evenRowBg = style.evenRowBg;
  const oddRowBg = style.oddRowBg;
  const textColor = style.textColor;
  const footerFont = style.footerFont;
  const footerBg = style.footerBg;
  const footerColor = style.footerColor;

  // Calculate column widths based on the widest of subheader, subsubheader, and all data cells, with consistent padding
  const colCount = 13;
  const ctxMeasure = createCanvas(1, 1).getContext('2d');
  const colWidths = Array(colCount).fill(0);
  // For each column, measure the widest content (subsubheader, all data rows). For columns 0 and 1, ignore subheader label width.
  // Also, track the tallest subheader (for multi-line labels) for row height adjustment.
  let subheaderRowHeight = rowHeight;
  ctxMeasure.font = headerFont;
  for (let i = 0, colIdx = 0; i < SUBHEADERS.length; i++) {
    const { label, span } = SUBHEADERS[i];
    const lines = String(label).split('\n');
    subheaderRowHeight = Math.max(subheaderRowHeight, lines.length * 22 + 8); // 22px per line, 8px buffer
    colIdx += span;
  }
  for (let c = 0; c < colCount; c++) {
    let maxWidth = 0;
    // Only use subheader label width for columns 2 and up
    if (c >= 2) {
      ctxMeasure.font = headerFont;
      let sub = SUBHEADERS[c];
      let subLabel = (sub && typeof sub === 'object') ? sub.label : (sub || '');
      for (const line of String(subLabel).split('\n')) {
        maxWidth = Math.max(maxWidth, ctxMeasure.measureText(line).width);
      }
    }
    // Subsubheader
    ctxMeasure.font = font;
    let subsub = SUBSUBHEADERS[c] || '';
    maxWidth = Math.max(maxWidth, ctxMeasure.measureText(subsub).width);
    // Data rows (15000)
    for (let r = 0; r < ROWS_15000.length; r++) {
      let cell = ROWS_15000[r][c];
      let cellStr = (cell === undefined || cell === null) ? '' : String(cell);
      maxWidth = Math.max(maxWidth, ctxMeasure.measureText(cellStr).width);
    }
    // Data rows (10000)
    for (let r = 0; r < ROWS_10000.length; r++) {
      let cell = ROWS_10000[r][c];
      let cellStr = (cell === undefined || cell === null) ? '' : String(cell);
      maxWidth = Math.max(maxWidth, ctxMeasure.measureText(cellStr).width);
    }
    // Add consistent padding (6px left + 6px right)
    colWidths[c] = Math.ceil(maxWidth) + 12;
  }
  // No artificial max/min width, no buffer, just exact fit
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
  const titleHeight = 48;
  const sectionLabelHeight = 32; // Height for the '15000 waves' and '10000 waves' labels
  // Calculate table height: 2 section labels, 2x subheader, subsubheader, data rows
  const tableHeight =
    (sectionLabelHeight + subheaderRowHeight + rowHeight + ROWS_15000.length * rowHeight) +
    (sectionLabelHeight + subheaderRowHeight + rowHeight + ROWS_10000.length * rowHeight);
  // Footer sizing (no extra buffer)
  ctxMeasure.font = footerFont;
  const footerLines = FOOTER_TEXT.match(/.{1,90}(\s|$)/g) || [FOOTER_TEXT];
  const footerHeight = footerLines.length * 20; // 20px per line, no buffer
  // Canvas size (no extra buffer)
  const width = tableWidth;
  const height = titleHeight + tableHeight + footerHeight;

  // --- Draw ---
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  // Background
  ctx.fillStyle = style.oddRowBg;
  ctx.fillRect(0, 0, width, height);

  // Draw title
  ctx.font = 'bold 22px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = headerText;
  ctx.fillText('Recovery Package Chance Mastery Expected Shards', width / 2, titleHeight / 2);

  let y = titleHeight;
  // Helper to draw a section (15000 or 10000 waves)
  function drawSection(sectionLabel, rows) {
    // 1. Section label row (centered above the table, not in the table grid)
    ctx.font = 'bold 18px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = headerText;
    ctx.fillText(sectionLabel, width / 2, y + sectionLabelHeight / 2);
    y += sectionLabelHeight;
    // 2. Subheader row (with span support, fixed col index logic, multi-line support)
    x = 0;
    let colIdx = 0;
    for (let i = 0; i < SUBHEADERS.length; i++) {
      const { label, span } = SUBHEADERS[i];
      let spanWidth = 0;
      for (let j = 0; j < span; j++) {
        spanWidth += colWidths[colIdx + j] || 0;
      }
      ctx.fillStyle = headerBg;
      ctx.fillRect(x, y, spanWidth, subheaderRowHeight);
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, spanWidth, subheaderRowHeight);
      ctx.fillStyle = headerText;
      ctx.font = headerFont;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      // Multi-line label support, center horizontally, bottom align
      const lines = String(label).split('\n');
      const totalHeight = lines.length * 22;
      let startY = y + subheaderRowHeight - 6 - (totalHeight - 22); // 6px bottom padding
      for (let li = 0; li < lines.length; li++) {
        ctx.fillText(lines[li], x + spanWidth / 2, startY + li * 22);
      }
      x += spanWidth;
      colIdx += span;
    }
    y += subheaderRowHeight;
    // 3. Subsubheader row
    x = 0;
    for (let c = 0; c < colCount; c++) {
      ctx.fillStyle = headerBg;
      ctx.fillRect(x, y, colWidths[c], rowHeight);
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, colWidths[c], rowHeight);
      ctx.fillStyle = headerText;
      ctx.font = font;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(SUBSUBHEADERS[c], x + colWidths[c] / 2, y + rowHeight / 2);
      x += colWidths[c];
    }
    y += rowHeight;
    // 4. Data rows
    for (let r = 0; r < rows.length; r++) {
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
        let cell = rows[r][c];
        // Show 0 as '0', but undefined/null as blank
        let cellStr = (cell === undefined || cell === null) ? '' : String(cell);
        ctx.fillText(cellStr, x + colWidths[c] / 2, y + rowHeight / 2);
        x += colWidths[c];
      }
      y += rowHeight;
    }
  }

  // Draw both sections
  drawSection('15000 Waves', ROWS_15000);
  drawSection('10000 Waves', ROWS_10000);

  // Footer
  ctx.font = footerFont;
  ctx.fillStyle = footerBg;
  ctx.fillRect(0, y, width, footerHeight);
  ctx.fillStyle = footerColor;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  let fy = y;
  for (const line of footerLines) {
    ctx.fillText(line.trim(), 12, fy);
    fy += 20;
  }
  return canvas.toBuffer();
}

module.exports = { generateRecoveryPackageDropRatesChart };
