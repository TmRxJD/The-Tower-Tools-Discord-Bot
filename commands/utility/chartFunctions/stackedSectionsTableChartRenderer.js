const { createCanvas } = require('canvas');

function renderStackedSectionsTableChart({
  data,
  style,
  rowHeight = style.baseRowHeight,
  titleHeight = 48,
  sectionLabelHeight = 32,
  headerRowHeight,
  footerLineHeight = 20,
}) {
  const headerFont = style.headerCellFont;
  const cellFont = style.cellFont;
  const footerFont = style.footerFont;
  const borderColor = style.borderColor;
  const headerBg = style.headerBg;
  const headerText = style.headerText;
  const evenRowBg = style.evenRowBg;
  const oddRowBg = style.oddRowBg;
  const textColor = style.textColor;
  const footerBg = style.footerBg;
  const footerColor = style.footerColor;

  const ctxMeasure = createCanvas(10, 10).getContext('2d');
  const colCount = data.columnHeaders.length;
  const rows = data.sections.flatMap(section => section.rows);

  const computedHeaderRowHeight = headerRowHeight || (() => {
    let maxHeight = rowHeight;
    for (const header of data.groupHeaders) {
      const lines = String(header.label || '').split('\n');
      maxHeight = Math.max(maxHeight, lines.length * 22 + 8);
    }
    return maxHeight;
  })();

  const colWidths = Array(colCount).fill(0);
  for (let colIndex = 0; colIndex < colCount; colIndex += 1) {
    ctxMeasure.font = headerFont;
    const headerTextWidth = ctxMeasure.measureText(String(data.columnHeaders[colIndex] || '')).width;
    let maxWidth = headerTextWidth;

    ctxMeasure.font = cellFont;
    for (const row of rows) {
      const value = row[colIndex] == null ? '' : String(row[colIndex]);
      maxWidth = Math.max(maxWidth, ctxMeasure.measureText(value).width);
    }

    colWidths[colIndex] = Math.ceil(maxWidth) + 12;
  }

  const tableWidth = colWidths.reduce((sum, width) => sum + width, 0);

  function wrapText(text, maxWidth) {
    ctxMeasure.font = footerFont;
    if (!text) return [''];
    const words = text.split(' ');
    const lines = [];
    let current = '';
    for (const word of words) {
      const test = current ? `${current} ${word}` : word;
      if (ctxMeasure.measureText(test).width > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);
    return lines;
  }

  const footerLines = [];
  if (Array.isArray(data.footerLines)) {
    for (const line of data.footerLines) {
      if (line === '') footerLines.push('');
      else footerLines.push(...wrapText(line, Math.max(100, tableWidth - 24)));
    }
  } else if (typeof data.footerText === 'string' && data.footerText.length > 0) {
    footerLines.push(...wrapText(data.footerText, Math.max(100, tableWidth - 24)));
  }

  const footerHeight = footerLines.length > 0 ? footerLines.length * footerLineHeight : 0;

  const sectionHeights = data.sections.map(
    section => sectionLabelHeight + computedHeaderRowHeight + rowHeight + section.rows.length * rowHeight,
  );
  const tableHeight = sectionHeights.reduce((sum, height) => sum + height, 0);

  const width = tableWidth;
  const height = titleHeight + tableHeight + footerHeight;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = oddRowBg;
  ctx.fillRect(0, 0, width, height);

  ctx.font = 'bold 22px Arial';
  ctx.fillStyle = headerText;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(data.title, width / 2, titleHeight / 2);

  let y = titleHeight;

  for (const section of data.sections) {
    ctx.font = 'bold 18px Arial';
    ctx.fillStyle = headerText;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(section.label, width / 2, y + sectionLabelHeight / 2);
    y += sectionLabelHeight;

    let x = 0;
    let colOffset = 0;
    for (const groupHeader of data.groupHeaders) {
      let spanWidth = 0;
      for (let spanIndex = 0; spanIndex < groupHeader.span; spanIndex += 1) {
        spanWidth += colWidths[colOffset + spanIndex] || 0;
      }

      ctx.fillStyle = headerBg;
      ctx.fillRect(x, y, spanWidth, computedHeaderRowHeight);
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, spanWidth, computedHeaderRowHeight);

      const lines = String(groupHeader.label || '').split('\n');
      const totalHeight = lines.length * 22;
      const startY = y + computedHeaderRowHeight - 6 - (totalHeight - 22);

      ctx.font = headerFont;
      ctx.fillStyle = headerText;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
        ctx.fillText(lines[lineIndex], x + spanWidth / 2, startY + lineIndex * 22);
      }

      x += spanWidth;
      colOffset += groupHeader.span;
    }

    y += computedHeaderRowHeight;

    x = 0;
    for (let colIndex = 0; colIndex < colCount; colIndex += 1) {
      ctx.fillStyle = headerBg;
      ctx.fillRect(x, y, colWidths[colIndex], rowHeight);
      ctx.strokeStyle = borderColor;
      ctx.strokeRect(x, y, colWidths[colIndex], rowHeight);
      ctx.font = cellFont;
      ctx.fillStyle = headerText;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(data.columnHeaders[colIndex] || ''), x + colWidths[colIndex] / 2, y + rowHeight / 2);
      x += colWidths[colIndex];
    }

    y += rowHeight;

    for (let rowIndex = 0; rowIndex < section.rows.length; rowIndex += 1) {
      x = 0;
      const row = section.rows[rowIndex];
      ctx.fillStyle = rowIndex % 2 === 0 ? evenRowBg : oddRowBg;
      ctx.fillRect(0, y, width, rowHeight);

      for (let colIndex = 0; colIndex < colCount; colIndex += 1) {
        ctx.strokeStyle = borderColor;
        ctx.strokeRect(x, y, colWidths[colIndex], rowHeight);
        ctx.font = cellFont;
        ctx.fillStyle = textColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const value = row[colIndex] == null ? '' : String(row[colIndex]);
        ctx.fillText(value, x + colWidths[colIndex] / 2, y + rowHeight / 2);
        x += colWidths[colIndex];
      }

      y += rowHeight;
    }
  }

  if (footerLines.length > 0) {
    ctx.fillStyle = footerBg;
    ctx.fillRect(0, y, width, footerHeight);

    ctx.font = footerFont;
    ctx.fillStyle = footerColor;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    let footerY = y;
    for (const line of footerLines) {
      ctx.fillText(line.trim(), 12, footerY);
      footerY += footerLineHeight;
    }
  }

  return canvas.toBuffer('image/png');
}

module.exports = {
  renderStackedSectionsTableChart,
};
