// Avg Bullets to Stack Shock Chart (Chain Lightning)
const { createCanvas } = require('canvas');
const style = require('./style.js');

const AVG_BULLETS_TO_STACK_SHOCK = {
  title: 'Avg Bullets to Stack 5 Shocks',
  headers: [
    'Chance', '10%', '15%', '20%', '25%', '30%', '35%'
  ],
  rows: [
    ['5.0%', 1667, 1111, 833, 667, 556, 476],
    ['6.5%', 1282, 855, 641, 513, 427, 366],
    ['8.0%', 1042, 694, 521, 417, 347, 298],
    ['9.5%', 877, 585, 439, 351, 292, 251],
    ['11.0%', 758, 505, 379, 303, 253, 216],
    ['12.5%', 667, 444, 333, 267, 222, 190],
    ['14.0%', 595, 397, 298, 238, 198, 170],
    ['15.5%', 538, 358, 269, 215, 179, 154],
    ['17.0%', 490, 327, 245, 196, 163, 140],
    ['18.5%', 450, 300, 225, 180, 150, 129],
    ['20.0%', 417, 278, 208, 167, 139, 119],
    ['21.5%', 388, 258, 194, 155, 129, 111],
    ['23.0%', 362, 242, 181, 145, 121, 104],
    ['24.5%', 340, 227, 170, 136, 113, 97],
    ['26.0%', 321, 214, 160, 128, 107, 92],
    ['27.5%', 303, 202, 152, 121, 101, 87],
    ['29.0%', 287, 192, 144, 115, 96, 82],
    ['30.5%', 273, 182, 137, 109, 91, 78],
    ['32.0%', 260, 174, 130, 104, 87, 74],
    ['33.5%', 249, 166, 124, 100, 83, 71],
    ['35.0%', 238, 159, 119, 95, 79, 68],
    ['36.5%', 228, 152, 114, 91, 76, 65],
    ['38.0%', 219, 146, 110, 88, 73, 63],
    ['39.5%', 211, 141, 105, 84, 70, 60],
    ['41.0%', 203, 136, 102, 81, 68, 58],
    ['42.5%', 196, 131, 98, 78, 65, 56],
  ]
};


async function generateAvgBulletsToStackShockChart() {
  const data = AVG_BULLETS_TO_STACK_SHOCK;
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
  const MAX_HEADER_WIDTH = 90;
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

module.exports = { generateAvgBulletsToStackShockChart };
