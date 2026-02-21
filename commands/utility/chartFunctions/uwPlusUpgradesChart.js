// Generates the Ultimate Weapons+ Upgrades and Costs chart

const { createCanvas, loadImage } = require('canvas');
const path = require('path');
const style = require('./style.js');
const {
  uwPlusUnlockCosts,
  uwPlusUnlockTotal,
  uwPlusUpgradeSections,
  uwPlusFooterText,
} = require('../../../../../packages/platform/dist/tools/uw-plus-chart-data.js');

async function generateUWPlusUpgradesChart() {
  // Style constants (dark theme, modern)
  const font = style.font;
  const headerFont = 'bold 24px Arial'; // Custom for this chart's main title
  const cellFont = style.cellFont;
  const headerCellFont = style.headerCellFont;
  const footerFont = style.footerFont;
  const cellPadding = style.cellPadding;
  const baseRowHeight = style.baseRowHeight;
  const titleHeight = 44;
  const margin = style.margin;
  const borderColor = style.borderColor;
  const headerBg = style.headerBg;
  const headerText = style.headerText;
  const evenRowBg = style.evenRowBg;
  const oddRowBg = style.oddRowBg;
  const textColor = style.textColor;
  const footerBg = style.footerBg;
  const footerColor = style.footerColor;
  const iconSize = 32;
  const arrowColor = style.headerText;

  // Helper: word wrap for description
  function wrapText(ctx, text, maxWidth) {
    const words = text.split(' ');
    let lines = [];
    let line = '';
    for (let n = 0; n < words.length; n++) {
      const testLine = line + (line ? ' ' : '') + words[n];
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && line) {
        lines.push(line);
        line = words[n];
      } else {
        line = testLine;
      }
    }
    if (line) lines.push(line);
    return lines;
  }


  // --- Calculate global column widths for all sections ---
  const ctx = createCanvas(10, 10).getContext('2d');
  ctx.font = cellFont;
  // Unlock cost table
  let unlockCol1 = Math.max(ctx.measureText('Number of UW+').width, ...uwPlusUnlockCosts.map(r => ctx.measureText(r.count).width));
  let unlockCol2 = Math.max(ctx.measureText('Unlock Cost').width, ...uwPlusUnlockCosts.map(r => ctx.measureText(r.cost).width));
  unlockCol1 += cellPadding * 2;
  unlockCol2 += cellPadding * 2;
  const unlockTableWidth = unlockCol1 + unlockCol2;
  const unlockTableHeight = (uwPlusUnlockCosts.length + 1) * baseRowHeight + baseRowHeight;

  // Find max number of value/cost columns
  let maxValueCols = Math.max(...uwPlusUpgradeSections.map(s => s.upgrades[0].costs.length));
  // Pad all upgrades to have maxValueCols values/costs
  for (const section of uwPlusUpgradeSections) {
    for (const upg of section.upgrades) {
      while (upg.values.length < maxValueCols) upg.values.push('');
      while (upg.costs.length < maxValueCols) upg.costs.push('');
    }
  }
  // Compute global colWidths
  let colWidths = [iconSize + 8, 120, 24, 120, 320];
  for (let i = 0; i < maxValueCols; i++) {
    let maxVal = 0;
    for (const section of uwPlusUpgradeSections) {
      for (const upg of section.upgrades) {
        maxVal = Math.max(
          maxVal,
          ctx.measureText(upg.values[i] || '').width,
          ctx.measureText(upg.costs[i] || '').width
        );
      }
    }
    colWidths.push(Math.max(48, maxVal + cellPadding));
  }
  // Calculate header width: sum of all columns
  const headerW = colWidths.reduce((a, b) => a + b, 0);

  // Calculate row heights for each upgrade (for wrapped desc)
  let sectionRowHeights = [];
  let sectionHeights = [];
  for (const section of uwPlusUpgradeSections) {
    let rowHeights = [];
    for (const upg of section.upgrades) {
      const descLines = wrapText(ctx, upg.desc, 320 - cellPadding * 2);
      rowHeights.push(Math.max(baseRowHeight, descLines.length * 20 + 8));
    }
    // Section height: header + table header + sum(rowHeights) + padding
    const sectionHeight = (2 * baseRowHeight) + rowHeights.reduce((a, b) => a + b, 0) + 16;
    sectionHeights.push(sectionHeight);
    sectionRowHeights.push(rowHeights);
  }
  // Set table width to fit all columns plus right margin for padding
  const rightMargin = margin;
  const tableWidth = margin + unlockTableWidth + 40 + headerW + rightMargin;
  // Calculate totalHeight based on actual content (no extra space)
  let totalHeight = titleHeight + margin + unlockTableHeight + 24;
  for (const h of sectionHeights) totalHeight += h + 16;
  totalHeight += margin + 90; // Only one margin and footer height

  // Create canvas
  const canvas = createCanvas(tableWidth, totalHeight);
  const ctx2 = canvas.getContext('2d');
  ctx2.fillStyle = oddRowBg;
  ctx2.fillRect(0, 0, tableWidth, totalHeight);

  // Draw title
  ctx2.font = headerFont;
  ctx2.fillStyle = headerText;
  ctx2.textAlign = 'center';
  ctx2.textBaseline = 'top';
  ctx2.fillText('Ultimate Weapon+ Upgrades and Costs', tableWidth / 2, margin / 2);

  // Draw unlock cost table (top left)
  let ux = margin;
  let uy = titleHeight + margin;
  ctx2.font = headerCellFont;
  ctx2.fillStyle = headerBg;
  ctx2.fillRect(ux, uy, unlockTableWidth, baseRowHeight);
  ctx2.strokeStyle = borderColor;
  ctx2.strokeRect(ux, uy, unlockTableWidth, baseRowHeight);
  ctx2.fillStyle = headerText;
  ctx2.textBaseline = 'middle';
  ctx2.textAlign = 'left';
  ctx2.fillText('Number of UW+', ux + cellPadding, uy + baseRowHeight / 2);
  ctx2.textAlign = 'right';
  ctx2.fillText('Unlock Cost', ux + unlockTableWidth - cellPadding, uy + baseRowHeight / 2);
  uy += baseRowHeight;
  ctx2.font = cellFont;
  ctx2.textBaseline = 'middle';
  for (const row of uwPlusUnlockCosts) {
    ctx2.fillStyle = evenRowBg;
    ctx2.fillRect(ux, uy, unlockTableWidth, baseRowHeight);
    ctx2.strokeStyle = borderColor;
    ctx2.strokeRect(ux, uy, unlockTableWidth, baseRowHeight);
    ctx2.fillStyle = textColor;
    ctx2.textAlign = 'center';
    ctx2.fillText(row.count, ux + unlockCol1 / 2, uy + baseRowHeight / 2);
    ctx2.fillText(row.cost, ux + unlockCol1 + unlockCol2 / 2, uy + baseRowHeight / 2);
    uy += baseRowHeight;
  }
  // Total cost row
  ctx2.fillStyle = headerBg;
  ctx2.fillRect(ux, uy, unlockTableWidth, baseRowHeight);
  ctx2.strokeStyle = borderColor;
  ctx2.strokeRect(ux, uy, unlockTableWidth, baseRowHeight);
  ctx2.fillStyle = headerText;
  ctx2.textAlign = 'center';
  ctx2.fillText('Total Cost:', ux + unlockCol1 / 2, uy + baseRowHeight / 2);
  ctx2.fillText(uwPlusUnlockTotal, ux + unlockCol1 + unlockCol2 / 2, uy + baseRowHeight / 2);

  // Draw upgrade tables (to the right of unlock table)
  let sx = ux + unlockTableWidth + 40;
  let sy = titleHeight + margin;
  for (let s = 0; s < uwPlusUpgradeSections.length; s++) {
    const section = uwPlusUpgradeSections[s];
    const rowHeights = sectionRowHeights[s];
    // Section title (header row 1)
    ctx2.font = headerCellFont;
    ctx2.fillStyle = headerBg;
    ctx2.fillRect(sx, sy, headerW, baseRowHeight);
    ctx2.strokeStyle = borderColor;
    ctx2.strokeRect(sx, sy, headerW, baseRowHeight);
    ctx2.fillStyle = headerText;
    ctx2.textAlign = 'left';
    ctx2.fillText(section.title, sx + cellPadding, sy + baseRowHeight / 2 + 1);
    // Align total cost to the right edge of the last cost column (no clipping, just right-aligned)
    ctx2.textAlign = 'right';
    let lastCostCellRight = sx + headerW;
    ctx2.fillText('Total Cost: ' + section.total, lastCostCellRight - cellPadding, sy + baseRowHeight / 2 + 1);
    sy += baseRowHeight;
    // Table headers (header row 2)
    ctx2.font = headerCellFont;
    ctx2.fillStyle = headerBg;
    ctx2.fillRect(sx, sy, headerW, baseRowHeight);
    ctx2.strokeStyle = borderColor;
    ctx2.strokeRect(sx, sy, headerW, baseRowHeight);
    ctx2.fillStyle = headerText;
    ctx2.textBaseline = 'middle';
    // Draw each header cell using global colWidths, with correct alignment
    let hx = sx;
    // Icon header (blank, left-aligned with padding)
    ctx2.textAlign = 'left';
    ctx2.fillText(' ', hx + cellPadding, sy + baseRowHeight / 2);
    hx += colWidths[0];
    // Upgrade header (centered)
    ctx2.textAlign = 'center';
    ctx2.fillText('Upgrade', hx + colWidths[1] / 2, sy + baseRowHeight / 2);
    hx += colWidths[1];
    // Arrow header (centered)
    ctx2.fillText('→', hx + colWidths[2] / 2, sy + baseRowHeight / 2);
    hx += colWidths[2];
    // Next header (centered)
    ctx2.fillText('Next', hx + colWidths[3] / 2, sy + baseRowHeight / 2);
    hx += colWidths[3];
    // Description header (centered)
    ctx2.fillText('Description', hx + colWidths[4] / 2, sy + baseRowHeight / 2);
    hx += colWidths[4];
    // Value/cost headers (centered)
    for (let i = 0; i < maxValueCols; i++) {
        ctx2.fillText(section.upgrades[0].costs[i], hx + colWidths[5 + i] / 2, sy + baseRowHeight / 2);
        // Draw vertical border for each cost header cell
        ctx2.strokeStyle = borderColor;
        ctx2.beginPath();
        ctx2.moveTo(hx, sy);
        ctx2.lineTo(hx, sy + baseRowHeight);
        ctx2.stroke();
        hx += colWidths[5 + i];
    }
    // Draw rightmost border for the last header cell
    ctx2.strokeStyle = borderColor;
    ctx2.beginPath();
    ctx2.moveTo(hx, sy);
    ctx2.lineTo(hx, sy + baseRowHeight);
    ctx2.stroke();
    sy += baseRowHeight;
    // Upgrades
    ctx2.font = cellFont;
    ctx2.textBaseline = 'middle';
    // --- Preload all icons before drawing loop ---
    // (This block should be placed before the main chart function, but for patching, we define it here)
    if (typeof globalThis.ICON_IMAGES === 'undefined') {
      globalThis.ICON_FILENAMES = [
        'CL.png', 'SM.png', 'PS.png', 'GT.png', 'ILM.png', 'DW.png', 'BH.png', 'CF.png', 'SL.png'
      ];
      globalThis.ICON_IMAGES = {};
      globalThis.ICONS_LOADED = false;
    }
    async function preloadIcons() {
      if (globalThis.ICONS_LOADED) return;
      const promises = globalThis.ICON_FILENAMES.map(async (filename) => {
        const imgPath = path.join(__dirname, './images/', filename);
        try {
          globalThis.ICON_IMAGES[filename] = await loadImage(imgPath);
        } catch (e) {
          globalThis.ICON_IMAGES[filename] = null;
        }
      });
      await Promise.all(promises);
      globalThis.ICONS_LOADED = true;
    }
    await preloadIcons();

    for (let u = 0; u < section.upgrades.length; u++) {
      const upg = section.upgrades[u];
      const thisRowHeight = rowHeights[u];
      let ux2 = sx;
      // Icon
      ctx2.textAlign = 'center';
      if (upg.icon && globalThis.ICON_IMAGES[upg.icon]) {
        ctx2.drawImage(globalThis.ICON_IMAGES[upg.icon], ux2 + cellPadding, sy + (thisRowHeight - iconSize) / 2, iconSize, iconSize);
      } else if (upg.icon) {
        ctx2.fillStyle = '#444';
        ctx2.fillRect(ux2 + cellPadding, sy + (thisRowHeight - iconSize) / 2, iconSize, iconSize);
      }
      ux2 += colWidths[0];
      // Name
      ctx2.fillStyle = textColor;
        ctx2.textAlign = 'center';
        ctx2.textBaseline = 'middle';
        let nameLines = upg.name.includes('\n')
        ? upg.name.split('\n')
        : wrapText(ctx2, upg.name, colWidths[1] - cellPadding * 2);
        const nameLineHeight = 18;
        const nameBlockHeight = nameLines.length * nameLineHeight;
        const nameYStart = sy + (thisRowHeight - nameBlockHeight) / 2 + nameLineHeight / 2;
        for (let l = 0; l < nameLines.length; l++) {
        ctx2.fillText(nameLines[l], ux2 + colWidths[1] / 2, nameYStart + l * nameLineHeight);
        }
        ux2 += colWidths[1];
      // Arrow (wrapped if needed)
      ctx2.fillStyle = arrowColor;
      ctx2.textAlign = 'center';
      ctx2.textBaseline = 'middle';
      let arrowLines = upg.arrow && upg.arrow.includes('\n')
        ? upg.arrow.split('\n')
        : wrapText(ctx2, upg.arrow, colWidths[2] - cellPadding * 2);
      const arrowLineHeight = 18;
      const arrowBlockHeight = arrowLines.length * arrowLineHeight;
      const arrowYStart = sy + (thisRowHeight - arrowBlockHeight) / 2 + arrowLineHeight / 2;
      for (let l = 0; l < arrowLines.length; l++) {
        ctx2.fillText(arrowLines[l], ux2 + colWidths[2] / 2, arrowYStart + l * arrowLineHeight);
      }
      ux2 += colWidths[2];
      // Next (centered vertically and horizontally, supports multi-line)
      ctx2.fillStyle = textColor;
      ctx2.textAlign = 'center';
      ctx2.textBaseline = 'middle';
      let nextLines = upg.next && upg.next.includes('\n')
        ? upg.next.split('\n')
        : wrapText(ctx2, upg.next, colWidths[3] - cellPadding * 2);
      const nextLineHeight = 18;
      const nextBlockHeight = nextLines.length * nextLineHeight;
      const nextYStart = sy + (thisRowHeight - nextBlockHeight) / 2 + nextLineHeight / 2;
      for (let l = 0; l < nextLines.length; l++) {
        ctx2.fillText(nextLines[l], ux2 + colWidths[3] / 2, nextYStart + l * nextLineHeight);
      }
      ux2 += colWidths[3];
      // Desc (wrapped)
      ctx2.fillStyle = textColor;
      ctx2.textAlign = 'center';
      ctx2.textBaseline = 'middle';
      const descLines = wrapText(ctx2, upg.desc, 320 - cellPadding * 2);
      const lineHeight = 20;
      const descBlockHeight = descLines.length * lineHeight;
      const descYStart = sy + (thisRowHeight - descBlockHeight) / 2 + lineHeight / 2;
      for (let l = 0; l < descLines.length; l++) {
        ctx2.fillText(descLines[l], ux2 + colWidths[4] / 2, descYStart + l * lineHeight);
      }
      ux2 += colWidths[4];
      // Values/costs
      ctx2.textAlign = 'center';
      ctx2.textBaseline = 'middle';
      for (let i = 0; i < maxValueCols; i++) {
        ctx2.fillStyle = evenRowBg;
        ctx2.fillRect(ux2, sy, colWidths[5 + i], thisRowHeight);
        ctx2.strokeStyle = borderColor;
        ctx2.strokeRect(ux2, sy, colWidths[5 + i], thisRowHeight);
        ctx2.fillStyle = textColor;
        ctx2.fillText(upg.values[i], ux2 + colWidths[5 + i] / 2, sy + thisRowHeight / 2);
        ux2 += colWidths[5 + i];
      }
      sy += thisRowHeight;
    }
    sy += 16;
  }

  // Draw footer immediately after last section
  const footerHeight = 90;
  ctx2.font = footerFont;
  ctx2.fillStyle = footerBg;
  ctx2.fillRect(0, sy + 16, tableWidth, footerHeight);
  ctx2.fillStyle = footerColor;
  ctx2.textAlign = 'left';
  let footerY = sy + 26;
  for (const line of uwPlusFooterText) {
    ctx2.fillText(line, margin, footerY);
    footerY += 18;
  }

  // Crop canvas to actual content height (footer bottom + margin)
  const actualHeight = footerY + margin - 8; // -8 for a little tighter bottom margin
  if (actualHeight < totalHeight) {
    const cropped = createCanvas(tableWidth, actualHeight);
    const croppedCtx = cropped.getContext('2d');
    croppedCtx.drawImage(canvas, 0, 0);
    return cropped.toBuffer('image/png');
  }

  return canvas.toBuffer('image/png');
}

module.exports = { generateUWPlusUpgradesChart };
