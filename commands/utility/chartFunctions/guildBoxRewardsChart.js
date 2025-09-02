// Guild Box Rewards Chart
const { createCanvas } = require('canvas');
const style = require('./style.js');

// Data from provided image
const GUILD_BOX_REWARDS = {
  title: 'Guild Box Rewards',
  headers: [
    'Reward', '100 Box', '250 Box', '500 Box', '750 Box', 'Total', 'Tier'
  ],
  rows: [
    ['', '25', '50', '75', '125', '275', '1'],
    ['', '100', '200', '300', '500', '1.1k', '2'],
    ['', '1k', '2k', '3k', '5k', '11k', '3'],
    ['', '10k', '20k', '30k', '50k', '110k', '4'],
    ['', '25k', '50k', '75k', '125k', '275k', '5'],
    ['', '80k', '160k', '240k', '400k', '880k', '6'],
    ['', '250k', '500k', '750k', '1.25M', '2.75M', '7'],
    ['', '500k', '1M', '1.5M', '2.5M', '5.5M', '8'],
    ['Coins', '1M', '2M', '3M', '5M', '11M', '9'],
    ['', '3M', '6M', '9M', '15M', '33M', '10'],
    ['', '5M', '10M', '15M', '25M', '55M', '11'],
    ['', '8M', '16M', '24M', '40M', '88M', '12'],
    ['', '15M', '30M', '45M', '75M', '165M', '13'],
    ['', '30M', '60M', '90M', '150M', '330M', '14'],
    ['', '75M', '150M', '225M', '375M', '825M', '15'],
    ['', '150M', '300M', '450M', '750M', '1.45B', '16'],
    ['', '300M', '600M', '900M', '1.5B', '3.3B', '17'],
    ['', '500M', '1B', '1.5B', '2.5B', '5.5B', '18'],
    ['Gems', '5', '10', '15', '30', '60', ''],
    ['Tokens', '10', '20', '40', '80', '150', ''],
    ['Bits', '10', '25', '50', '100', '185', '']
  ],
  // Color map for numbers (by row index and col index)
  colorMap: {
    // Cyan: 1k-1M, Magenta: 1.25M-1.5B, Green: 2.5M-5.5B
    cyan: [2,3,4,5,6,7,8,9,10,11],
    magenta: [12,13,14,15,16],
    green: [17]
  }
};

function getCellColor(value) {
  // Color logic: check for k, M, or B
  if (typeof value !== 'string') return '#e6e6e6';
  if (value === 'Bits') return '#e6e6e6'; // Don't color the Bits label
  if (value.includes('k')) return '#038cfc'; // cyan for thousands
  if (value.includes('M')) return '#ff00ff'; // magenta for millions
  if (value.includes('B')) return '#7fff7f'; // green for billions
  return '#e6e6e6';
}

async function generateGuildBoxRewardsChart() {
  const data = GUILD_BOX_REWARDS;
  // Use global style variables
  const font = style.font;
  const headerFont = style.headerFont;
  const cellFont = style.cellFont;
  const headerCellFont = style.headerCellFont;
  const cellPadding = style.cellPadding;
  const baseRowHeight = style.baseRowHeight;
  const headerRowHeight = 36; // Not in style.js, keep as is for now
  const margin = style.margin;
  const borderColor = style.borderColor;
  const headerBg = style.headerBg;
  const headerText = style.headerText;
  const evenRowBg = style.evenRowBg;
  const oddRowBg = style.oddRowBg;
  const textColor = style.textColor;

  // Calculate column widths
  const ctx = createCanvas(10, 10).getContext('2d');
  ctx.font = cellFont;
  const colWidths = data.headers.map((header, i) => {
    let max = ctx.measureText(header).width;
    for (const row of data.rows) {
      max = Math.max(max, ctx.measureText(row[i] || '').width);
    }
    return max + cellPadding * 2;
  });
  const tableWidth = colWidths.reduce((a, b) => a + b, 0);
  const tableHeight = headerRowHeight + data.rows.length * baseRowHeight;
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
  // Header row
  ctx2.font = headerCellFont;
  let hx = x;
  for (let i = 0; i < data.headers.length; i++) {
    ctx2.fillStyle = headerBg;
    ctx2.fillRect(hx, y, colWidths[i], headerRowHeight);
    ctx2.strokeStyle = borderColor;
    ctx2.strokeRect(hx, y, colWidths[i], headerRowHeight);
    ctx2.fillStyle = headerText;
    ctx2.textAlign = 'center';
    ctx2.textBaseline = 'middle';
    ctx2.fillText(data.headers[i], hx + colWidths[i] / 2, y + headerRowHeight / 2);
    hx += colWidths[i];
  }
  y += headerRowHeight;

  // Data rows with vertical span for Coins
  ctx2.font = cellFont;
  const coinsStart = 0; // first row to span (0-based)
  const coinsEnd = 18;  // last row to span (exclusive)
  const coinsSpanRows = coinsEnd - coinsStart;
  for (let r = 0; r < data.rows.length; r++) {
    let rx = x;
    // Only the spanned Coins cell gets the black background; all other rows alternate as usual
    const rowBg = (r % 2 === 0 ? evenRowBg : oddRowBg);
    // Column 0: span for Coins
    if (r === coinsStart) {
      ctx2.fillStyle = oddRowBg;
      ctx2.fillRect(rx, y, colWidths[0], baseRowHeight * coinsSpanRows);
      ctx2.strokeStyle = borderColor;
      ctx2.strokeRect(rx, y, colWidths[0], baseRowHeight * coinsSpanRows);
      ctx2.fillStyle = textColor;
      ctx2.textAlign = 'center';
      ctx2.textBaseline = 'middle';
      ctx2.save();
      ctx2.font = 'bold 16px Arial';
      ctx2.fillText('Coins', rx + colWidths[0] / 2, y + (baseRowHeight * coinsSpanRows) / 2);
      ctx2.restore();
    }
    // Only draw column 0 for non-spanned rows
    if (r < coinsStart || r >= coinsEnd) {
      ctx2.fillStyle = rowBg;
      ctx2.fillRect(rx, y, colWidths[0], baseRowHeight);
      ctx2.strokeStyle = borderColor;
      ctx2.strokeRect(rx, y, colWidths[0], baseRowHeight);
      let cellValue = data.rows[r][0] || '';
      ctx2.fillStyle = getCellColor(cellValue);
      ctx2.textAlign = 'center';
      ctx2.textBaseline = 'middle';
      // Make Gems, Tokens, Bits label bold in the first column ONLY for the label, not the row data
      if (["Gems", "Tokens", "Bits"].includes(cellValue)) {
        ctx2.save();
        ctx2.font = 'bold 15px Arial';
        ctx2.fillText(cellValue, rx + colWidths[0] / 2, y + baseRowHeight / 2);
        ctx2.restore();
      } else {
        ctx2.fillText(cellValue, rx + colWidths[0] / 2, y + baseRowHeight / 2);
      }
    }
    rx += colWidths[0];
    // Draw the rest of the columns
    for (let c = 1; c < data.headers.length; c++) {
      ctx2.fillStyle = rowBg;
      ctx2.fillRect(rx, y, colWidths[c], baseRowHeight);
      ctx2.strokeStyle = borderColor;
      ctx2.strokeRect(rx, y, colWidths[c], baseRowHeight);
      let cellValue = data.rows[r][c] || '';
      ctx2.fillStyle = getCellColor(cellValue);
      ctx2.textAlign = 'center';
      ctx2.textBaseline = 'middle';
      // Bold all tier numbers (last column, if value is not empty)
      if (c === data.headers.length - 1 && cellValue && !isNaN(Number(cellValue))) {
        ctx2.save();
        ctx2.font = 'bold 15px Arial';
        ctx2.fillText(cellValue, rx + colWidths[c] / 2, y + baseRowHeight / 2);
        ctx2.restore();
      } else {
        ctx2.fillText(cellValue, rx + colWidths[c] / 2, y + baseRowHeight / 2);
      }
      rx += colWidths[c];
    }
    y += baseRowHeight;
  }

  return canvas.toBuffer('image/png');
}

module.exports = { generateGuildBoxRewardsChart };
