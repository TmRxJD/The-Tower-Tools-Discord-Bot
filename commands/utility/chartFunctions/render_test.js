const fs = require('fs');
const { generateEliteSpawnChanceChart } = require('./eliteSpawnChanceChart');

(async () => {
  try {
    const buf = await generateEliteSpawnChanceChart();
    fs.writeFileSync('test_elite_chart.png', buf);
    console.log('wrote test_elite_chart.png');
  } catch (err) {
    console.error('render error', err);
    process.exitCode = 2;
  }
})();
