const prog = require('./eliteSpawnChanceChart_prog.js');

const DATA = prog.DATA;

function printPreview(rows = 6) {
    for (let r = 0; r < Math.min(rows, DATA.length); r++) {
        console.log(`${r}: ${DATA[r].join(' | ')}`);
    }
}

printPreview(6);
