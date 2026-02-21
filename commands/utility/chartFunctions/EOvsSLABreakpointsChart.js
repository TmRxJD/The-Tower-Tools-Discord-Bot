// EO vs SLA Breakpoints Chart Generator
// Credit: Yugiohcd10
// Shows breakpoints in coin efficiency of blender vs orbless with SLA and EO#
// Category: masteries > extra orb > EO vs SLA Breakpoints
// Also: Ultimate Weapons > Spotlight > EO vs SLA Breakpoints

const style = require('./style.js');
const { renderDescribedTableChart } = require('./describedTableChartRenderer.js');
const {
  eoVsSlaBreakpointsData,
  eoVsSlaBreakpointsDescription,
  eoVsSlaBreakpointsFooter,
  toSharedChartTablePreviewRows,
} = require('../../../../../packages/platform/dist/tools/chart-data.js');

const TITLE = eoVsSlaBreakpointsData.title;
const FOOTER = eoVsSlaBreakpointsFooter;
const DESCRIPTION = eoVsSlaBreakpointsDescription;
const HEADERS = eoVsSlaBreakpointsData.columns.map(column => column.label);
const DATA = toSharedChartTablePreviewRows(eoVsSlaBreakpointsData).map(row => [...row]);

async function generateEOvsSLABreakpointsChart() {
  return renderDescribedTableChart({
    title: TITLE,
    description: DESCRIPTION,
    headers: HEADERS,
    rows: DATA,
    style,
    footer: FOOTER,
  });
}

module.exports = { generateEOvsSLABreakpointsChart };
