import {

  buildElsBudgetAllocation,

  buildElsUpgradePath,

  computeSimplifiedEnemyReverseTable,

  computeSimplifiedEnemyWaveTable,

  computeWorkshopSkipChances,

  ENEMY_STATS_BATTLE_CONDITION_NAMES,

  ENEMY_STATS_PERK_KEYS,

  enemyHeaderTradeOffLabels,

  formatCompact,

  formatElsMarginalSkipLevels,

  formatElsRoiPct,

  formatElsRowSkipChance,

  isEnemyStatsBattleCondition,

  normalizeEnemyStatsSharedState,

  type EnemyStatsBattleConditionName,

  type EnemyStatsPerkState,

  type EnemyStatsSharedState,

  type ElsUpgradePathInput,

  type ElsWorkshopLead,

  type SimplifiedEnemyStatsMode,

} from '@tmrxjd/platform/tools';



export {

  normalizeEnemyStatsSharedState,

  type EnemyStatsSharedState,

  type SimplifiedEnemyStatsMode,

};



export const ELS_MAX_STEPS = 20;



const PERK_LABELS = enemyHeaderTradeOffLabels(0);



const PERK_SELECT_OPTIONS: Array<{ value: keyof EnemyStatsPerkState; label: string }> = [

  { value: 'perkEnemyHpMinus50', label: PERK_LABELS.enemyHpMinus50 },

  { value: 'perkBossHpX8', label: PERK_LABELS.bossHpX8 },

  { value: 'perkBossHpMinus70', label: PERK_LABELS.bossHpMinus70 },

  { value: 'perkEnemyDmgMinus50', label: PERK_LABELS.enemyDmgMinus50 },

  { value: 'perkEnemyDmgX25', label: PERK_LABELS.enemyDmgX25 },

  { value: 'perkRangedDmgX3', label: PERK_LABELS.rangedDmgX3 },

];



export function listEnemyStatsPerkSelectOptions(): ReadonlyArray<{ value: keyof EnemyStatsPerkState; label: string }> {

  return PERK_SELECT_OPTIONS;

}



export function listEnemyStatsBattleConditionSelectOptions(): ReadonlyArray<{ value: EnemyStatsBattleConditionName; label: string }> {

  return ENEMY_STATS_BATTLE_CONDITION_NAMES.map(name => ({ value: name, label: name }));

}



export function perksFromSelectedValues(values: readonly string[]): EnemyStatsPerkState {

  const selected = new Set(values);

  return {

    perkEnemyHpMinus50: selected.has('perkEnemyHpMinus50'),

    perkBossHpX8: selected.has('perkBossHpX8'),

    perkBossHpMinus70: selected.has('perkBossHpMinus70'),

    perkEnemyDmgMinus50: selected.has('perkEnemyDmgMinus50'),

    perkEnemyDmgX25: selected.has('perkEnemyDmgX25'),

    perkRangedDmgX3: selected.has('perkRangedDmgX3'),

  };

}



export function selectedPerkValues(state: EnemyStatsSharedState): string[] {

  return ENEMY_STATS_PERK_KEYS.filter(key => state[key]);

}



export function selectedBattleConditionValues(state: EnemyStatsSharedState): EnemyStatsBattleConditionName[] {

  return state.enabledBattleConditions.filter((name): name is EnemyStatsBattleConditionName => isEnemyStatsBattleCondition(name));

}



export function battleConditionsFromSelectedValues(values: readonly string[]): EnemyStatsBattleConditionName[] {

  return values.filter((name): name is EnemyStatsBattleConditionName => isEnemyStatsBattleCondition(name));

}



function parsePositiveNumber(raw: string): number {

  const normalized = String(raw ?? '').trim().replace(/,/g, '');

  const value = Number(normalized);

  if (!Number.isFinite(value) || value <= 0) return 0;

  return Math.floor(value);

}



export function parseCoinBudget(raw: string): number | null {

  const trimmed = String(raw ?? '').trim();

  if (!trimmed) return null;

  const normalized = trimmed.replace(/,/g, '');

  const value = Number(normalized);

  if (!Number.isFinite(value) || value <= 0) return null;

  return Math.floor(value);

}



export function applyWorkshopTrackerLead(

  state: EnemyStatsSharedState,

  lead: ElsWorkshopLead | null,

): { state: EnemyStatsSharedState; loadedFromTracker: boolean } {

  if (!lead) {

    return { state, loadedFromTracker: false };

  }



  return {

    state: normalizeEnemyStatsSharedState({

      ...state,

      attackLevel: lead.attackUtilityLevel ?? state.attackLevel,

      healthLevel: lead.healthUtilityLevel ?? state.healthLevel,

      enhancementLevel: lead.enhancementLevel ?? state.enhancementLevel,

      utilityDiscountPct: lead.utilityDiscountPct ?? state.utilityDiscountPct,

      enhancementDiscountPct: lead.enhancementDiscountPct ?? state.enhancementDiscountPct,

      enhancementVaultDiscountPct: lead.enhancementVaultDiscountPct ?? state.enhancementVaultDiscountPct,

    }),

    loadedFromTracker: true,

  };

}



function buildModifierInput(state: EnemyStatsSharedState) {

  return {

    tier: state.tier,

    healthSkipPct: state.healthSkipPct,

    attackSkipPct: state.attackSkipPct,

    perks: {

      perkEnemyHpMinus50: state.perkEnemyHpMinus50,

      perkBossHpX8: state.perkBossHpX8,

      perkBossHpMinus70: state.perkBossHpMinus70,

      perkEnemyDmgMinus50: state.perkEnemyDmgMinus50,

      perkEnemyDmgX25: state.perkEnemyDmgX25,

      perkRangedDmgX3: state.perkRangedDmgX3,

    },

    enabledBattleConditions: selectedBattleConditionValues(state),

  };

}



export function buildActiveToggleDescriptionLines(state: EnemyStatsSharedState): string[] {

  const perkLabels = PERK_SELECT_OPTIONS

    .filter(option => state[option.value])

    .map(option => option.label);

  const bcLabels = selectedBattleConditionValues(state);



  return [

    `Perks: ${perkLabels.length > 0 ? perkLabels.join(' • ') : 'None'}`,

    `Battle Conditions: ${bcLabels.length > 0 ? bcLabels.join(' • ') : 'None'}`,

  ];

}



function buildElsPathInput(state: EnemyStatsSharedState): ElsUpgradePathInput {

  return {

    attackUtilityLevel: state.attackLevel,

    healthUtilityLevel: state.healthLevel,

    enhancementLevel: state.enhancementLevel,

    referenceWave: state.referenceWave,

    utilityDiscountPct: state.utilityDiscountPct,

    enhancementDiscountPct: state.enhancementDiscountPct,

    enhancementVaultDiscountPct: state.enhancementVaultDiscountPct,

    focus: state.focus,

    maxSteps: ELS_MAX_STEPS,

    coinBudget: parseCoinBudget(state.coinBudgetVal),

    primaryAttackPct: 0,

    assistAttackPct: 0,

    primaryHealthPct: 0,

    assistHealthPct: 0,

  };

}



function buildElsChartRows(state: EnemyStatsSharedState): {

  headers: string[];

  rows: string[][];

  descriptionLines: string[];

} {

  const input = buildElsPathInput(state);

  const result = buildElsUpgradePath(input);

  const starting = computeWorkshopSkipChances({

    attackUtilityLevel: state.attackLevel,

    healthUtilityLevel: state.healthLevel,

    enhancementLevel: state.enhancementLevel,

  });

  const ending = result.ending;

  const budget = parseCoinBudget(state.coinBudgetVal);



  const descriptionLines = [

    `Reference Wave ${result.referenceWave.toLocaleString()} • Focus ${state.focus}`,

    `Skip @ start: ATK ${starting.attackPct.toFixed(2)}% / HP ${starting.healthPct.toFixed(2)}%`,

    `Skip @ end: ATK ${ending.attackPct.toFixed(2)}% / HP ${ending.healthPct.toFixed(2)}%`,

    `Total Coin: ${formatCompact(result.totalCoinCost)}`,

    ...buildActiveToggleDescriptionLines(state),

  ];



  if (budget != null) {

    const aggregated = buildElsBudgetAllocation(input);

    if (aggregated.length === 0) {

      return {

        headers: ['Upgrade', 'Levels', 'Coin Cost', 'Ending Level'],

        rows: [['No affordable upgrades within budget', '', '', '']],

        descriptionLines: [...descriptionLines, `Budget: ${formatCompact(budget)}`],

      };

    }



    return {

      headers: ['Upgrade', 'Levels', 'Coin Cost', 'Ending Level'],

      rows: aggregated.map(row => [

        row.label,

        String(row.levels),

        formatCompact(row.totalCoinCost),

        String(row.endingLevel),

      ]),

      descriptionLines: [...descriptionLines, `Budget: ${formatCompact(budget)} (levels to buy, not purchase order)`],

    };

  }



  if (result.steps.length === 0) {

    return {

      headers: ['Step', 'Upgrade', 'Level', 'Coin', 'Skip %', 'ROI / Lvl'],

      rows: [['—', 'No affordable upgrades', '', '', '', '']],

      descriptionLines,

    };

  }



  return {

    headers: ['Step', 'Upgrade', 'Level', 'Coin', 'Skip %', 'Δ Lvls', 'ROI %'],

    rows: result.steps.map(step => [

      String(step.step),

      step.label,

      `${step.fromLevel} → ${step.toLevel}`,

      formatCompact(step.coinCost),

      formatElsRowSkipChance(step.kind, step.attackSkipPct, step.healthSkipPct),

      formatElsMarginalSkipLevels(step.marginalSkipLevels),

      formatElsRoiPct(step.roiPct),

    ]),

    descriptionLines,

  };

}



export function buildEnemyStatsChartRows(state: EnemyStatsSharedState): {

  headers: string[];

  rows: string[][];

  descriptionLines: string[];

  chartTitle: string;

} {

  const toggleLines = buildActiveToggleDescriptionLines(state);



  if (state.mode === 'els') {

    const chart = buildElsChartRows(state);

    return {

      ...chart,

      chartTitle: 'ELS vs ELS+ Planner',

    };

  }



  const modifiers = buildModifierInput(state);



  if (state.mode === 'wave') {

    const result = computeSimplifiedEnemyWaveTable({

      ...modifiers,

      wave: state.wave,

    });



    return {

      chartTitle: 'Enemy Stats — Wave Lookup',

      headers: ['Enemy', 'HP', 'Damage'],

      rows: [

        ['Wave Base', formatCompact(result.waveBaseHp), formatCompact(result.waveBaseDamage)],

        ...result.rows.map(row => [row.enemyType, formatCompact(row.hp), formatCompact(row.damage)]),

      ],

      descriptionLines: [

        `Wave ${result.wave.toLocaleString()} • Tier ${result.tier}`,

        `Health Skip ${state.healthSkipPct}% • Attack Skip ${state.attackSkipPct}%`,

        ...toggleLines,

      ],

    };

  }



  const target = state.mode === 'hp'

    ? parsePositiveNumber(state.targetHpVal)

    : parsePositiveNumber(state.targetDamageVal);

  const result = computeSimplifiedEnemyReverseTable({

    mode: state.mode,

    target,

    ...modifiers,

  });



  return {

    chartTitle: state.mode === 'hp' ? 'Enemy Stats — HP Reverse Lookup' : 'Enemy Stats — Damage Reverse Lookup',

    headers: ['Enemy', 'Found Wave', 'HP', 'Damage'],

    rows: result.rows.map(row => [

      row.enemyType,

      row.foundWave > 0 ? row.foundWave.toLocaleString() : '—',

      formatCompact(row.hp),

      formatCompact(row.damage),

    ]),

    descriptionLines: [

      `${state.mode === 'hp' ? 'Target HP' : 'Target Damage'} ${formatCompact(target)} • Tier ${result.tier}`,

      `Health Skip ${state.healthSkipPct}% • Attack Skip ${state.attackSkipPct}%`,

      ...toggleLines,

    ],

  };

}



export function validateEnemyStatsInputs(state: EnemyStatsSharedState): boolean {

  if (state.tier < 1 || state.tier > 21) return false;

  if (state.healthSkipPct < 0 || state.healthSkipPct > 100) return false;

  if (state.attackSkipPct < 0 || state.attackSkipPct > 100) return false;



  if (state.mode === 'wave') {

    return state.wave >= 1;

  }



  if (state.mode === 'els') {

    return state.referenceWave >= 1

      && state.attackLevel >= 0

      && state.healthLevel >= 0

      && state.enhancementLevel >= 0;

  }



  const target = state.mode === 'hp'

    ? parsePositiveNumber(state.targetHpVal)

    : parsePositiveNumber(state.targetDamageVal);

  return target > 0;

}



export function getEnemyStatsModeLabel(mode: SimplifiedEnemyStatsMode): string {

  switch (mode) {

    case 'wave':

      return 'Wave Lookup';

    case 'hp':

      return 'HP Reverse Lookup';

    case 'damage':

      return 'Damage Reverse Lookup';

    case 'els':

      return 'ELS vs ELS+';

  }

}


