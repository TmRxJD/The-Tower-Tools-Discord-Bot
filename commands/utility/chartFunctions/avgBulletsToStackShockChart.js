// Avg Bullets to Stack Shock Chart (Chain Lightning)
const style = require('./style.js');
const { renderWrappedTableChart } = require('./wrappedTableChartRenderer.js');
const { avgBulletsToStackShockData } = require('../../../../../packages/platform/dist/tools/chart-data.js');

function getAvgBulletsToStackShockTable() {
  return {
    title: avgBulletsToStackShockData.title,
    headers: avgBulletsToStackShockData.columns.map(column => column.label),
    rows: avgBulletsToStackShockData.rows.map(row => [
      `${Number(row.chancePercent).toFixed(1)}%`,
      String(row.proc10),
      String(row.proc15),
      String(row.proc20),
      String(row.proc25),
      String(row.proc30),
      String(row.proc35),
    ]),
  };
}


async function generateAvgBulletsToStackShockChart() {
  const data = getAvgBulletsToStackShockTable();
  return renderWrappedTableChart({
    data,
    style,
    maxHeaderWidth: 90,
  });
}

module.exports = { generateAvgBulletsToStackShockChart };
