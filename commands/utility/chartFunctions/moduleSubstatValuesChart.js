// Generates the Module Substat Values chart (by Cannon, Defense, Generator, Core)
const style = require('./style.js');
const { renderSimpleTableChart } = require('./simpleTableChartRenderer.js');
const {
  moduleSubstatData,
  moduleSubstatColumns,
  moduleSubstatColumnKeys,
  moduleSubstatRarityChanceRowObject,
} = require('../../../../../packages/platform/dist/tools/chart-data.js');

async function generateModuleSubstatValuesChart(moduleType = 'Cannon') {
  // Validate moduleType
  if (!moduleSubstatData[moduleType]) throw new Error('Invalid module type');
  const categoryData = moduleSubstatData[moduleType];
  const headers = moduleSubstatColumns.map(column => column.label);
  const rowFromObject = row => moduleSubstatColumnKeys.map(key => row[key] || '');
  const data = {
    title: categoryData.title,
    headers,
    rows: [...categoryData.rows.map(row => rowFromObject(row)), rowFromObject(moduleSubstatRarityChanceRowObject)],
  };

  // Accent colors: [Substat, Common, Rare, Epic, Legendary, Mythic, Ancestral]
  // Common: gray, Rare: blue, Epic: pink, Legendary: yellow, Mythic: red, Ancestral: green
  const accentColors = [
    '#222',           // Substat (header)
    '#888a92',        // Common (gray, dark mode)
    '#3b7fff',        // Rare (blue, dark mode)
    '#e26ad9',        // Epic (pink, dark mode)
    style.accentGold, // Legendary (yellow, dark mode)
    style.accentRed,  // Mythic (red, dark mode)
    '#4be37a'         // Ancestral (green, dark mode)
  ];

  return renderSimpleTableChart({
    data,
    style,
    headerRowHeight: 36,
    titleYOffset: style.margin + 32,
    bottomPadding: 28,
    getHeaderBackground: ({ colIndex }) => accentColors[colIndex] || '#222',
  });
}

module.exports = { generateModuleSubstatValuesChart };
