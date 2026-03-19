
// Generates the Bot Upgrades and Costs chart for each bot type (Flame, Golden, Thunder, Amplify)
const style = require('./style.js');
const { renderWrappedTableChart } = require('./wrappedTableChartRenderer.js');
const {
  BOT_UPGRADES_DATA: SHARED_BOT_UPGRADES_DATA,
} = require('../../../../../packages/platform/dist/tools/bots.js');

function toLegacyBotUpgradeRows(bot) {
  return bot.costs.map((cost, index) => {
    const levelLabel = index === 0 ? 'Unlock' : String(index);
    const statCells = bot.statValues.map(values => values[index] || '');
    return [levelLabel, String(cost), ...statCells];
  });
}

function toLegacyBotUpgradeData(bot) {
  return {
    title: `${bot.name} Upgrades & Costs`,
    headers: ['Level', 'Medals', ...bot.statNames],
    rows: toLegacyBotUpgradeRows(bot),
    labInfo: [
      ['Lab Name', 'Max Level', 'Max Value'],
      ...bot.labInfo.map(info => [info.name, String(info.maxLevel), String(info.maxValue)]),
    ],
  };
}

const BOT_UPGRADES_DATA = Object.fromEntries(
  SHARED_BOT_UPGRADES_DATA.map(bot => [bot.name, toLegacyBotUpgradeData(bot)]),
);

// Chart rendering function (style matches module substat chart)
async function generateBotUpgradesChart(botType = 'Flame Bot') {
  if (!BOT_UPGRADES_DATA[botType]) throw new Error('Invalid bot type');
  const data = BOT_UPGRADES_DATA[botType];

  const labRowHeight = 28;
  const labInfoMargin = 10;
  let labInfoHeight = 0;
  if (data.labInfo) {
    labInfoHeight = data.labInfo.length * labRowHeight + labInfoMargin;
  }
  return renderWrappedTableChart({
    data,
    style,
    maxHeaderWidth: 90,
    extraHeight: labInfoHeight,
    afterRows: ({
      ctx,
      y,
      margin,
      colWidths,
      tableWidth,
      borderColor,
      headerBg,
      headerText,
      evenRowBg,
    }) => {
      if (!data.labInfo) {
        return;
      }

      ctx.font = 'bold 15px Arial';
      let labY = y + labInfoMargin;
      const labColWidths = data.labInfo[0].length === colWidths.length
        ? colWidths
        : Array(data.labInfo[0].length).fill(Math.floor(tableWidth / data.labInfo[0].length));

      for (let row = 0; row < data.labInfo.length; row += 1) {
        let labX = margin;
        for (let col = 0; col < data.labInfo[row].length; col += 1) {
          ctx.fillStyle = row === 0 ? headerBg : evenRowBg;
          ctx.fillRect(labX, labY, labColWidths[col], labRowHeight);

          ctx.strokeStyle = borderColor;
          ctx.strokeRect(labX, labY, labColWidths[col], labRowHeight);

          ctx.fillStyle = headerText;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(data.labInfo[row][col], labX + labColWidths[col] / 2, labY + labRowHeight / 2);

          labX += labColWidths[col];
        }

        labY += labRowHeight;
      }
    },
  });
}

module.exports = { generateBotUpgradesChart, BOT_UPGRADES_DATA };
