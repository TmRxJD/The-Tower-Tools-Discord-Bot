// Enemy Resistances chart generator
const { createCanvas } = require('canvas');
const style = require('./style.js');

const COLUMNS = [
  'Effect',
  'Boss Ult/Boss',
  'Fast Ult',
  'Range Ult',
  'Elite Ult/Elite',
  'Tank Ult',
  'Tank Ult (CD)',
  'Prot Ult',
  'Prot Ult (CD)',
  'Fleets'
];

// type: good | partial | bad | neutral
const ROWS = [
  // Slow effects
  { label: 'Slow', cells: ['good','good','good','good','good','good','bad','good',{ text: '50% effective', type: 'partial' }] },

  // Stuns
  { label: 'LM Stun',  cells: ['bad','good','good','good','bad','good','bad','good',{ text: '50% duration', type: 'partial' }] },
  { label: 'ILM Stun', cells: ['good','good','good','good','good','good','bad','good',{ text: '50% duration', type: 'partial' }] },
  { label: 'PS Stun',  cells: ['good','good','good','good','good','good','bad','good',{ text: '50% duration', type: 'partial' }] },

  // Thunderbolt
  { label: 'Thunder Bot', cells: [{ text: '50% slow', type: 'partial' },'good','good',{ text: '50% slow', type: 'partial' },'good','good','bad','good',{ text: '50% slow', type: 'partial' }] },

  // Orb / Death Ray
  { label: 'Orb Instakill', cells: ['bad','bad','bad','bad','bad','good','bad','bad','bad'] },
  { label: 'Orb 2%', cells: ['good','good','good','bad','good','bad','bad','bad','bad'] },
  { label: 'Death Ray Instakill', cells: ['bad','bad','bad','bad','bad','good','bad','bad','bad'] },
  { label: 'Death Ray Mastery %', cells: ['bad','bad','bad','bad','bad','bad','good','good','bad'] },

  // Blackhole / Shockbite
  { label: 'Blackhole Suction', cells: ['bad','bad','bad','bad','bad','good','good','good','bad'] },
  { label: 'Blackhole 2%', cells: ['bad','bad','bad','bad','bad','good','bad','good','bad'] },
  { label: 'Blackhole+', cells: ['bad','bad','bad','bad','bad','good','good','good','bad'] },

  // Knockback / Shockwave
  { label: 'Knockback', cells: ['bad','good','good','good','bad','good','bad','good','bad'] },
  { label: 'Shockwave', cells: ['bad','good','good','bad','bad','good','bad','good','bad'] },

  // Auras and nets
  { label: 'Nuke/Slow Aura Mastery', cells: ['good','good','good','good','good','good','good','good','bad'] },
  { label: 'Energy Net', cells: ['good','bad','bad','bad','bad','bad','bad','bad','bad'] },

  // Thorns
  { label: 'Thorns', cells: [{ text: '50% effective', type: 'partial' }, 'good','good','good','bad','good','good','good',{ text: '10% effective', type: 'partial' }] }
];

const LEGEND = [
  { label: 'Vulnerable', type: 'good' },
  { label: 'Less effective', type: 'partial' },
  { label: "Invulnerable", type: 'bad' }
];

function toneToColor(type) {
  switch (type) {
    case 'good':
      return '#2ecc71';
    case 'partial':
      return '#f1c40f';
    case 'neutral':
      return style.evenRowBg;
    case 'bad':
    default:
      return '#e74c3c';
  }
}

function normalizeCell(cell) {
  if (typeof cell === 'string') return { text: '', type: cell };
  return cell || { text: '', type: 'neutral' };
}

async function generateEnemyResistancesChart() {
  const rowHeight = style.baseRowHeight;
  const headerFont = style.headerFont;
  const cellFont = style.cellFont || style.font;
  const headerBg = style.headerBg;
  const headerText = style.headerText;
  const borderColor = style.borderColor;
  const oddRowBg = style.oddRowBg;
  const evenRowBg = style.evenRowBg;
  const textColor = style.textColor;
  const cellPadding = style.cellPadding;

  // Measure column widths
  const measureCtx = createCanvas(1, 1).getContext('2d');
  measureCtx.font = headerFont;
  const colWidths = Array(COLUMNS.length).fill(0);

  COLUMNS.forEach((col, ci) => {
    let maxWidth = measureCtx.measureText(col).width;
    measureCtx.font = cellFont;
    for (const row of ROWS) {
      if (ci === 0) {
        maxWidth = Math.max(maxWidth, measureCtx.measureText(row.label).width);
      } else {
        const cell = normalizeCell(row.cells[ci - 1]);
        const lines = String(cell.text || (typeof cell.type === 'string' ? '' : '')).split('\n');
        for (const line of lines) {
          maxWidth = Math.max(maxWidth, measureCtx.measureText(line).width);
        }
      }
    }
    colWidths[ci] = Math.ceil(maxWidth + cellPadding * 2);
    measureCtx.font = headerFont;
  });

  const tableWidth = colWidths.reduce((a, b) => a + b, 0);
  const tableHeight = rowHeight * (1 + ROWS.length);
  const legendHeight = 60;
  const footerSentenceOne = 'Tank Ults and Prot Ults on cooldown are just regular Tanks and Prots with no differences at all.';
  const footerSentenceTwo = 'All sources of slow are identical in behavior (Chronofield+, Slow Aura card, Poison Swamp 25% slow, Negative Mass Projector). All of these are in the "Slow" row.';
  const footerCredit = 'Credit: @rageboulderfist.';
  const footerFont = style.footerFont;
  const width = tableWidth;
  const ctxFooter = createCanvas(1, 1).getContext('2d');
  ctxFooter.font = footerFont;
  const footerLines = [
    ...wrapLinesForWidth(ctxFooter, footerSentenceOne, width - cellPadding * 2),
    ...wrapLinesForWidth(ctxFooter, footerSentenceTwo, width - cellPadding * 2),
    '',
    ...wrapLinesForWidth(ctxFooter, footerCredit, width - cellPadding * 2)
  ];
  const footerHeight = footerLines.length * 20 + 12;
  const height = tableHeight + legendHeight + footerHeight + style.margin;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = style.oddRowBg;
  ctx.fillRect(0, 0, width, height);

  // Header row
  let y = 0;
  let x = 0;
  ctx.font = headerFont;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let ci = 0; ci < COLUMNS.length; ci++) {
    const w = colWidths[ci];
    ctx.fillStyle = headerBg;
    ctx.fillRect(x, y, w, rowHeight);
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, rowHeight);
    ctx.fillStyle = headerText;
    wrapText(ctx, COLUMNS[ci], x + w / 2, y + rowHeight / 2, w - cellPadding * 2);
    x += w;
  }

  // Body rows
  ctx.font = cellFont;
  for (let ri = 0; ri < ROWS.length; ri++) {
    const row = ROWS[ri];
    y = rowHeight * (ri + 1);
    x = 0;
    const rowBg = ri % 2 === 0 ? evenRowBg : oddRowBg;
    // Label cell
    ctx.fillStyle = rowBg;
    ctx.fillRect(x, y, colWidths[0], rowHeight);
    ctx.strokeStyle = borderColor;
    ctx.strokeRect(x, y, colWidths[0], rowHeight);
    ctx.fillStyle = textColor;
    wrapText(ctx, row.label, x + colWidths[0] / 2, y + rowHeight / 2, colWidths[0] - cellPadding * 2);
    x += colWidths[0];

    // Data cells
    for (let ci = 1; ci < COLUMNS.length; ci++) {
      const cell = normalizeCell(row.cells[ci - 1]);
      const bg = toneToColor(cell.type);
      ctx.fillStyle = bg;
      ctx.fillRect(x, y, colWidths[ci], rowHeight);
      ctx.strokeStyle = borderColor;
      ctx.strokeRect(x, y, colWidths[ci], rowHeight);
      ctx.fillStyle = '#000';
      ctx.font = cellFont;
      wrapText(ctx, cell.text || '', x + colWidths[ci] / 2, y + rowHeight / 2, colWidths[ci] - cellPadding * 2);
      x += colWidths[ci];
    }
  }

  // Legend
  y = tableHeight + 8;
  x = cellPadding;
  ctx.font = style.subheaderFont;
  for (const entry of LEGEND) {
    const boxSize = 18;
    ctx.fillStyle = toneToColor(entry.type);
    ctx.fillRect(x, y, boxSize, boxSize);
    ctx.strokeStyle = borderColor;
    ctx.strokeRect(x, y, boxSize, boxSize);
    ctx.fillStyle = style.textColor;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(entry.label, x + boxSize + 8, y + boxSize / 2);
    x += boxSize + 120;
  }

  // Footer
  ctx.font = footerFont;
  ctx.fillStyle = style.footerColor;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const footerY = tableHeight + legendHeight;
  let lineY = footerY;
  for (const line of footerLines) {
    ctx.fillText(line, cellPadding, lineY);
    lineY += 20;
  }

  return canvas.toBuffer('image/png');
}

function wrapText(ctx, text, centerX, centerY, maxWidth) {
  const words = String(text || '').split(' ');
  const lines = [];
  let current = '';
  for (const w of words) {
    const test = current.length ? `${current} ${w}` : w;
    if (ctx.measureText(test).width <= maxWidth) {
      current = test;
    } else {
      if (current) lines.push(current);
      current = w;
    }
  }
  if (current) lines.push(current);
  const totalHeight = lines.length * 16;
  let y = centerY - totalHeight / 2 + 8;
  for (const line of lines) {
    ctx.fillText(line, centerX, y);
    y += 16;
  }
}

// Simple word-wrap helper for footer paragraphs
function wrapLinesForWidth(ctx, text, maxWidth) {
  const words = String(text || '').split(/\s+/);
  const lines = [];
  let current = '';
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth) {
      current = test;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

module.exports = {
  generateEnemyResistancesChart,
};
