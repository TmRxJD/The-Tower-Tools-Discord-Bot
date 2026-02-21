const { createCanvas } = require('canvas');

function getWrappedLines(ctx, text, font, maxWidth) {
  ctx.font = font;
  const words = String(text || '').split(' ');
  const lines = [];
  let current = '';

  for (let index = 0; index < words.length; index += 1) {
    const test = current ? `${current} ${words[index]}` : words[index];
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = words[index];
    } else {
      current = test;
    }
  }

  if (current) lines.push(current);
  return lines;
}

function buildWrappedTableLayout({
  headers,
  rows,
  headerCellFont,
  cellFont,
  cellPadding,
  maxHeaderWidth = 90,
  headerLineHeight = 18,
}) {
  const ctx = createCanvas(10, 10).getContext('2d');

  const headerWrappedLines = headers.map(header =>
    getWrappedLines(ctx, header, headerCellFont, maxHeaderWidth),
  );

  const colWidths = headers.map((header, index) => {
    const wrapped = headerWrappedLines[index];
    ctx.font = headerCellFont;
    const headerWidth = Math.max(...wrapped.map(line => ctx.measureText(line).width));

    ctx.font = cellFont;
    let max = headerWidth;
    for (const row of rows) {
      max = Math.max(max, ctx.measureText(String(row[index] || '')).width);
    }

    return Math.max(max, headerWidth) + cellPadding * 2;
  });

  const headerMaxLines = headerWrappedLines.reduce((max, lines) => Math.max(max, lines.length), 1);
  const headerActualRowHeight = headerMaxLines * headerLineHeight + 8;

  return {
    colWidths,
    headerWrappedLines,
    headerActualRowHeight,
    headerLineHeight,
  };
}

module.exports = {
  buildWrappedTableLayout,
};
