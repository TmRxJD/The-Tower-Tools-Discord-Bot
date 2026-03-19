const fs = require('fs')
const path = require('path')
const Module = require('module')

const originalLoad = Module._load
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'canvas') {
    return require('@napi-rs/canvas')
  }
  return originalLoad.call(this, request, parent, isMain)
}

const chartFunctions = require('../../ToolsBot.js (old-readonly/commands/utility/chartFunctions')

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true })
}

async function generateLegacyCharts(outputDir) {
  const tasks = [
    { name: '01-vault--upgrades-and-cost--harmony-tree.png', run: () => chartFunctions.harmonyTreeUpgradesChart.generateHarmonyTreeUpgradesChart() },
    { name: '02-vault--upgrades-and-cost--power-tree.png', run: () => chartFunctions.powerTreeUpgradesChart.generatePowerTreeUpgradesChart() },
    { name: '03-ultimate-weapons--ultimate-weapons--upgrades-and-costs.png', run: () => chartFunctions.uwPlusUpgradesChart.generateUWPlusUpgradesChart() },
    { name: '04-ultimate-weapons--stone-costs--chain-lightning.png', run: () => chartFunctions.uwStoneCostChart.generateUWStoneCostChart('chain_lightning') },
    { name: '05-ultimate-weapons--chain-lightning--avg-bullets-to-stack-shock.png', run: () => chartFunctions.avgBulletsToStackShockChart.generateAvgBulletsToStackShockChart() },
    { name: '06-modules--substats--cannon.png', run: () => chartFunctions.moduleSubstatValuesChart.generateModuleSubstatValuesChart('Cannon') },
    { name: '07-modules--project-funding--bonus-multipliers.png', run: () => chartFunctions.bonusMultipliersChart.generateBonusMultipliersChart() },
    { name: '08-modules--blackhole-digester-bhd--wave-skip-coin-boost.png', run: () => chartFunctions.waveSkipCoinBoostChart.generateWaveSkipCoinBoostChart() },
    { name: '09-bots--upgrades-and-costs--flame-bot.png', run: () => chartFunctions.botUpgradesChart.generateBotUpgradesChart('Flame Bot') },
    { name: '10-labs--cells--most-efficient-speed-multipliers.png', run: () => chartFunctions.labSpeedMultiplierChart.generateLabSpeedMultiplierChart() },
    { name: '11-cards--masteries--all-bonuses.png', run: () => chartFunctions.cardMasteryCostChart.generateCardMasteryCostChart() },
    { name: '12-enemies--elites--elite-spawn-chance.png', run: () => chartFunctions.eliteSpawnChanceChart.generateEliteSpawnChanceChart() },
    { name: '13-masteries--wave-accelerator--spawn-rates.png', run: () => chartFunctions.waveAcceleratorSpawnRatesChart.generateWaveAcceleratorSpawnRatesChart() },
    { name: '14-masteries--recovery-package-chance-care-package--drop-rates.png', run: () => chartFunctions.recoveryPackageDropRatesChart.generateRecoveryPackageDropRatesChart() },
    { name: '15-masteries--enemy-balance--enemy-balance-mastery.png', run: () => chartFunctions.enemyBalanceMasteryChart.generateEnemyBalanceMasteryChart() },
    { name: '16-ultimate-weapons--poison-swamp--perma-swamp-stone-costs.png', run: () => chartFunctions.permaSwampStoneCostChart.generatePermaSwampStoneCostChart() },
    { name: '17-cards--wave-skip--multi-skip-chances.png', run: () => chartFunctions.waveSkipMultiSkipChanceChart.generateWaveSkipMultiSkipChanceChart() },
    { name: '18-enemies--resistances--enemy-resistances.png', run: () => chartFunctions.enemyResistancesChart.generateEnemyResistancesChart() },
    { name: '19-ultimate-weapons--chronofield--cf-speed-rates.png', run: () => chartFunctions.CFPlusSpeedRatesChart.generateCFPlusSpeedRatesChart() },
    { name: '20-ultimate-weapons--chronofield--cf-rotation-rates.png', run: () => chartFunctions.CFPlusRotationRatesChart.generateCFPlusRotationRatesChart() },
    { name: '21-masteries--extra-orb--eo-vs-sla-breakpoints.png', run: () => chartFunctions.EOvsSLABreakpointsChart.generateEOvsSLABreakpointsChart() },
    { name: '22-ultimate-weapons--death-wave--gold-bot-vs-death-wave-uptime.png', run: () => chartFunctions.goldBotVsDeathWaveUptimeChart.generateGoldBotVsDeathWaveUptimeChart() },
    { name: '23-ultimate-weapons--chain-lightning--chain-thunder-dmg-reduction.png', run: () => chartFunctions.chainThunderDmgReductionChart.generateChainThunderDmgReductionChart() },
    { name: '24-guilds--rewards--guild-box-rewards.png', run: () => chartFunctions.guildBoxRewardsChart.generateGuildBoxRewardsChart() },
  ]

  const result = {
    generatedAt: new Date().toISOString(),
    totalRequested: tasks.length,
    rendered: [],
    failed: [],
  }

  ensureDir(outputDir)

  for (const task of tasks) {
    try {
      const buffer = await task.run()
      const filePath = path.join(outputDir, task.name)
      fs.writeFileSync(filePath, buffer)
      result.rendered.push({ fileName: task.name, bytes: buffer.length })
      process.stdout.write(`Rendered legacy: ${task.name}\n`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      result.failed.push({ fileName: task.name, error: message })
      process.stdout.write(`FAILED legacy: ${task.name}\n`)
    }
  }

  fs.writeFileSync(path.join(outputDir, 'manifest-legacy.json'), JSON.stringify(result, null, 2))
  process.stdout.write(`\nLegacy review set: ${outputDir}\nRendered: ${result.rendered.length}\nFailed: ${result.failed.length}\n`)

  if (result.failed.length > 0) {
    process.exitCode = 1
  }
}

const outputArg = process.argv[2]
const outputDir = outputArg
  ? path.resolve(outputArg)
  : path.resolve(__dirname, '../../../chart-review/legacy')

generateLegacyCharts(outputDir).catch(error => {
  console.error(error)
  process.exit(1)
})
