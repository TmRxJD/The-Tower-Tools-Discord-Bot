
// Generates the Bot Upgrades and Costs chart for each bot type (Flame, Golden, Thunder, Amplify)
const { createCanvas } = require('canvas');
const style = require('./style.js');

// Data for each bot type (from provided image)
const BOT_UPGRADES_DATA = {
  'Flame Bot': {
    title: 'Flame Bot Upgrades & Costs',
    headers: [
      'Level', 'Medals', 'Damage Reduction', 'Cooldown', 'Damage', 'Range'
    ],
    rows: [
      ['Unlock', '0', '20%', '75s', '50x', '30M'],
      ['1', '100', '23%', '72s', '58x', '34M'],
      ['2', '140', '26%', '69s', '66x', '38M'],
      ['3', '180', '29%', '66s', '74x', '42M'],
      ['4', '220', '32%', '63s', '82x', '46M'],
      ['5', '260', '35%', '60s', '90x', '50M'],
      ['6', '300', '38%', '57s', '98x', '54M'],
      ['7', '340', '41%', '54s', '106x', '58M'],
      ['8', '380', '44%', '51s', '114x', '62M'],
      ['9', '420', '47%', '48s', '122x', '66M'],
      ['10', '460', '50%', '45s', '130x', '70M'],
      ['11', '500', '53%', '42s', '138x', '74M'],
      ['12', '540', '56%', '39s', '146x', '78M'],
      ['13', '580', '59%', '36s', '154x', '82M'],
      ['14', '620', '62%', '33s', '162x', '86M'],
      ['15', '660', '65%', '30s', '170x', '90M'],
      ['16', '700', '68%', '', '178x', ''],
      ['17', '740', '71%', '', '186x', ''],
      ['18', '780', '74%', '', '194x', ''],
      ['19', '820', '77%', '', '204x', ''],
      ['20', '860', '80%', '', '210x', ''],
    ],
    labInfo: [
      ['Lab Name', 'Max Level', 'Max Value'],
      ['Cooldown', '25', '-25s'],
      ['Burn Stack', '5', '+5']
    ]
  },
  'Thunder Bot': {
    title: 'Thunder Bot Upgrades & Costs',
    headers: [
      'Level', 'Medals', 'Duration', 'Cooldown', 'Linger', 'Range'
    ],
    rows: [
      ['Unlock', '0', '5s', '120s', '20%', '25M'],
      ['1', '100', '5.5s', '117s', '23%', '28M'],
      ['2', '140', '6s', '114s', '26%', '31M'],
      ['3', '180', '6.5s', '111s', '29%', '34M'],
      ['4', '220', '7s', '108s', '32%', '37M'],
      ['5', '260', '7.5s', '105s', '35%', '40M'],
      ['6', '300', '8s', '102s', '38%', '43M'],
      ['7', '340', '8.5s', '99s', '41%', '46M'],
      ['8', '380', '9s', '96s', '44%', '49M'],
      ['9', '420', '9.5s', '93s', '47%', '52M'],
      ['10', '460', '10s', '90s', '50%', '55M'],
      ['11', '500', '10.5s', '87s', '53%', '58M'],
      ['12', '540', '11s', '84s', '56%', '61M'],
      ['13', '580', '11.5s', '81s', '59%', '64M'],
      ['14', '620', '12s', '78s', '62%', '67M'],
      ['15', '660', '12.5s', '75s', '65%', '70M'],
      ['16', '700', '13s', '', '68%', ''],
      ['17', '740', '13.5s', '', '71%', ''],
      ['18', '780', '14s', '', '74%', ''],
      ['19', '820', '14.5s', '', '77%', ''],
      ['20', '860', '15s', '', '80%', ''],
    ],
    labInfo: [
      ['Lab Name', 'Max Level', 'Max Value'],
      ['Cooldown', '25', '-25s']
    ]
  },
  'Coin Bot': {
    title: 'Coin Bot Upgrades & Costs',
    headers: [
      'Level', 'Medals', 'Duration', 'Cooldown', 'Bonus', 'Range'
    ],
    rows: [
      ['Unlock', '0', '20s', '120s', '2x', '20M'],
      ['1', '100', '20.5s', '117s', '2.2x', '22M'],
      ['2', '140', '21s', '114s', '2.4x', '24M'],
      ['3', '180', '21.5s', '111s', '2.6x', '26M'],
      ['4', '220', '22s', '108s', '2.8x', '28M'],
      ['5', '260', '22.5s', '105s', '3x', '30M'],
      ['6', '300', '23s', '102s', '3.2x', '32M'],
      ['7', '340', '23.5s', '99s', '3.4x', '34M'],
      ['8', '380', '24s', '96s', '3.6x', '36M'],
      ['9', '420', '24.5s', '93s', '3.8x', '38M'],
      ['10', '460', '25s', '90s', '4x', '40M'],
      ['11', '500', '25.5s', '87s', '4.2x', '42M'],
      ['12', '540', '26s', '84s', '4.4x', '44M'],
      ['13', '580', '26.5s', '81s', '4.6x', '46M'],
      ['14', '620', '27s', '78s', '4.8x', '48M'],
      ['15', '660', '27.5s', '75s', '5x', '50M'],
      ['16', '700', '28s', '', '5.2x', ''],
      ['17', '740', '28.5s', '', '5.4x', ''],
      ['18', '780', '29s', '', '5.6x', ''],
      ['19', '820', '29.5s', '', '5.8x', ''],
      ['20', '860', '30s', '', '6x', ''],
    ],
    labInfo: [
      ['Lab Name', 'Max Level', 'Max Value'],
      ['Duration', '20', '10s'],
      ['Cooldown', '25', '-25s']
    ]
  },
  'Amplify Bot': {
    title: 'Amplify Bot Upgrades & Costs',
    headers: [
      'Level', 'Medals', 'Duration', 'Cooldown', 'Bonus', 'Range'
    ],
    rows: [
      ['Unlock', '0', '20s', '120s', '3.5x', '25M'],
      ['1', '100', '20.5s', '117s', '3.9x', '27M'],
      ['2', '140', '21s', '114s', '4.3x', '29M'],
      ['3', '180', '21.5s', '111s', '4.7x', '31M'],
      ['4', '220', '22s', '108s', '5.1x', '33M'],
      ['5', '260', '22.5s', '105s', '5.5x', '35M'],
      ['6', '300', '23s', '102s', '5.9x', '37M'],
      ['7', '340', '23.5s', '99s', '6.3x', '39M'],
      ['8', '380', '24s', '96s', '6.7x', '41M'],
      ['9', '420', '24.5s', '93s', '7.1x', '43M'],
      ['10', '460', '25s', '90s', '7.5x', '45M'],
      ['11', '500', '25.5s', '87s', '7.9x', '47M'],
      ['12', '540', '26s', '84s', '8.3x', '49M'],
      ['13', '580', '26.5s', '81s', '8.7x', '51M'],
      ['14', '620', '27s', '78s', '9.1x', '53M'],
      ['15', '660', '27.5s', '75s', '9.5x', '55M'],
      ['16', '700', '28s', '', '9.9x', ''],
      ['17', '740', '28.5s', '', '10.3x', ''],
      ['18', '780', '29s', '', '10.7x', ''],
      ['19', '820', '29.5s', '', '11.1x', ''],
      ['20', '860', '30s', '', '11.5x', ''],
    ],
    labInfo: [
      ['Lab Name', 'Max Level', 'Max Value'],
      ['Duration', '20', '10s'],
      ['Cooldown', '25', '-25s']
    ]
  }
};

// Chart rendering function (style matches module substat chart)
async function generateBotUpgradesChart(botType = 'Flame Bot') {
  if (!BOT_UPGRADES_DATA[botType]) throw new Error('Invalid bot type');
  const data = BOT_UPGRADES_DATA[botType];

  // Style (use global style variables)
  
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

  // Calculate column widths with header wrapping
  const ctx = createCanvas(10, 10).getContext('2d');
  ctx.font = cellFont;
  // Helper to wrap text and get max width for a given max line width
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

  // Set a max width for header columns (except for very short headers)
  const MAX_HEADER_WIDTH = 90;
  ctx.font = cellFont;
  const colWidths = data.headers.map((header, i) => {
    // Try wrapping header
    ctx.font = headerCellFont;
    let headerLines = getWrappedLines(header, headerCellFont, MAX_HEADER_WIDTH);
    let headerWidth = Math.max(...headerLines.map(line => ctx.measureText(line).width));
    ctx.font = cellFont;
    let max = headerWidth;
    for (const row of data.rows) {
      max = Math.max(max, ctx.measureText(row[i] || '').width);
    }
    return Math.max(max, headerWidth) + cellPadding * 2;
  });
  const tableWidth = colWidths.reduce((a, b) => a + b, 0);
  const tableHeight = headerRowHeight + data.rows.length * baseRowHeight;
  // Calculate extra height for lab info if present
  let labInfoHeight = 0;
  if (data.labInfo) {
    const labRowHeight = 28;
    const labInfoMargin = 10; // space above lab info
    labInfoHeight = data.labInfo.length * labRowHeight + labInfoMargin;
  }
  const bottomPadding = 36;
  const canvas = createCanvas(
    tableWidth + margin * 2,
    tableHeight + margin * 2 + bottomPadding + labInfoHeight
  );
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
  let headerMaxLines = 1;
  // Precompute wrapped header lines for each column
  const headerWrappedLines = data.headers.map(header => {
    const lines = getWrappedLines(header, headerCellFont, MAX_HEADER_WIDTH);
    headerMaxLines = Math.max(headerMaxLines, lines.length);
    return lines;
  });
  // Use a compact line height for wrapped header text
  const headerLineHeight = 18;
  const headerActualRowHeight = headerMaxLines * headerLineHeight + 8; // 8px vertical padding
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
    // Center the block of lines vertically
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
      ctx2.fillText(data.rows[r][c] || '', rx + colWidths[c] / 2, y + baseRowHeight / 2);
      rx += colWidths[c];
    }
    y += baseRowHeight;
  }

  // Draw lab info if present (as its own table)
  if (data.labInfo) {
    ctx2.font = 'bold 15px Arial';
    ctx2.fillStyle = headerText;
    let labY = y + 10;
    const labRowHeight = 28;
    // Calculate lab col widths (use same as main table if possible, else even split)
    let labColWidths;
    if (data.labInfo[0].length === colWidths.length) {
      labColWidths = colWidths;
    } else {
      // Evenly split the table width
      labColWidths = Array(data.labInfo[0].length).fill(Math.floor((tableWidth) / data.labInfo[0].length));
    }
    // Draw lab info table
    for (let i = 0; i < data.labInfo.length; i++) {
      let labX = x;
      for (let j = 0; j < data.labInfo[i].length; j++) {
        // Cell background
        ctx2.fillStyle = i === 0 ? headerBg : evenRowBg;
        ctx2.fillRect(labX, labY, labColWidths[j], labRowHeight);
        // Cell border
        ctx2.strokeStyle = borderColor;
        ctx2.strokeRect(labX, labY, labColWidths[j], labRowHeight);
        // Text
        ctx2.fillStyle = headerText;
        ctx2.textAlign = 'center';
        ctx2.textBaseline = 'middle';
        ctx2.fillText(data.labInfo[i][j], labX + labColWidths[j] / 2, labY + labRowHeight / 2);
        labX += labColWidths[j];
      }
      labY += labRowHeight;
    }
  }

  return canvas.toBuffer('image/png');
}

module.exports = { generateBotUpgradesChart, BOT_UPGRADES_DATA };
