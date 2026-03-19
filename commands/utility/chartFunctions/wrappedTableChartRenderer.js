const { createCanvas } = require('canvas');
const { buildWrappedTableLayout } = require('./tableLayoutUtils.js');

function renderWrappedTableChart({
  data,
  style,
  maxHeaderWidth = 90,
  headerLineHeight = 18,
  bottomPadding = 36,
  extraHeight = 0,
  getCellTextColor,
  getRowBackground,
  afterRows,
}) {
  const headerFont = style.headerFont;
  const cellFont = style.cellFont;
  const headerCellFont = style.headerCellFont;
  const cellPadding = style.cellPadding;
  const baseRowHeight = style.baseRowHeight;
  const margin = style.margin;
  const borderColor = style.borderColor;
  const headerBg = style.headerBg;
  const headerText = style.headerText;
  const evenRowBg = style.evenRowBg;
  const oddRowBg = style.oddRowBg;
  const textColor = style.textColor;

  const {
    colWidths,
    headerWrappedLines,
    headerActualRowHeight,
  } = buildWrappedTableLayout({
    headers: data.headers,
    rows: data.rows,
    headerCellFont,
    cellFont,
    cellPadding,
    maxHeaderWidth,
    headerLineHeight,
  });

  const tableWidth = colWidths.reduce((a, b) => a + b, 0);
  const tableHeight = headerActualRowHeight + data.rows.length * baseRowHeight;
  const canvas = createCanvas(tableWidth + margin * 2, tableHeight + margin * 2 + bottomPadding + extraHeight);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = oddRowBg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.font = headerFont;
  ctx.fillStyle = headerText;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(data.title, canvas.width / 2, margin / 2);

  let y = margin + 36;
  let x = margin;

  ctx.font = headerCellFont;
  for (let col = 0; col < data.headers.length; col += 1) {
    ctx.fillStyle = headerBg;
    ctx.fillRect(x, y, colWidths[col], headerActualRowHeight);
    ctx.strokeStyle = borderColor;
    ctx.strokeRect(x, y, colWidths[col], headerActualRowHeight);

    ctx.fillStyle = headerText;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lines = headerWrappedLines[col];
    const totalTextHeight = lines.length * headerLineHeight;
    const startY = y + (headerActualRowHeight - totalTextHeight) / 2 + headerLineHeight / 2;
    for (let line = 0; line < lines.length; line += 1) {
      ctx.fillText(lines[line], x + colWidths[col] / 2, startY + line * headerLineHeight);
    }

    x += colWidths[col];
  }

  y += headerActualRowHeight;
  ctx.font = cellFont;

  for (let row = 0; row < data.rows.length; row += 1) {
    x = margin;
    const defaultRowBg = row % 2 === 0 ? evenRowBg : oddRowBg;
    const rowBg = getRowBackground
      ? getRowBackground({ rowIndex: row, defaultRowBg })
      : defaultRowBg;

    for (let col = 0; col < data.headers.length; col += 1) {
      const value = String(data.rows[row][col] || '');

      ctx.fillStyle = rowBg;
      ctx.fillRect(x, y, colWidths[col], baseRowHeight);
      ctx.strokeStyle = borderColor;
      ctx.strokeRect(x, y, colWidths[col], baseRowHeight);

      ctx.fillStyle = getCellTextColor
        ? getCellTextColor({ rowIndex: row, colIndex: col, value, defaultTextColor: textColor })
        : textColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(value, x + colWidths[col] / 2, y + baseRowHeight / 2);

      x += colWidths[col];
    }

    y += baseRowHeight;
  }

  if (typeof afterRows === 'function') {
    afterRows({
      ctx,
      y,
      margin,
      colWidths,
      tableWidth,
      borderColor,
      headerBg,
      headerText,
      evenRowBg,
      oddRowBg,
      textColor,
    });
  }

  return canvas.toBuffer('image/png');
}

module.exports = {
  renderWrappedTableChart,
};
