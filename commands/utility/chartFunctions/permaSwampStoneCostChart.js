// Perma Swamp Stone Costs Chart Generator
// Credit: u/Malice_Striker
// A quick analysis of the stone costs to achieve perma Poison Swamp and the most stone efficient way to do so.
// Category: Ultimate Weapons > Poison Swamp > Perma Swamp Stone Costs

const { createCanvas } = require('canvas');
const style = require('./style');

const TITLE = 'Perma Swamp Stone Costs';
const FOOTER = 'Credit: u/Malice_Striker';
const DESCRIPTION = `Stone costs to achieve permanent Poison Swamp (1:1 sync) 
and the most stone efficient way to do so.`;

// Table data from the image
const HEADERS = [
  'Duration', 'Stones', 'Cooldown', 'Stones', 'Sync', 'Total Cost'
];
const DATA = [
  ['55', '220', '55', '1750', '55/55', '1970'],
  ['60', '340', '60', '1508', '60/60', '1848'],
  ['65', '490', '65', '1284', '65/65', '1774'],
  ['70', '690', '70', '1078', '70/70', '1768'],
  ['75', '950', '75', '890', '75/75', '1840'],
  ['80', '1280', '80', '720', '80/80', '2000'],
];

// Bar chart data (sync, total cost)
const BAR_LABELS = ['55/55', '60/60', '65/65', '70/70', '75/75', '80/80'];
const BAR_VALUES = [1970, 1848, 1774, 1768, 1840, 2000];

async function generatePermaSwampStoneCostChart() {
  // Style
  const font = style.font;
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
  const accentRed = style.accentRed || '#ff3c28';

  // Table column widths
  const ctx = createCanvas(10, 10).getContext('2d');
  ctx.font = headerFont;
  const colWidths = HEADERS.map((header, i) => {
    let max = ctx.measureText(header).width;
    ctx.font = cellFont;
    for (const row of DATA) {
      max = Math.max(max, ctx.measureText(row[i]).width);
    }
    return Math.ceil(max) + cellPadding * 2;
  });
  const tableWidth = colWidths.reduce((a, b) => a + b, 0);
  const width = Math.max(tableWidth + margin * 2, 600);

  // Table heights
  ctx.font = headerFont;
  const headerHeight = rowHeight;
  ctx.font = cellFont;
  const dataHeight = DATA.length * rowHeight;
  const descLines = DESCRIPTION.split('\n');
  const descHeight = descLines.length * 20 + 10;
  const titleHeight = 44;
  const tableBlockHeight = headerHeight + dataHeight;

  // Bar chart area
  const barChartHeight = 220;
  const barChartTop = margin + titleHeight + descHeight + tableBlockHeight + 20;
  const totalHeight = barChartTop + barChartHeight + 40;

  // Create canvas
  const canvas = createCanvas(width, totalHeight);
  const ctx2 = canvas.getContext('2d');
  ctx2.fillStyle = oddRowBg;
  ctx2.fillRect(0, 0, width, totalHeight);

  // Draw title
  ctx2.font = 'bold 22px Arial';
  ctx2.fillStyle = headerText;
  ctx2.textAlign = 'center';
  ctx2.textBaseline = 'top';
  ctx2.fillText(TITLE, width / 2, margin / 2);

  // Draw description
  ctx2.font = cellFont;
  ctx2.fillStyle = textColor;
  ctx2.textAlign = 'left';
  let descY = margin / 2 + titleHeight;
  for (const line of descLines) {
    ctx2.fillText(line, margin, descY);
    descY += 20;
  }

  // Draw table headers
  let x = margin;
  let y = margin / 2 + titleHeight + descHeight;
  ctx2.font = headerFont;
  ctx2.textAlign = 'center';
  ctx2.textBaseline = 'middle';
  for (let i = 0; i < HEADERS.length; i++) {
    ctx2.fillStyle = headerBg;
    ctx2.fillRect(x, y, colWidths[i], headerHeight);
    ctx2.strokeStyle = borderColor;
    ctx2.lineWidth = 1;
    ctx2.strokeRect(x, y, colWidths[i], headerHeight);
    ctx2.fillStyle = headerText;
    ctx2.fillText(HEADERS[i], x + colWidths[i] / 2, y + headerHeight / 2);
    x += colWidths[i];
  }

  // Draw data rows
  y += headerHeight;
  ctx2.font = cellFont;
  for (let r = 0; r < DATA.length; r++) {
    x = margin;
    ctx2.textAlign = 'center';
    ctx2.textBaseline = 'middle';
    ctx2.fillStyle = (r % 2 === 0) ? evenRowBg : oddRowBg;
    ctx2.fillRect(margin, y, tableWidth, rowHeight);
    for (let i = 0; i < DATA[r].length; i++) {
      ctx2.strokeStyle = borderColor;
      ctx2.lineWidth = 1;
      ctx2.strokeRect(x, y, colWidths[i], rowHeight);
      ctx2.fillStyle = textColor;
      ctx2.fillText(DATA[r][i], x + colWidths[i] / 2, y + rowHeight / 2);
      x += colWidths[i];
    }
    y += rowHeight;
  }

  // Draw bar chart
  // Bar chart area: below table, centered
  // Dynamically calculate left margin for y-axis label
  ctx2.save();
  ctx2.font = cellFont;
  // Find the widest y-axis label
  const yAxisLabels = [];
  const maxValue = Math.max(...BAR_VALUES);
  const minValue = Math.min(...BAR_VALUES);
  const yAxisMin = Math.floor(minValue / 100) * 100 - 100;
  const yAxisMax = Math.ceil(maxValue / 100) * 100 + 100;
  const yAxisRange = yAxisMax - yAxisMin;
  for (let v = yAxisMin; v <= yAxisMax; v += 200) {
    yAxisLabels.push(v.toString());
  }
  // Also measure the y-axis title rotated
  const yAxisTitle = 'Total Cost';
  // Get the max width of the y-axis value labels
  let maxLabelWidth = 0;
  for (const label of yAxisLabels) {
    maxLabelWidth = Math.max(maxLabelWidth, ctx2.measureText(label).width);
  }
  // Get the height of the y-axis title (when rotated)
  ctx2.save();
  ctx2.font = cellFont;
  ctx2.rotate(-Math.PI / 2);
  const yAxisTitleWidth = ctx2.measureText(yAxisTitle).width;
  ctx2.restore();
  // Add some padding between label and chart, and between title and labels
  const yAxisLabelPad = Math.ceil(maxLabelWidth) + 8;
  const yAxisTitlePad = Math.ceil(yAxisTitleWidth) + 8;
  // Final left margin for chart
  const chartLeft = margin + 10 + yAxisLabelPad + yAxisTitlePad;
  const chartRight = width - margin - 10;
  const chartWidth = chartRight - chartLeft;
  const chartBottom = barChartTop + barChartHeight - 40;
  const chartTop = barChartTop + 30;
  const barWidth = Math.floor(chartWidth / BAR_LABELS.length * 0.7);
  const barGap = Math.floor(chartWidth / BAR_LABELS.length * 0.3);

  // Draw y-axis grid lines and labels
  ctx2.font = cellFont;
  ctx2.textAlign = 'right';
  ctx2.fillStyle = textColor;
  ctx2.strokeStyle = '#888';
  ctx2.lineWidth = 1;
  // Draw y-axis grid lines and value labels (value labels will be to the right of the y-axis title)
  for (let v = yAxisMin; v <= yAxisMax; v += 200) {
    const yVal = chartBottom - ((v - yAxisMin) / yAxisRange) * (chartBottom - chartTop);
    ctx2.beginPath();
    ctx2.moveTo(chartLeft, yVal);
    ctx2.lineTo(chartRight, yVal);
    ctx2.strokeStyle = '#444';
    ctx2.stroke();
    // Draw value label to the right of the y-axis title
    ctx2.fillText(v.toString(), chartLeft - yAxisLabelPad, yVal + 4);
  }

  // Draw bars
  for (let i = 0; i < BAR_LABELS.length; i++) {
    const barHeight = ((BAR_VALUES[i] - yAxisMin) / yAxisRange) * (chartBottom - chartTop);
    const barX = chartLeft + i * (barWidth + barGap);
    const barY = chartBottom - barHeight;
    ctx2.fillStyle = '#8bc47f';
    ctx2.fillRect(barX, barY, barWidth, barHeight);
    // Value label above bar
    ctx2.font = 'bold 16px Arial';
    ctx2.fillStyle = accentRed;
    ctx2.textAlign = 'center';
    ctx2.fillText(BAR_VALUES[i].toString(), barX + barWidth / 2, barY - 6);
  }

  // Draw x-axis labels
  ctx2.font = cellFont;
  ctx2.fillStyle = textColor;
  ctx2.textAlign = 'center';
  for (let i = 0; i < BAR_LABELS.length; i++) {
    const barX = chartLeft + i * (barWidth + barGap);
    ctx2.fillText(BAR_LABELS[i], barX + barWidth / 2, chartBottom + 18);
  }

  // Draw axis titles
  ctx2.font = cellFont;
  ctx2.textAlign = 'center';
  ctx2.fillStyle = textColor;
  ctx2.fillText('Duration:CD Sync', chartLeft + chartWidth / 2, chartBottom + 38);
  // Draw y-axis title furthest left, then value labels to its right
  ctx2.save();
  ctx2.translate(chartLeft - yAxisLabelPad - yAxisTitlePad + 2, chartTop + (chartBottom - chartTop) / 2);
  ctx2.rotate(-Math.PI / 2);
  ctx2.textAlign = 'center';
  ctx2.fillText('Total Cost', 0, 0);
  ctx2.restore();
  ctx2.restore();

  // Draw bar chart title
  ctx2.font = headerFont;
  ctx2.textAlign = 'center';
  ctx2.fillStyle = textColor;
  ctx2.fillText('Total Cost vs. "Perma-Swamp" (1:1)', chartLeft + chartWidth / 2, barChartTop);

  // Draw footer
  ctx2.font = footerFont;
  ctx2.fillStyle = footerBg;
  ctx2.fillRect(0, totalHeight - 32, width, 32);
  ctx2.fillStyle = footerColor;
  ctx2.textAlign = 'left';
  ctx2.fillText(FOOTER, margin, totalHeight - 24);

  return canvas.toBuffer('image/png');
}

module.exports = { generatePermaSwampStoneCostChart };
