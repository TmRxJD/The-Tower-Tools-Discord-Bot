// CF+ Speed Rates Chart Generator
// Credits: Priesten, yournicknm
// Documents hidden slow% and enemy speed rates for CF+ upgrades
// Category: Ultimate Weapons > Chronofield > CF+ Speed Rates

const style = require('./style.js');
const { renderDescribedTableChart } = require('./describedTableChartRenderer.js');
const { cfPlusSpeedRatesData } = require('../../../../../packages/platform/dist/tools/chart-data.js');

const TITLE = 'CF+ Speed Rates';
const FOOTER = 'Credits: @priesten / @yournicknm';
const DESCRIPTION = `
In addition to the rotational rate, CF+ provides a hidden benefit of reducing enemy speed by a
percentage, for all enemies within CF Range. This rate of enemy speed reduction increases per CF+ level.

Unlike many of exponential growth stats in The Tower, this slow effect does not suffer diminishing
returns as CF+ level increases, but instead becomes stronger with each additional level.`;
const FORMULA = 'CF+ Slow Formula: newEnemySpeed = enemySpeed * (1 + (CFPlusLevel * -0.05))';

const HEADERS = cfPlusSpeedRatesData.columns.map(column => column.label);
const DATA = cfPlusSpeedRatesData.rows.map(row => [
  String(row.cfPlusLevel),
  `${row.hiddenSlowPercent}%`,
  String(row.oldEnemySpeed),
  String(row.newEnemySpeed),
  `${row.enemySpeedRatePercent}% slower`,
]);

async function generateCFPlusSpeedRatesChart() {
  return renderDescribedTableChart({
    title: TITLE,
    description: DESCRIPTION,
    headers: HEADERS,
    rows: DATA,
    style,
    formula: FORMULA,
    footer: FOOTER,
  });
}

module.exports = { generateCFPlusSpeedRatesChart };
