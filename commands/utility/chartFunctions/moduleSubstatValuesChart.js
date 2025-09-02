// Generates the Module Substat Values chart (by Cannon, Defense, Generator, Core)
const { createCanvas } = require('canvas');
const style = require('./style.js');

// Data for each module type (from the provided image)
const MODULE_SUBSTAT_DATA = {
  Cannon: {
    title: 'Cannon Module Substat Values',
    headers: [
      'Substat', 'Common', 'Rare', 'Epic', 'Legendary', 'Mythic', 'Ancestral'
    ],
    rows: [
      ['Attack Speed', '+0.3', '+0.5', '+0.7', '+1', '+3', '+5'],
      ['Critical Chance', '+2%', '+3%', '+6%', '+8%', '+10%'],
      ['Critical Factor', '+2x', '+4x', '+5x', '+8x', '+12x', '+15x'],
      ['Attack Range', '+2m', '+4m', '+8m', '+12m', '+20m', '+30m'],
      ['Damage / Meter', '+3%', '+5%', '+7%', '+14%', '+20%', '+30%'],
      ['Multishot Chance', '', '+3%', '+5%', '+7%', '+10%', '+13%'],
      ['Multishot Targets', '', '', '+1', '+2', '+3', '+4'],
      ['Rapid Fire Chance', '', '+2%', '+4%', '+6%', '+9%', '+12%'],
      ['Rapid Fire Duration', '', '+0.4s', '+0.8s', '+1.4s', '+2.5s', '+3.5s'],
      ['Bounce Shot Chance', '', '+2%', '+3%', '+5%', '+9%', '+12%'],
      ['Bounce Shot Targets', '', '', '+1', '+2', '+3', '+4'],
      ['Bounce Shot Range', '', '+0.5m', '+0.8m', '+1.2m', '+1.6m', '+2m'],
      ['Super Crit Chance', '', '', '+3%', '+5%', '+7%', '+10%'],
      ['Super Crit Multi', '', '', '+2x', '+3x', '+5x', '+7x'],
      ['Rend Armor Chance', '', '', '', '+2%', '+5%', '+8%'],
      ['Rend Armor Multi', '', '', '', '+2%', '+5%', '+8%'],
      ['Max Rend Armor Multi', '', '', '', '+2x', '+3x', '+5x'],
    ]
  },
  Defense: {
    title: 'Defense Module Substat Values',
    headers: [
      'Substat', 'Common', 'Rare', 'Epic', 'Legendary', 'Mythic', 'Ancestral'
    ],
    rows: [
      ['Health Regen', '+0.2x', '+0.4x', '+0.6x', '+1x', '+2x', '+4x'],
      ['Defense', '+1%', '+2%', '+3%', '+5%', '+6%', '+8%'],
      ['Defense Absolute', '0.15x', '0.25x', '+0.4x', '+1x', '+5x', '+10x'],
      ['Thorns Damage', '', '', '+2%', '+4%', '+7%', '+10%'],
      ['Lifesteal', '', '', '+0.3%', '+0.5%', '+1.5%', '+2%'],
      ['Knockback Chance', '', '', '+2%', '+4%', '+6%', '+9%'],
      ['Knockback Force', '', '', '+0.1', '+0.4', '+0.9', '+1.5'],
      ['Orb Speed', '', '', '+1', '1.5', '+2', '+3'],
      ['Orbs', '', '', '', '', '+1', '+2'],
      ['Shockwave Size', '', '', '+0.1', '+0.3', '+0.7', '+1'],
      ['Shockwave Frequency', '', '', '-1', '-2', '+-3', '-4'],
      ['Land Mine Damage', '', '+0.3x', '+0.5x', '+1.5x', '+5x', '+8x'],
      ['Land Mine Chance', '', '+1.5%', '+3%', '+6%', '+9%', '+12%'],
      ['Land Mine Radius', '', '+0.1', '+0.15', '+0.3', '+0.75', '+1'],
      ['Death Defy', '', '', '', '+1.5%', '+3.5%', '+5%'],
      ['Wall Health', '', '', '+0.2x', '+0.4x', '+0.9x', '+1.2x'],
      ['Wall Rebuild', '', '', '-20s', '-40s', '-60s', '-100s'],
    ]
  },
  Generator: {
    title: 'Generator Module Substat Values',
    headers: [
      'Substat', 'Common', 'Rare', 'Epic', 'Legendary', 'Mythic', 'Ancestral'
    ],
    rows: [
      ['Cash Bonus', '+0.1x', '+0.2x', '+0.3x', '+0.5x', '+1.2x', '+2.5x'],
      ['Cash / Wave', '+30', '+50', '+100', '+200', '+500', '+1000'],
      ['Coins / Kill Bonus', '+0.1x', '+0.2x', '+0.3x', '+0.4x', '+0.5x', '+0.6x'],
      ['Coins / Wave', '+20', '+35', '+60', '+120', '+200', '+350'],
      ['Free Attack Upgrade', '+2%', '+4%', '+6%', '+8%', '+10%', '+12%'],
      ['Free Defense Upgrade', '+2%', '+4%', '+6%', '+8%', '+10%', '+12%'],
      ['Free Utility Upgrade', '+2%', '+4%', '+6%', '+8%', '+10%', '+12%'],
      ['Interest / Wave', '', '', '+2%', '+4%', '+6%', '+8%'],
      ['Recovery Amount', '', '', '+3%', '+5%', '+7%', '+10%'],
      ['Max Recovery', '', '', '+0.4x', '+0.7x', '+1x', '+1.5x'],
      ['Package Chance', '', '', '+5%', '+8%', '+11%', '+15%'],
      ['Enemy Health Level Skip', '', '', '+2%', '+4%', '+6%', '+8%'],
      ['Enemy Attack Level Skip', '', '', '+2%', '+4%', '+6%', '+8%'],
    ]
  },
  Core: {
    title: 'Core Module Substat Values',
    headers: [
      'Substat', 'Common', 'Rare', 'Epic', 'Legendary', 'Mythic', 'Ancestral'
    ],
    rows: [
      ['Golden Tower - Bonus', '', '', '+1x', '+2x', '+3x', '+4x'],
      ['Golden Tower - Duration', '', '', '', '+2s', '+4s', '+7s'],
      ['Golden Tower - Cooldown', '', '-', '-', '-6s', '-8s', '-12s'],
      ['Black Hole - Size', '+2m', '+4m', '+6m', '+8m', '+10m', '+12m'],
      ['Black Hole - Duration', '', '', '', '+2s', '+3s', '+4s'],
      ['Black Hole - Cooldown', '', '', '', '-2s', '-3s', '-4s'],
      ['Spotlight - Bonus', '+1.2x', '+2.5x', '+3.5x', '+10x', '+15x', '+20x'],
      ['Spotlight - Angle', '', '', '+3°', '+6°', '+11°', '+15°'],
      ['Chrono Field - Duration', '', '', '', '43s', '+7s', '+10s'],
      ['Chrono Field - Speed Reduction', '', '', '+3%', '+8%', '+11%', '+15%'],
      ['Chrono Field - Cooldown', '', '', '', '-4s', '-7s', '-10s'],
      ['Death Wave - Damage', '+8x', '+15x', '+25x', '+50x', '+100x', '+250x'],
      ['Death Wave - Cooldown', '', '', '', '-6s', '-10s', '-13s'],
      ['Smart Missiles - Damage', '+8x', '+15x', '+25x', '+50x', '+100x', '+250x'],
      ['Smart Missiles - Quantity', '', '', '1', '+2', '+4', '+5'],
      ['Smart Missiles - Cooldown', '', '', '', '-2s', '-4s', '-6s'],
      ['Inner Land Mines - Damage', '+2x', '+5x', '+15x', '+40x', '+100x', '+150x'],
      ['Inner Land Mines - Quantity', '', '', '', '1', '+2', '+3'],
      ['Inner Land Mines - Cooldown', '', '', '-5s', '-8s', '-10s', '-13s'],
      ['Poison Swamp - Damage', '+0.5x', '+0.8x', '+1.5x', '+4x', '+10x', '+20x'],
      ['Poison Swamp - Duration', '', '', '', '+5s', '+10s', '+13s'],
      ['Poison Swamp - Chance', '', '+3%', '+4%', '+8%', '+11%', '+15%'],
      ['Chain Lightning - Damage', '+8x', '+15x', '+25x', '+50x', '+100x', '+250x'],
      ['Chain Lightning - Quantity', '', '', '+1', '+2', '+3', '+4'],
      ['Chain Lightning - Chance', '+2%', '+4%', '+6%', '+9%', '+12%', '+15%'],
    ]
  }
};

async function generateModuleSubstatValuesChart(moduleType = 'Cannon') {
  // Validate moduleType
  if (!MODULE_SUBSTAT_DATA[moduleType]) throw new Error('Invalid module type');
  // Clone data to avoid mutating the original
  const data = JSON.parse(JSON.stringify(MODULE_SUBSTAT_DATA[moduleType]));

  // Add Chance for Each Rarity row at the bottom
  // Values: Common: 46.2%, Rare: 40%, Epic: 10%, Legendary: 2.5%, Mythic: 1%, Ancestral: 0.3%
  // The first column is the label
  data.rows.push([
    'Chance for Each Rarity',
    '46.2%',
    '40%',
    '10%',
    '2.5%',
    '1%',
    '0.3%'
  ]);

  // Style
  const font = style.font;
  const headerFont = style.headerFont;
  const cellFont = style.cellFont;
  const headerCellFont = style.headerCellFont;
  const cellPadding = style.cellPadding;
  const baseRowHeight = style.baseRowHeight;
  const headerRowHeight = 36; // Not in style.js, keep as is for now
  const margin = style.margin;
  const borderColor = style.borderColor;
  // Use a slightly lighter header for the substat column, otherwise use style.js colors
  const headerBg = '#222';
  const headerText = style.headerText;
  const evenRowBg = style.evenRowBg;
  const oddRowBg = style.oddRowBg;
  const textColor = style.textColor;
  // Accent colors: [Substat, Common, Rare, Epic, Legendary, Mythic, Ancestral]
  // Common: gray, Rare: blue, Epic: pink, Legendary: yellow, Mythic: red, Ancestral: green
  const accentColors = [
    '#222',           // Substat (header)
    '#888a92',        // Common (gray, dark mode)
    '#3b7fff',        // Rare (blue, dark mode)
    '#e26ad9',        // Epic (pink, dark mode)
    style.accentGold, // Legendary (yellow, dark mode)
    style.accentRed,  // Mythic (red, dark mode)
    '#4be37a'         // Ancestral (green, dark mode)
  ];

  // Create a temp canvas for measuring
  const ctx = createCanvas(10, 10).getContext('2d');
  ctx.font = cellFont;
  // Calculate column widths
  const colWidths = data.headers.map((header, i) => {
    let max = ctx.measureText(header).width;
    for (const row of data.rows) {
      max = Math.max(max, ctx.measureText(row[i] || '').width);
    }
    return max + cellPadding * 2;
  });
  const tableWidth = colWidths.reduce((a, b) => a + b, 0);
  const tableHeight = headerRowHeight + data.rows.length * baseRowHeight;
  const bottomPadding = 28; // Extra space at the bottom
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
  let y = margin + 32;
  // Header row
  ctx2.font = headerCellFont;
  let hx = x;
  for (let i = 0; i < data.headers.length; i++) {
    ctx2.fillStyle = accentColors[i] || headerBg;
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

  return canvas.toBuffer('image/png');
}

module.exports = { generateModuleSubstatValuesChart };
