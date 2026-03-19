// Guild Box Rewards Chart
const style = require('./style.js');
const { renderSimpleTableChart } = require('./simpleTableChartRenderer.js');
const { guildBoxRewardsData, toSharedChartTablePreviewRows } = require('../../../../../packages/platform/dist/tools/chart-data.js');

const GUILD_BOX_REWARDS = {
  title: guildBoxRewardsData.title,
  headers: guildBoxRewardsData.columns.map(column => column.label),
  rows: toSharedChartTablePreviewRows(guildBoxRewardsData),
};

function getCellColor(value) {
  // Color logic: check for k, M, or B
  if (typeof value !== 'string') return '#e6e6e6';
  if (value === 'Bits') return '#e6e6e6'; // Don't color the Bits label
  if (value.includes('k')) return '#038cfc'; // cyan for thousands
  if (value.includes('M')) return '#ff00ff'; // magenta for millions
  if (value.includes('B')) return '#7fff7f'; // green for billions
  return '#e6e6e6';
}

async function generateGuildBoxRewardsChart() {
  const data = GUILD_BOX_REWARDS;
  const coinsStart = 0; // first row to span (0-based)
  const coinsEnd = 18;  // last row to span (exclusive)
  const coinsSpanRows = coinsEnd - coinsStart;

  return renderSimpleTableChart({
    data,
    style,
    headerRowHeight: 36,
    titleYOffset: style.margin + 36,
    bottomPadding: 36,
    shouldSkipCell: ({ rowIndex, colIndex }) => colIndex === 0 && rowIndex < coinsEnd,
    beforeRows: ({ ctx, y, x, colWidths, baseRowHeight, borderColor, textColor, oddRowBg }) => {
      ctx.fillStyle = oddRowBg;
      ctx.fillRect(x, y, colWidths[0], baseRowHeight * coinsSpanRows);
      ctx.strokeStyle = borderColor;
      ctx.strokeRect(x, y, colWidths[0], baseRowHeight * coinsSpanRows);
      ctx.fillStyle = textColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.save();
      ctx.font = 'bold 16px Arial';
      ctx.fillText('Coins', x + colWidths[0] / 2, y + (baseRowHeight * coinsSpanRows) / 2);
      ctx.restore();
    },
    getCellTextColor: ({ value, defaultColor }) => getCellColor(String(value || '')) || defaultColor,
    customCellRenderer: ({ ctx, rowIndex, colIndex, x, y, width, height, value }) => {
      const cellValue = String(value || '');
      if (colIndex === 0 && ['Gems', 'Tokens', 'Bits'].includes(cellValue)) {
        ctx.save();
        ctx.font = 'bold 15px Arial';
        ctx.fillText(cellValue, x + width / 2, y + height / 2);
        ctx.restore();
        return true;
      }

      if (colIndex === data.headers.length - 1 && cellValue && !Number.isNaN(Number(cellValue))) {
        ctx.save();
        ctx.font = 'bold 15px Arial';
        ctx.fillText(cellValue, x + width / 2, y + height / 2);
        ctx.restore();
        return true;
      }

      return false;
    },
  });
}

module.exports = { generateGuildBoxRewardsChart };
