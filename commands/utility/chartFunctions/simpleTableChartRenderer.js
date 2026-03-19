const { createCanvas } = require('canvas');

function renderSimpleTableChart({
  data,
  style,
  headerRowHeight = 36,
  dataRowHeight,
  titleYOffset = 36,
  bottomPadding = 36,
  getHeaderBackground,
  getRowBackground,
  getCellText,
  getCellTextColor,
  shouldSkipCell,
  customCellRenderer,
  beforeHeader,
  customHeaderRenderer,
  beforeRows,
  afterRows,
}) {
  const headerFont = style.headerFont;
  const cellFont = style.cellFont;
  const headerCellFont = style.headerCellFont;
  const cellPadding = style.cellPadding;
  const baseRowHeight = style.baseRowHeight;
  const rowHeight = Number.isFinite(dataRowHeight) ? dataRowHeight : baseRowHeight;
  const margin = style.margin;
  const borderColor = style.borderColor;
  const headerBg = style.headerBg;
  const headerText = style.headerText;
  const evenRowBg = style.evenRowBg;
  const oddRowBg = style.oddRowBg;
  const textColor = style.textColor;

  const ctxMeasure = createCanvas(10, 10).getContext('2d');
  ctxMeasure.font = cellFont;

  const colWidths = data.headers.map((header, colIndex) => {
    let max = ctxMeasure.measureText(String(header || '')).width;
    for (let rowIndex = 0; rowIndex < data.rows.length; rowIndex += 1) {
      const row = data.rows[rowIndex];
      const value = getCellText
        ? getCellText({ row, rowIndex, colIndex, defaultValue: row[colIndex] || '' })
        : row[colIndex] || '';
      max = Math.max(max, ctxMeasure.measureText(String(value)).width);
    }
    return max + cellPadding * 2;
  });

  const tableWidth = colWidths.reduce((sum, width) => sum + width, 0);
  const tableHeight = headerRowHeight + data.rows.length * rowHeight;
  const canvas = createCanvas(tableWidth + margin * 2, tableHeight + margin * 2 + bottomPadding);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = oddRowBg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.font = headerFont;
  ctx.fillStyle = headerText;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(data.title, canvas.width / 2, margin / 2);

  let y = titleYOffset;
  if (typeof beforeHeader === 'function') {
    const nextY = beforeHeader({
      ctx,
      y,
      margin,
      colWidths,
      tableWidth,
      headerCellFont,
      headerText,
      headerBg,
      borderColor,
      textColor,
      cellFont,
    });
    if (typeof nextY === 'number' && Number.isFinite(nextY)) {
      y = nextY;
    }
  }
  let usedCustomHeader = false;
  if (typeof customHeaderRenderer === 'function') {
    const nextY = customHeaderRenderer({
      ctx,
      y,
      margin,
      colWidths,
      headers: data.headers,
      headerRowHeight,
      borderColor,
      headerBg,
      headerText,
      headerCellFont,
      getHeaderBackground,
    });
    if (typeof nextY === 'number' && Number.isFinite(nextY)) {
      y = nextY;
      usedCustomHeader = true;
    }
  }

  if (!usedCustomHeader) {
    let x = margin;

    ctx.font = headerCellFont;
    for (let col = 0; col < data.headers.length; col += 1) {
      ctx.fillStyle = getHeaderBackground
        ? getHeaderBackground({ colIndex: col, defaultBackground: headerBg })
        : headerBg;
      ctx.fillRect(x, y, colWidths[col], headerRowHeight);

      ctx.strokeStyle = borderColor;
      ctx.strokeRect(x, y, colWidths[col], headerRowHeight);

      ctx.fillStyle = headerText;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const headerLines = String(data.headers[col] || '').split('\n');
      const headerLineHeight = 16;
      const totalHeaderTextHeight = headerLines.length * headerLineHeight;
      const headerStartY = y + (headerRowHeight - totalHeaderTextHeight) / 2 + headerLineHeight / 2;
      for (let lineIndex = 0; lineIndex < headerLines.length; lineIndex += 1) {
        ctx.fillText(
          headerLines[lineIndex],
          x + colWidths[col] / 2,
          headerStartY + lineIndex * headerLineHeight,
        );
      }

      x += colWidths[col];
    }

    y += headerRowHeight;
  }

  ctx.font = cellFont;

  if (typeof beforeRows === 'function') {
    beforeRows({
      ctx,
      y,
      x: margin,
      colWidths,
      baseRowHeight,
      rowHeight,
      borderColor,
      textColor,
      oddRowBg,
      evenRowBg,
    });
  }

  for (let rowIndex = 0; rowIndex < data.rows.length; rowIndex += 1) {
    x = margin;
    const row = data.rows[rowIndex];
    const defaultRowBg = rowIndex % 2 === 0 ? evenRowBg : oddRowBg;
    const rowBg = getRowBackground
      ? getRowBackground({ rowIndex, row, defaultBackground: defaultRowBg })
      : defaultRowBg;

    for (let colIndex = 0; colIndex < data.headers.length; colIndex += 1) {
      if (shouldSkipCell?.({ row, rowIndex, colIndex }) === true) {
        x += colWidths[colIndex];
        continue;
      }

      ctx.fillStyle = rowBg;
      ctx.fillRect(x, y, colWidths[colIndex], rowHeight);

      ctx.strokeStyle = borderColor;
      ctx.strokeRect(x, y, colWidths[colIndex], rowHeight);

      const rawValue = getCellText
        ? getCellText({ row, rowIndex, colIndex, defaultValue: row[colIndex] || '' })
        : row[colIndex] || '';

      ctx.fillStyle = getCellTextColor
        ? getCellTextColor({ row, rowIndex, colIndex, value: rawValue, defaultColor: textColor })
        : textColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const handled = customCellRenderer?.({
        ctx,
        row,
        rowIndex,
        colIndex,
        x,
        y,
        width: colWidths[colIndex],
        height: rowHeight,
        value: rawValue,
        textColor,
      }) === true;

      if (!handled) {
        ctx.fillText(String(rawValue), x + colWidths[colIndex] / 2, y + rowHeight / 2);
      }

      x += colWidths[colIndex];
    }

    y += rowHeight;
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
      baseRowHeight,
      rowHeight,
      cellFont,
      footerFont: style.footerFont,
      footerBg: style.footerBg,
      footerColor: style.footerColor,
    });
  }

  return canvas.toBuffer('image/png');
}

module.exports = {
  renderSimpleTableChart,
};
