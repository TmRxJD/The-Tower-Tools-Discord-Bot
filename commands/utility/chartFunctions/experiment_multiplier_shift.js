// Experiment: regenerate table using multiplier = ref1[row] + 1 for propagated rows
const ref1 = [0,1,2,3,4,6,8,10,12,14,16,18,20,22,24,26,28,30,32,34];
const ref2 = [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19];
const percentages = [
  ['0%','0%'],['0%','1%'],['0%','4%'],['0%','9%'],['0%','16%'],['0%','25%'],['0%','36%'],['0%','49%'],['0%','64%'],['0%','81%'],
  ['1%','100%'],['4%','100%'],['9%','100%'],['16%','100%'],['25%','100%'],['36%','100%'],['49%','100%'],['64%','100%'],['81%','100%'],['100%','100%']
];

const modifiers = [];
for (let i = 0; i < 21; i++) modifiers.push(500 * Math.pow(0.9, i));

const row1Overrides = {15:41,16:37,17:33,18:30,19:27,20:24};

const data = [];
for (let row = 0; row < percentages.length; row++) {
  const rowArr = [];
  rowArr.push(percentages[row][0]);
  rowArr.push(percentages[row][1]);
  if (row === 0) {
    for (let t=0;t<21;t++) rowArr.push('0');
  } else if (row === 1) {
    for (let t=0;t<21;t++) {
      if (Object.prototype.hasOwnProperty.call(row1Overrides, t)) rowArr.push(String(row1Overrides[t]));
      else rowArr.push(String(Math.round(modifiers[t] * 1)));
    }
  } else {
    // shifted multiplier: add 1 to ref1[row]
    const multiplier = ref1[row] + 1;
    for (let t=0;t<21;t++) rowArr.push(String(Math.round(modifiers[t] * multiplier)));
  }
  rowArr.push(ref1[row].toString());
  rowArr.push(ref2[row].toString());
  data.push(rowArr);
}

console.log(JSON.stringify(data.slice(0,6), null, 2));
