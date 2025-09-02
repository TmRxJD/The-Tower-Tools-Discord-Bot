// Harmony Tree Upgrades and Cost Chart Generator
// Category: Vault > Upgrades and Cost > Harmony Tree

const { createCanvas } = require('canvas');
const style = require('./style');

const TITLE = 'Harmony Tree Upgrades & Costs';
const FOOTER = '';
const DESCRIPTION = 'All upgrades and their key costs in the Harmony tech tree.';

// Explicitly define all nodes and their parent relationships to match the reference image
const NODES = [
  // Row 0 (root)
  { id: 'discount1', name: '2.5% Discount Enhancements', cost: 5, col: 1, row: 0, parents: [] },

  // Row 1
  { id: 'cardslot1', name: '1 Additional Card Slot', cost: 10, col: 0, row: 1, parents: ['discount2'] },
  { id: 'discount2', name: '2.5% Discount Rerolls', cost: 5, col: 1, row: 1, parents: ['discount1'] },
  { id: 'demon', name: 'Demon Mode Automation', cost: 10, col: 2, row: 1, parents: ['discount2'] },

  // Row 2
  { id: 'freemission', name: 'Free Mission Reroll', cost: 25, col: 0, row: 2, parents: ['discount3'] },
  { id: 'discount3', name: '2.5% Discount Enhancements', cost: 5, col: 1, row: 2, parents: ['discount2'] },
  { id: 'smartdemon', name: 'Smart Demon Mode Automation', cost: 15, col: 2, row: 2, parents: ['demon'] },

  // Row 3
  { id: 'nukeauto', name: 'Nuke Automation', cost: 10, col: 0, row: 3, parents: ['discount4'] },
  { id: 'discount4', name: '2.5% Discount Rerolls', cost: 5, col: 1, row: 3, parents: ['discount3'] },
  { id: 'workshoprespec1', name: 'Workshop Respec Discount', cost: 15, col: 2, row: 3, parents: ['discount4'] },

  // Row 4
  { id: 'smartnuke', name: 'Smart Nuke Automation', cost: 15, col: 0, row: 4, parents: ['nukeauto'] },
  { id: 'discount5', name: '2.5% Discount Enhancements', cost: 5, col: 1, row: 4, parents: ['discount4'] },
  { id: 'workshoprespec2', name: 'Workshop Respec Discount', cost: 20, col: 2, row: 4, parents: ['workshoprespec1'] },

  // Row 5
  { id: 'cardslot2', name: '1 Additional Card Slot', cost: 15, col: 0, row: 5, parents: ['discount6'] },
  { id: 'discount6', name: '2.5% Discount Rerolls', cost: 5, col: 1, row: 5, parents: ['discount5'] },
  { id: 'workshoprespec3', name: 'Workshop Respec Discount', cost: 25, col: 2, row: 5, parents: ['workshoprespec2'] },

  // Row 6
  { id: 'adgems1', name: 'Ad gems Stack x2', cost: 15, col: 0, row: 6, parents: ['discount7'] },
  { id: 'discount7', name: '2.5% Discount Enhancements', cost: 5, col: 1, row: 6, parents: ['discount6'] },
  { id: 'workshoppresets', name: '+5 Workshop Presets', cost: 30, col: 2, row: 6, parents: ['workshoprespec3'] },

  // Row 7
  { id: 'adgems2', name: 'Ad gems Stack x3', cost: 20, col: 0, row: 7, parents: ['adgems1'] },
  { id: 'discount8', name: '2.5% Discount Rerolls', cost: 5, col: 1, row: 7, parents: ['discount7'] },
  { id: 'cardslot4', name: '1 Additional Card Slot', cost: 20, col: 2, row: 7, parents: ['discount8'] },

  // Row 8
  { id: 'adgems3', name: 'Ad gems Stack x5', cost: 25, col: 0, row: 8, parents: ['adgems2'] },
  { id: 'discount9', name: '2.5% Discount Enhancements', cost: 5, col: 1, row: 8, parents: ['discount8'] },
  { id: 'missileauto', name: 'Missile Barrage Automation', cost: 10, col: 2, row: 8, parents: ['discount9'] },

  // Row 9
  { id: 'cardslot3', name: '1 Additional Card Slot', cost: 25, col: 0, row: 9, parents: ['discount10'] },
  { id: 'discount10', name: '2.5% Discount Rerolls', cost: 5, col: 1, row: 9, parents: ['discount9'] },
  { id: 'smartmissile', name: 'Smart Missile Barrage Automation', cost: 15, col: 2, row: 9, parents: ['missileauto'] },

  // Row 10
  { id: 'dailymission', name: 'Daily Mission - Set Shard Type', cost: 35, col: 0, row: 10, parents: ['disocunt11'] },
  { id: 'discount11', name: '2.5% Discount Enhancements', cost: 5, col: 1, row: 10, parents: ['discount10'] },
  { id: 'autoshatter', name: 'Auto Shatter Rare Modules', cost: 25, col: 2, row: 10, parents: ['discount11'] },

  // Row 11
  { id: 'autorestart', name: 'Auto Restart Run', cost: 20, col: 0, row: 11, parents: ['discount12'] },
  { id: 'discount12', name: '2.5% Discount Rerolls', cost: 5, col: 1, row: 11, parents: ['discount11'] },
  { id: 'cardslot5', name: '1 Additional Card Slot', cost: 35, col: 2, row: 11, parents: ['discount12'] },

  // Row 12
  { id: 'discount13', name: '2.5% Discount Enhancements', cost: 5, col: 1, row: 12, parents: ['discount12'] },
  { id: 'autoberzerk', name: 'Auto Charge Berzerker', cost: 10, col: 2, row: 12, parents: ['discount13'] },

  // Row 13
  { id: 'botrespec1', name: '100 Bot Respec Discount', cost: 15, col: 0, row: 13, parents: ['discount14'] },
  { id: 'discount14', name: '2.5% Discount Rerolls', cost: 5, col: 1, row: 13, parents: ['discount13'] },
  { id: 'damagecap', name: 'Damage Cap Slider', cost: 35, col: 2, row: 13, parents: ['autoberzerk'] },

  // Row 14
  { id: 'botrespec2', name: '100 Bot Respec Discount', cost: 20, col: 0, row: 14, parents: ['botrespec1'] },
  { id: 'discount15', name: '2.5% Discount Enhancements', cost: 5, col: 1, row: 14, parents: ['discount14'] },
  { id: 'workshoporb', name: 'Workshop Orb Adjuster', cost: 20, col: 2, row: 14, parents: ['discount15'] },

  // Row 15
  { id: 'botrespec3', name: '100 Bot Respec Discount', cost: 25, col: 0, row: 15, parents: ['botrespec2'] },
  { id: 'discount16', name: '2.5% Discount Rerolls', cost: 5, col: 1, row: 15, parents: ['discount15'] },
  { id: 'cardslot6', name: '1 Additional Card Slot', cost: 45, col: 2, row: 15, parents: ['discount16'] },

  // Row 16
  { id: 'botpreset', name: 'Bot Presets', cost: 30, col: 0, row: 16, parents: ['botrespec3'] },
  { id: 'discount17', name: '2.5% Discount Enhancements', cost: 5, col: 1, row: 16, parents: ['discount16'] },
  { id: 'botslider', name: 'Bot Cooldown Slider', cost: 25, col: 2, row: 16, parents: ['discount17'] },
];

// --- Node-based layout for Harmony Tree ---
function drawNodeTree(ctx, nodes, style, rowHeight, colWidth, rowGap, colGap, margin, titleHeight, descHeight) {
  // Build a map for quick lookup
  const nodeMap = new Map();
  for (const node of nodes) nodeMap.set(node.id, node);

  // Draw connectors (L-shaped)
  ctx.save();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 3;
  for (const node of nodes) {
    const x = margin + node.col * (colWidth + colGap);
    const y = margin + titleHeight + descHeight + node.row * (rowHeight + rowGap);
    for (const parentId of node.parents) {
      const parent = nodeMap.get(parentId);
      if (!parent) continue;
      const px = margin + parent.col * (colWidth + colGap);
      const py = margin + titleHeight + descHeight + parent.row * (rowHeight + rowGap);
      // L-shape: from parent's right edge, horizontal to midway, vertical to child, horizontal to child's left edge
      const fromX = px + colWidth;
      const fromY = py + rowHeight / 2;
      const toX = x;
      const toY = y + rowHeight / 2;
      // Horizontal from parent to midway between columns
      const midX = (fromX + toX) / 2;
      ctx.beginPath();
      ctx.moveTo(fromX, fromY);
      ctx.lineTo(midX, fromY);
      ctx.lineTo(midX, toY);
      ctx.lineTo(toX, toY);
      ctx.stroke();
    }
  }
  ctx.restore();

  // Draw nodes (boxes) with text wrapping
  for (const node of nodes) {
    const x = margin + node.col * (colWidth + colGap);
    const y = margin + titleHeight + descHeight + node.row * (rowHeight + rowGap);
    ctx.save();
    // Draw node box
    ctx.fillStyle = style.evenRowBg;
    ctx.strokeStyle = style.borderColor;
    ctx.lineWidth = 2;
    ctx.fillRect(x, y, colWidth, rowHeight);
    ctx.strokeRect(x, y, colWidth, rowHeight);

    // --- Label (top 2/3) ---
    ctx.font = style.cellFont;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = style.textColor;

    const paddingY = 8; // slightly more vertical padding
    const labelAreaHeight = rowHeight * 2 / 3 - paddingY * 2;
    const keyAreaHeight = rowHeight / 3 - paddingY * 2;

    // Text wrapping for node name
    const paddingX = 10;
    const maxTextWidth = colWidth - 2 * paddingX;
    const words = node.name.split(' ');
    let lines = [];
    let currentLine = '';
    for (let i = 0; i < words.length; i++) {
      let testLine = currentLine ? currentLine + ' ' + words[i] : words[i];
      let metrics = ctx.measureText(testLine);
      if (metrics.width > maxTextWidth && currentLine) {
        lines.push(currentLine);
        currentLine = words[i];
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) lines.push(currentLine);

    // Calculate total label height using font metrics
    let lineHeights = lines.map(line => {
      let m = ctx.measureText(line);
      return (m.actualBoundingBoxAscent || style.baseRowHeight * 0.7) + (m.actualBoundingBoxDescent || style.baseRowHeight * 0.2);
    });
    let totalLabelHeight = lineHeights.reduce((a, b) => a + b, 0);
    // Center label block in the top 2/3 area
    let labelAreaTop = y + paddingY;
    let labelStartY = labelAreaTop + (labelAreaHeight - totalLabelHeight) / 2 + (lineHeights[0] ? lineHeights[0] / 2 : 0);
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], x + colWidth / 2, labelStartY);
      labelStartY += lineHeights[i];
    }

    // --- Key value (bottom 1/3) ---
    ctx.font = 'bold 15px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let keyText = `${node.cost} keys`;
    let keyMetrics = ctx.measureText(keyText);
    let keyTextHeight = (keyMetrics.actualBoundingBoxAscent || 14) + (keyMetrics.actualBoundingBoxDescent || 4);
    // Center key value in the bottom 1/3 area
    let keyAreaTop = y + rowHeight * 2 / 3 + paddingY;
    let keyY = keyAreaTop + keyAreaHeight / 2;
    ctx.fillText(keyText, x + colWidth / 2, keyY);

    ctx.restore();
  }
}

async function generateHarmonyTreeUpgradesChart() {
  // Style
  const font = style.font;
  const headerFont = style.headerCellFont;
  const cellFont = style.cellFont;
  const footerFont = style.footerFont;
  const rowHeight = style.baseRowHeight + 6;
  const margin = style.margin;
  const borderColor = style.borderColor;
  const headerBg = style.headerBg;
  const headerText = style.headerText;
  const evenRowBg = style.evenRowBg;
  const oddRowBg = style.oddRowBg;
  const textColor = style.textColor;
  const footerBg = style.footerBg;
  const footerColor = style.footerColor;

  // Layout params
  const colWidth = 200;
  const rowGap = 18;
  const colGap = 60;
  const titleHeight = 44;
  const descHeight = 40;
  // Compute grid size
  const numCols = 3; // Fixed 5 columns
  const numRows = Math.max(...NODES.map(n => n.row)) + 1;
  const width = margin * 2 + (colWidth + colGap) * numCols - colGap;
  const height = margin * 2 + titleHeight + descHeight + (rowHeight + rowGap) * numRows + 60;

  // Create canvas
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = oddRowBg;
  ctx.fillRect(0, 0, width, height);

  // Draw title
  ctx.font = 'bold 22px Arial';
  ctx.fillStyle = headerText;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(TITLE, width / 2, margin / 2);

  // Draw description
  ctx.font = cellFont;
  ctx.fillStyle = textColor;
  ctx.textAlign = 'left';
  ctx.fillText(DESCRIPTION, margin, margin / 2 + titleHeight);
  // Draw the node-based tree
  drawNodeTree(ctx, NODES, style, rowHeight, colWidth, rowGap, colGap, margin, titleHeight, descHeight);

  // Draw footer
  ctx.font = footerFont;
  ctx.fillStyle = footerBg;
  ctx.fillRect(0, height - 32, width, 32);
  ctx.fillStyle = footerColor;
  ctx.textAlign = 'left';
  ctx.fillText(FOOTER, margin, height - 24);

  return canvas.toBuffer('image/png');
}

// Helper: get max depth of a tree
function getTreeDepth(node) {
  if (!node.children || node.children.length === 0) return 0;
  return 1 + Math.max(...node.children.map(getTreeDepth));
}

module.exports = { generateHarmonyTreeUpgradesChart };
