// CF+ Rotation Rates Chart Generator
// Credits: Priesten, Tremnen, yournicknm
// Documents rotation and orbiting times of varying CF+ upgrades
// Category: Ultimate Weapons > Chronofield > CF+ Rotation Rates

const { createCanvas } = require('canvas');
const style = require('./style');

const TITLE = 'CF+ Rotation Rates';
const FOOTER = 'Credits: @priesten / @Tremnen / @yournicknm';
const DESCRIPTION = `CF+ exerts a tangental force on enemies within CF Range,\ncausing them to spiral around the tower as they approach.\n\nThe rotation rate stated in-game for each CF+ level is the theta\nvalue (θ), or the distance measured in radians traveled per 2 seconds.\n\nWith low enough enemy speeds, enemies will appear to be\nperpetually in orbit around the tower, having faster orbital\ncycles with higher CF+ levels`;

const HEADERS = [
  'CF+ Level',
  'Rotation Rate\n(radians per 2 seconds)',
  'Rotation Rate\n(degrees per second)',
  'Full Orbit Time'
];
const DATA = [
  ['0', '0.10', '2.86°', '125.7 seconds'],
  ['1', '0.15', '4.30°', '83.8 seconds'],
  ['2', '0.20', '5.73°', '62.9 seconds'],
  ['3', '0.25', '7.16°', '50.3 seconds'],
  ['4', '0.30', '8.59°', '41.9 seconds'],
  ['5', '0.35', '10.03°', '36 seconds'],
  ['6', '0.40', '11.46°', '31.5 seconds'],
  ['7', '0.45', '12.89°', '28 seconds'],
  ['8', '0.50', '14.32°', '25.2 seconds'],
  ['9', '0.55', '15.76°', '22.9 seconds'],
  ['10', '0.60', '17.19°', '21 seconds'],
  ['11', '0.65', '18.62°', '19.4 seconds'],
  ['12', '0.70', '20.05°', '18 seconds'],
  ['13', '0.75', '21.49°', '16.8 seconds'],
];

async function generateCFPlusRotationRatesChart() {
  // Style
  const font = style.font;
  const headerFont = style.headerCellFont;
  const cellFont = style.cellFont;
  const footerFont = style.footerFont;
  const cellPadding = style.cellPadding;
  const rowHeight = style.baseRowHeight;
  const margin = style.margin;
  const borderColor = style.borderColor;
  const headerBg = style.headerBg;
  const headerText = style.headerText;
  const evenRowBg = style.evenRowBg;
  const oddRowBg = style.oddRowBg;
  const textColor = style.textColor;
  const footerBg = style.footerBg;
  const footerColor = style.footerColor;

  // Calculate column widths
  const ctx = createCanvas(10, 10).getContext('2d');
  ctx.font = headerFont;
  const colWidths = HEADERS.map((header, i) => {
    let max = 0;
    for (const part of String(header).split('\n')) {
      max = Math.max(max, ctx.measureText(part).width);
    }
    ctx.font = cellFont;
    for (const row of DATA) {
      max = Math.max(max, ctx.measureText(row[i]).width);
    }
    return Math.ceil(max) + cellPadding * 2;
  });
  const tableWidth = colWidths.reduce((a, b) => a + b, 0);
  const width = tableWidth + margin * 2;

  // Calculate heights
  ctx.font = headerFont;
  const headerHeight = rowHeight;
  ctx.font = cellFont;
  const dataHeight = DATA.length * rowHeight;
  ctx.font = footerFont;
  const descLines = DESCRIPTION.split('\n');
  const descHeight = descLines.length * 20 + 10;
  const footerHeight = 30;
  const titleHeight = 44;
  const totalHeight = margin + titleHeight + descHeight + headerHeight + dataHeight + footerHeight + margin;

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

  // Draw data rows
  y += headerHeight;
  ctx2.font = cellFont;
  for (let r = 0; r < DATA.length; r++) {
    x = margin;
    ctx2.textAlign = 'center';
    ctx2.textBaseline = 'middle';
    ctx2.fillStyle = (r % 2 === 0) ? evenRowBg : oddRowBg;
    ctx2.fillRect(margin, y, tableWidth, rowHeight);
    for (let i = 0; i < DATA[r].length; i++) {
      ctx2.strokeStyle = borderColor;
      ctx2.lineWidth = 1;
      ctx2.strokeRect(x, y, colWidths[i], rowHeight);
      ctx2.fillStyle = textColor;
      ctx2.fillText(DATA[r][i], x + colWidths[i] / 2, y + rowHeight / 2);
      x += colWidths[i];
    }
    y += rowHeight;
  }

  // Draw footer
  ctx2.font = footerFont;
  ctx2.fillStyle = footerBg;
  ctx2.fillRect(0, y, width, footerHeight);
  ctx2.fillStyle = footerColor;
  ctx2.textAlign = 'left';
  ctx2.fillText(FOOTER, margin, y + 8);

  return canvas.toBuffer('image/png');
}

module.exports = { generateCFPlusRotationRatesChart };
