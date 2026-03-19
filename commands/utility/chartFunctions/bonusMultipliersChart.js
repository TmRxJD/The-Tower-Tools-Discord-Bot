// Bonus Multipliers Chart (Modules > Project Funding)
const style = require('./style.js');
const { renderWrappedTableChart } = require('./wrappedTableChartRenderer.js');
const {
  bonusMultipliersData,
  toSharedChartTablePreviewRows,
} = require('../../../../../packages/platform/dist/tools/chart-data.js');

async function generateBonusMultipliersChart() {
  const data = {
    title: bonusMultipliersData.title,
    headers: bonusMultipliersData.columns.map(column => column.label),
    rows: toSharedChartTablePreviewRows(bonusMultipliersData).map(row => [...row]),
  };
  return renderWrappedTableChart({
    data,
    style,
    maxHeaderWidth: 120,
  });
}

module.exports = { generateBonusMultipliersChart };
