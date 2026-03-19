// CF+ Rotation Rates Chart Generator
// Credits: Priesten, Tremnen, yournicknm
// Documents rotation and orbiting times of varying CF+ upgrades
// Category: Ultimate Weapons > Chronofield > CF+ Rotation Rates

const style = require('./style.js');
const { renderDescribedTableChart } = require('./describedTableChartRenderer.js');
const {
  cfPlusRotationRatesData,
  cfPlusRotationRatesDescription,
  cfPlusRotationRatesFooter,
  toSharedChartTablePreviewRows,
} = require('../../../../../packages/platform/dist/tools/chart-data.js');

const TITLE = cfPlusRotationRatesData.title;
const FOOTER = cfPlusRotationRatesFooter;
const DESCRIPTION = cfPlusRotationRatesDescription;
const HEADERS = cfPlusRotationRatesData.columns.map(column => column.label);
const DATA = toSharedChartTablePreviewRows(cfPlusRotationRatesData).map(row => [...row]);

async function generateCFPlusRotationRatesChart() {
  return renderDescribedTableChart({
    title: TITLE,
    description: DESCRIPTION,
    headers: HEADERS,
    rows: DATA,
    style,
    footer: FOOTER,
  });
}

module.exports = { generateCFPlusRotationRatesChart };
