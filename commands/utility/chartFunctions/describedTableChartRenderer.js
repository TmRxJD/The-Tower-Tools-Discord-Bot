const { createCanvas } = require('canvas');

function renderDescribedTableChart({
  title,
  description,
  headers,
  subheaders,
  rows,
  style,
  formula,
  footer,
}) {
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

  const ctxMeasure = createCanvas(10, 10).getContext('2d');
  ctxMeasure.font = headerFont;
  const colWidths = headers.map((header, index) => {
    let max = 0;
    for (const part of String(header).split('\n')) {
      max = Math.max(max, ctxMeasure.measureText(part).width);
    }
    ctxMeasure.font = cellFont;
    for (const row of rows) {
      max = Math.max(max, ctxMeasure.measureText(String(row[index] || '')).width);
    }
    return Math.ceil(max) + cellPadding * 2;
  });

  const tableWidth = colWidths.reduce((total, width) => total + width, 0);
  const width = tableWidth + margin * 2;

  const headerHeight = rowHeight;
  const subheaderHeight = subheaders ? rowHeight - 4 : 0;
  const dataHeight = rows.length * rowHeight;
  const descLines = String(description || '').split('\n');
  const descHeight = descLines.length * 20 + 10;
  const formulaHeight = formula ? 28 : 0;
  const footerHeight = footer ? 30 : 0;
  const titleHeight = 44;
  const totalHeight = margin + titleHeight + descHeight + headerHeight + subheaderHeight + dataHeight + formulaHeight + footerHeight + margin;

  const canvas = createCanvas(width, totalHeight);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = oddRowBg;
  ctx.fillRect(0, 0, width, totalHeight);

  ctx.font = 'bold 22px Arial';
  ctx.fillStyle = headerText;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(title, width / 2, margin / 2);

  ctx.font = cellFont;
  ctx.fillStyle = textColor;
  ctx.textAlign = 'left';
  let descY = margin / 2 + titleHeight;
  for (const line of descLines) {
    ctx.fillText(line, margin, descY);
    descY += 20;
  }

  let x = margin;
  let y = margin / 2 + titleHeight + descHeight;
  ctx.font = headerFont;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let column = 0; column < headers.length; column += 1) {
    ctx.fillStyle = headerBg;
    ctx.fillRect(x, y, colWidths[column], headerHeight);
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, colWidths[column], headerHeight);
    ctx.fillStyle = headerText;

    const headerParts = String(headers[column]).split('\n');
    for (let line = 0; line < headerParts.length; line += 1) {
      ctx.fillText(
        headerParts[line],
        x + colWidths[column] / 2,
        y + (headerHeight / 2) + (line - (headerParts.length - 1) / 2) * 12,
      );
    }

    x += colWidths[column];
  }

  y += headerHeight;

  if (subheaders) {
    x = margin;
    ctx.font = cellFont;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let column = 0; column < subheaders.length; column += 1) {
      ctx.fillStyle = evenRowBg;
      ctx.fillRect(x, y, colWidths[column], subheaderHeight);
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, colWidths[column], subheaderHeight);
      ctx.fillStyle = textColor;
      ctx.fillText(String(subheaders[column] || ''), x + colWidths[column] / 2, y + subheaderHeight / 2);
      x += colWidths[column];
    }
    y += subheaderHeight;
  }

  ctx.font = cellFont;
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    x = margin;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = rowIndex % 2 === 0 ? evenRowBg : oddRowBg;
    ctx.fillRect(margin, y, tableWidth, rowHeight);

    for (let column = 0; column < rows[rowIndex].length; column += 1) {
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, colWidths[column], rowHeight);
      ctx.fillStyle = textColor;
      ctx.fillText(String(rows[rowIndex][column] || ''), x + colWidths[column] / 2, y + rowHeight / 2);
      x += colWidths[column];
    }

    y += rowHeight;
  }

  if (formula) {
    ctx.font = 'italic 14px Arial';
    ctx.fillStyle = textColor;
    ctx.textAlign = 'center';
    ctx.fillText(formula, width / 2, y + 22);
    y += formulaHeight;
  }

  if (footer) {
    ctx.font = footerFont;
    ctx.fillStyle = footerBg;
    ctx.fillRect(0, y, width, footerHeight);
    ctx.fillStyle = footerColor;
    ctx.textAlign = 'left';
    ctx.fillText(footer, margin, y + 8);
  }

  return canvas.toBuffer('image/png');
}

module.exports = {
  renderDescribedTableChart,
};
