// EO vs SLA Breakpoints Chart Generator
// Credit: Yugiohcd10
// Shows breakpoints in coin efficiency of blender vs orbless with SLA and EO#
// Category: masteries > extra orb > EO vs SLA Breakpoints
// Also: Ultimate Weapons > Spotlight > EO vs SLA Breakpoints

const { createCanvas } = require('canvas');
const style = require('./style');

const TITLE = 'EO vs SLA Breakpoints';
const FOOTER = 'By Yugiohcd10';
const DESCRIPTION = `
This is based on Orbless killing all enemies in SL and orbs
tagging 100% of enemies with equal distribution of kills.

EO will be better than this because Elites, Protectors, and
enemies with Orbs/Armored BC are more likely to die in SL.
This may be balanced out due to realistic Orbless efficiencies.`;

const HEADERS = ['Mastery Level', 'Mastery Bonus', 'SL3', 'SL4'];
const DATA = [
  ['EO 0', '1.04', '-', '85'],
  ['EO 1', '1.08', '-', '80'],
  ['EO 2', '1.12', '-', '76'],
  ['EO 3', '1.16', '-', '72'],
  ['EO 4', '1.2', '90', '68'],
  ['EO 5', '1.24', '86', '64'],
  ['EO 6', '1.28', '81', '61'],
  ['EO 7', '1.32', '77', '58'],
  ['EO 8', '1.36', '73', '55'],
  ['EO 9', '1.4', '69', '52'],
];

async function generateEOvsSLABreakpointsChart() {
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
    let max = ctx.measureText(header).width;
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
    ctx2.fillText(HEADERS[i], x + colWidths[i] / 2, y + headerHeight / 2);
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

module.exports = { generateEOvsSLABreakpointsChart };
