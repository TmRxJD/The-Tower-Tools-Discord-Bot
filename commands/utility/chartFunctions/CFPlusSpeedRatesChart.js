// CF+ Speed Rates Chart Generator
// Credits: Priesten, yournicknm
// Documents hidden slow% and enemy speed rates for CF+ upgrades
// Category: Ultimate Weapons > Chronofield > CF+ Speed Rates

const { createCanvas } = require('canvas');
const style = require('./style');

const TITLE = 'CF+ Speed Rates';
const FOOTER = 'Credits: @priesten / @yournicknm';
const DESCRIPTION = `
In addition to the rotational rate, CF+ provides a hidden benefit of reducing enemy speed by a 
percentage, for all enemies within CF Range. This rate of enemy speed reduction increases per CF+ level.

Unlike many of exponential growth stats in The Tower, this slow effect does not suffer diminishing 
returns as CF+ level increases, but instead becomes stronger with each additional level.`;
const FORMULA = 'CF+ Slow Formula: newEnemySpeed = enemySpeed * (1 + (CFPlusLevel * -0.05))';

const HEADERS = [
  'CF+ Level',
  'Hidden CF+ Slow%',
  'Old Enemy Speed',
  'New Enemy Speed',
  'Enemy Speed Rate'
];
const DATA = [
  ['0', '2.5%', '10', '9.75', '2.6% slower'],
  ['1', '5%', '10', '9.5', '5.3% slower'],
  ['2', '10%', '10', '9.0', '11.1% slower'],
  ['3', '15%', '10', '8.5', '17.6% slower'],
  ['4', '20%', '10', '8.0', '25% slower'],
  ['5', '25%', '10', '7.5', '33.3% slower'],
  ['6', '30%', '10', '7.0', '42.9% slower'],
  ['7', '35%', '10', '6.5', '53.8% slower'],
  ['8', '40%', '10', '6.0', '66.7% slower'],
  ['9', '45%', '10', '5.5', '81.8% slower'],
  ['10', '50%', '10', '5.0', '100% slower'],
  ['11', '55%', '10', '4.5', '122.2% slower'],
  ['12', '60%', '10', '4.0', '150% slower'],
  ['13', '65%', '10', '3.5', '185.7% slower'],
];

async function generateCFPlusSpeedRatesChart() {
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
  const formulaHeight = 28;
  const footerHeight = 30;
  const titleHeight = 44;
  const totalHeight = margin + titleHeight + descHeight + headerHeight + dataHeight + formulaHeight + footerHeight + margin;

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

  // Draw formula
  ctx2.font = 'italic 14px Arial';
  ctx2.fillStyle = textColor;
  ctx2.textAlign = 'center';
  ctx2.fillText(FORMULA, width / 2, y + 22);
  y += formulaHeight;

  // Draw footer
  ctx2.font = footerFont;
  ctx2.fillStyle = footerBg;
  ctx2.fillRect(0, y, width, footerHeight);
  ctx2.fillStyle = footerColor;
  ctx2.textAlign = 'left';
  ctx2.fillText(FOOTER, margin, y + 8);

  return canvas.toBuffer('image/png');
}

module.exports = { generateCFPlusSpeedRatesChart };
