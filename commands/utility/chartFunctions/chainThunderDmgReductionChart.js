// Chain Thunder Dmg Reduction Chart
const style = require('./style.js');
const { renderWrappedTableChart } = require('./wrappedTableChartRenderer.js');
const { chainThunderReductionData } = require('../../../../../packages/platform/dist/tools/chart-data.js');

const CHAIN_THUNDER_DMG_REDUCTION = {
  title: chainThunderReductionData.title,
  headers: chainThunderReductionData.columns.map(column => column.label),
  rows: chainThunderReductionData.rows.map(row => [
    String(row.ctLabLevel),
    `${row.ctReductionPercent}%`,
    `+${row.clPlusRequired}`,
  ]),
};

// Color map for rows (by index)
const colorMap = {
  cyan:   [2,3,4,5,6,7],
  magenta:[8,9,10,11,12,13],
  orange: [14,15,16,17,18,19],
  red:    [20,21,22,23,24,25],
  green:  [26,27,28,29,30]
};

function getRowColor(rowIdx) {
  if (colorMap.cyan.includes(rowIdx+1)) return '#00ffff';
  if (colorMap.magenta.includes(rowIdx+1)) return '#ff00ff';
  if (colorMap.orange.includes(rowIdx+1)) return '#ff9900';
  if (colorMap.green.includes(rowIdx+1)) return '#00ff00';
  if (colorMap.red.includes(rowIdx+1)) return '#ff0000';
  return null;
}

async function generateChainThunderDmgReductionChart() {
  const data = CHAIN_THUNDER_DMG_REDUCTION;
  return renderWrappedTableChart({
    data,
    style,
    maxHeaderWidth: 120,
    getCellTextColor: ({ rowIndex, defaultTextColor }) => getRowColor(rowIndex) || defaultTextColor,
  });
}

module.exports = { generateChainThunderDmgReductionChart };
