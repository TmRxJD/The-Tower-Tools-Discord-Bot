/**
 * Enemy-stats command render helpers.
 *
 * The bot shows a focused, per-enemy-type view of the same numbers the site's
 * From-Wave calculator shows — HP, Attack, Speed, Mass, Spawn Chance — for the
 * selected type at a tier/wave with optional Enemy Level Skips. All the game math
 * comes from `thetowersdk` (computeEnemyWavePanel); this file only shapes it into
 * a chart table.
 */
import { formatCompact } from '@tmrxjd/platform/tools'
import {
  computeEnemyWavePanel,
  ENEMY_WAVE_TYPE_OPTIONS,
  type EnemyWaveEnemyType,
  parseEnemySkipInputText,
} from 'thetowersdk/mechanics'
import {
  defaultEnemyStatsSharedState,
  normalizeEnemyStatsSharedState,
  type EnemyStatsSharedState,
} from '@tmrxjd/platform/tools'

export { defaultEnemyStatsSharedState, normalizeEnemyStatsSharedState, type EnemyStatsSharedState }
export { ENEMY_WAVE_TYPE_OPTIONS, type EnemyWaveEnemyType }

export function isEnemyWaveType(value: string): value is EnemyWaveEnemyType {
  return (ENEMY_WAVE_TYPE_OPTIONS as readonly string[]).includes(value)
}

export function resolveEnemyType(state: EnemyStatsSharedState): EnemyWaveEnemyType {
  return isEnemyWaveType(state.enemyType) ? state.enemyType : 'Basic'
}

/** Compact number, or an em-dash for values the model doesn't define (e.g. Protector HP). */
function stat(value: number): string {
  return Number.isFinite(value) ? formatCompact(value) : '—'
}

/** Whole seconds when integral, else one decimal. */
function formatSeconds(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

/** Describe a skip input for the caption: raw count, percent, or effective %. */
function describeSkip(input: string, effectivePct: number): string {
  const trimmed = String(input ?? '').trim()
  if (!trimmed) return '0'
  if (trimmed.includes('%')) return `${trimmed} (≈${effectivePct.toFixed(1)}% effective)`
  return `${trimmed} skips (≈${effectivePct.toFixed(1)}%)`
}

export interface EnemyStatsChart {
  chartTitle: string
  headers: string[]
  rows: string[][]
  descriptionLines: string[]
}

/** Build the per-type stat card for the selected enemy at the current inputs. */
export function buildEnemyStatsChartRows(state: EnemyStatsSharedState): EnemyStatsChart {
  const enemyType = resolveEnemyType(state)
  const health = parseEnemySkipInputText(state.healthSkipInput)
  const attack = parseEnemySkipInputText(state.attackSkipInput)

  const panel = computeEnemyWavePanel({
    tier: state.tier,
    wave: state.wave,
    modifiers: {
      healthSkipPct: health.skipPct,
      attackSkipPct: attack.skipPct,
      healthSkipCount: health.skipCount,
      attackSkipCount: attack.skipCount,
    },
    enemyTypes: [enemyType],
  })
  const row = panel.rows[0]

  const rows: string[][] = [
    ['Health', stat(row.adjustedHp)],
    ['Attack', stat(row.adjustedDamage)],
    ['Speed', row.speed.toFixed(2)],
    ['Mass', row.mass.toFixed(1)],
    ['Spawn Chance', `${row.spawnChancePct.toFixed(1)}%`],
    ['Wave Base HP', stat(panel.waveBaseHp)],
    ['Wave Base Attack', stat(panel.waveBaseDamage)],
  ]

  const descriptionLines = [
    `Tier ${panel.tier} • Wave ${panel.wave.toLocaleString()}`,
    `Health Skip ${describeSkip(state.healthSkipInput, panel.healthEffectiveSkipPct)} • `
      + `Attack Skip ${describeSkip(state.attackSkipInput, panel.attackEffectiveSkipPct)}`,
    `Wave time ${formatSeconds(panel.footer.waveTimeSeconds)}s • Cooldown ${formatSeconds(panel.footer.waveCooldownSeconds)}s`
      + ` • Spawn cap ${panel.footer.spawnRateCap}`,
  ]
  if (enemyType === 'Protector') {
    descriptionLines.push(
      `Protector radius ${panel.footer.protectorRadiusMeters.toFixed(1)}m`
        + ` • dmg reduction ${panel.footer.protectorDamageReductionPct.toFixed(0)}%`,
    )
  }

  return {
    chartTitle: `Enemy Stats — ${enemyType}`,
    headers: ['Stat', 'Value'],
    rows,
    descriptionLines,
  }
}
