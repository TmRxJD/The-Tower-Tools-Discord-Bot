// Recovery Package Chance (Care Package) Mastery: Drop Rates Chart Generator

const style = require('./style.js');
const { renderStackedSectionsTableChart } = require('./stackedSectionsTableChartRenderer.js');
const {
  recoveryPackageDropRatesTitle,
  recoveryPackageDropRatesSubheaders,
  recoveryPackageDropRatesSubsubheaders,
  recoveryPackageDropRatesSections,
  recoveryPackageDropRatesFooterText,
} = require('../../../../../packages/platform/dist/tools/chart-data.js');

const SUBHEADERS = recoveryPackageDropRatesSubheaders.map(header => ({
  label: header.label,
  span: header.span,
}));
const SUBSUBHEADERS = [...recoveryPackageDropRatesSubsubheaders];
const toLegacyRow = row => [
  row.level,
  row.value,
  row.rpc0,
  row.rpc04,
  row.rpc08,
  row.rpc12,
  row.rpc16,
  row.rpc20,
  row.rpc24,
  row.rpc28,
  row.rpc32,
  row.rpc36,
  row.rpc40,
];
const ROWS_15000 = recoveryPackageDropRatesSections[0].rows.map(row => toLegacyRow(row));
const ROWS_10000 = recoveryPackageDropRatesSections[1].rows.map(row => toLegacyRow(row));
const FOOTER_TEXT = recoveryPackageDropRatesFooterText;

async function generateRecoveryPackageDropRatesChart() {
  return renderStackedSectionsTableChart({
    data: {
      title: recoveryPackageDropRatesTitle,
      groupHeaders: SUBHEADERS,
      columnHeaders: SUBSUBHEADERS,
      sections: [
        {
          label: recoveryPackageDropRatesSections[0].label,
          rows: ROWS_15000,
        },
        {
          label: recoveryPackageDropRatesSections[1].label,
          rows: ROWS_10000,
        },
      ],
      footerText: FOOTER_TEXT,
    },
    style,
    rowHeight: style.baseRowHeight,
    titleHeight: 48,
    sectionLabelHeight: 32,
    footerLineHeight: 20,
  });
}

module.exports = { generateRecoveryPackageDropRatesChart };
