// Wave Accelerator Mastery: Spawn Rates Chart Generator

const { createCanvas } = require('canvas');
const style = require('./style.js');
const { renderSimpleTableChart } = require('./simpleTableChartRenderer.js');
const {
  waveAcceleratorSpawnRatesData,
  waveAcceleratorSpawnRatesHeader,
} = require('../../../../../packages/platform/dist/tools/chart-data.js');

// Headers and subheaders for proper spanning
const HEADERS = [
  { label: waveAcceleratorSpawnRatesHeader, span: 11 }
];
const SUBHEADERS = waveAcceleratorSpawnRatesData.columns.map(column => column.label);
const ROWS = waveAcceleratorSpawnRatesData.rows.map(row => [
  row.spawnCount,
  row.normal,
  row.reduction10,
  row.reduction20,
  row.reduction30,
  row.reduction40,
  row.reduction50,
  row.reduction60,
  row.reduction70,
  row.reduction80,
  row.reduction90,
  row.reduction100,
]);

const FOOTER_TEXT =
  `Each column shows the wave you need to reach to achieve the spawn count shown in the leftmost column.\n
  The header is the amount of spawn rate reduction from the mastery.`;

async function generateWaveAcceleratorSpawnRatesChart() {
  const rowHeight = style.baseRowHeight;
  const footerLineHeight = 20;
  const footerTopOffset = 6;
  const footerLeftPadding = 12;
  const footerBottomPadding = 10;

  const ctxMeasure = createCanvas(1, 1).getContext('2d');
  ctxMeasure.font = style.headerCellFont;
  const colWidths = Array(SUBHEADERS.length).fill(0);
  for (let c = 0; c < SUBHEADERS.length; c++) {
    let maxWidth = 0;
    ctxMeasure.font = style.headerCellFont;
    const sub = SUBHEADERS[c] || '';
    for (const line of String(sub).split('\n')) {
      maxWidth = Math.max(maxWidth, ctxMeasure.measureText(line).width);
    }
    ctxMeasure.font = style.font;
    for (let r = 0; r < ROWS.length; r++) {
      const cell = ROWS[r][c] || '';
      for (const line of String(cell).split('\n')) {
        maxWidth = Math.max(maxWidth, ctxMeasure.measureText(line).width);
      }
    }
    colWidths[c] = Math.ceil(maxWidth) + style.cellPadding * 2;
  }

  const tableWidth = colWidths.reduce((a, b) => a + b, 0);

  function wrapText(ctx, text, maxWidth) {
    const words = String(text || '').split(/\s+/).filter(Boolean);
    if (!words.length) return [''];

    const lines = [];
    let current = '';
    for (const word of words) {
      const testLine = current ? `${current} ${word}` : word;
      if (ctx.measureText(testLine).width > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = testLine;
      }
    }
    if (current) lines.push(current);
    return lines;
  }

  ctxMeasure.font = style.footerFont;
  const footerLines = wrapText(ctxMeasure, FOOTER_TEXT, Math.max(100, tableWidth - footerLeftPadding * 2));
  const footerHeight = footerLines.length * footerLineHeight + footerTopOffset + footerBottomPadding;

  return renderSimpleTableChart({
    data: {
      title: '',
      headers: SUBHEADERS,
      rows: ROWS,
    },
    style,
    titleYOffset: 0,
    headerRowHeight: rowHeight,
    bottomPadding: footerHeight,
    beforeHeader: ({ ctx, y, colWidths, headerBg, headerText, borderColor }) => {
      // Preserve original behavior: first header spans 11 columns, last column remains ungrouped in top row.
      const spanWidth = colWidths.slice(0, HEADERS[0].span).reduce((sum, width) => sum + width, 0);
      const x = style.margin;

      ctx.font = style.headerCellFont;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = headerBg;
      ctx.fillRect(x, y, spanWidth, rowHeight);
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, spanWidth, rowHeight);
      ctx.fillStyle = headerText;
      ctx.fillText(String(HEADERS[0].label), x + spanWidth / 2, y + rowHeight / 2);

      return y + rowHeight;
    },
    afterRows: ({ ctx, y, tableWidth, footerBg, footerColor, footerFont }) => {
      ctx.font = footerFont;
      ctx.fillStyle = footerBg;
      ctx.fillRect(0, y, tableWidth, footerHeight);
      ctx.fillStyle = footerColor;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';

      let fy = y + footerTopOffset;
      for (const line of footerLines) {
        ctx.fillText(line, footerLeftPadding, fy);
        fy += footerLineHeight;
      }
    },
  });
}

module.exports = { generateWaveAcceleratorSpawnRatesChart };
