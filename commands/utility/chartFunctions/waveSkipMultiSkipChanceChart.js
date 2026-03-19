// Wave Skip Multi-Skip Chances Chart Generator
// Category: Masteries/Cards > Wave Skip > Multi-Skip Chances
// Shows the probability of different multi-skips with Maxed Wave Skip card, WS#0, and WS#9.

const style = require('./style.js');
const { renderDescribedTableChart } = require('./describedTableChartRenderer.js');
const {
  waveSkipMultiSkipChanceData,
  waveSkipMultiSkipChanceSubheaders,
} = require('../../../../../packages/platform/dist/tools/chart-data.js');

const TITLE = waveSkipMultiSkipChanceData.title;
const DESCRIPTION = 'Probability of different multi-skips with Maxed Wave Skip card, WS#0, and WS#9.';

// Table columns and data (from provided image)
const HEADERS = waveSkipMultiSkipChanceData.columns.map(column => column.label);
const SUBHEADERS = [...waveSkipMultiSkipChanceSubheaders];
const DATA = waveSkipMultiSkipChanceData.rows.map(row => [
  row.baseCardNoMastery,
  row.baseCardMasteryUnlock,
  row.baseCardMaxedMastery,
]);

async function generateWaveSkipMultiSkipChanceChart() {
  return renderDescribedTableChart({
    title: TITLE,
    description: DESCRIPTION,
    headers: HEADERS,
    subheaders: SUBHEADERS,
    rows: DATA,
    style,
  });
}

module.exports = { generateWaveSkipMultiSkipChanceChart };
