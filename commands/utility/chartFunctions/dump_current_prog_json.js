const path = require('path');
const prog = require(path.resolve(__dirname, 'eliteSpawnChanceChart.js'));
const DATA = prog.DATA;
if (!DATA) {
    console.error('No DATA exported from eliteSpawnChanceChart.js');
    process.exit(1);
}
console.log(JSON.stringify(DATA.slice(0,6), null, 2));
