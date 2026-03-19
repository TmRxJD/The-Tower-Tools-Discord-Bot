import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { computeDiscountedWorkshopCost, formatLargeNumber, formatTrimmedNumber, getWorkshopMaxLevelByKey } from '@tmrxjd/platform/tools';
import { getBotConfig } from '../config/bot-config';

export { formatLargeNumber as formatCost } from '@tmrxjd/platform/tools';

const workshopConfig = getBotConfig().commands.workshop;

export type WorkshopSharedState = {
  mode: string;
  section: string;
  stat: string;
  currentLevel: number;
  targetLevel: number;
  discount: number;
  vaultDiscount: number;
  hideBaseCosts: boolean;
};

export type WorkshopMode = 'normal' | 'enhancements';
export type WorkshopSection = 'attack' | 'defense' | 'utility';

export type WorkshopStatOption = {
  name: string;
  value: string;
  dataKey: string;
};

export type WorkshopNormalLevelData = {
  value: number;
  cash: number;
  coins: number;
};

export type WorkshopNormalStatData = Record<string, WorkshopNormalLevelData>;
export type WorkshopNormalData = Record<string, WorkshopNormalStatData>;

export type WorkshopNormalRow = {
  level: number;
  value: number;
  coinCost: number;
  cashCost: number;
  cumulativeCoin: number;
  cumulativeCash: number;
};

export const WORKSHOP_STAT_OPTIONS: Record<WorkshopMode, Record<WorkshopSection, WorkshopStatOption[]>> = {
  normal: {
    attack: [
      { name: 'Damage', value: 'damage', dataKey: 'Damage' },
      { name: 'Attack Speed', value: 'attack_speed', dataKey: 'Attack Speed' },
      { name: 'Critical Chance', value: 'critical_chance', dataKey: 'Critical Chance' },
      { name: 'Critical Factor', value: 'critical_factor', dataKey: 'Critical Factor' },
      { name: 'Range', value: 'range', dataKey: 'Range' },
      { name: 'Damage / Meter', value: 'damage_meter', dataKey: 'Damage / Meter' },
      { name: 'Multishot Chance', value: 'multishot_chance', dataKey: 'Multishot Chance' },
      { name: 'Multishot Targets', value: 'multishot_targets', dataKey: 'Multishot Targets' },
      { name: 'Rapid Fire Chance', value: 'rapid_fire_chance', dataKey: 'Rapid Fire Chance' },
      { name: 'Rapid Fire Duration', value: 'rapid_fire_duration', dataKey: 'Rapid Fire Duration' },
      { name: 'Bounce Shot Chance', value: 'bounce_shot_chance', dataKey: 'Bounce Shot Chance' },
      { name: 'Bounce Shot Targets', value: 'bounce_shot_targets', dataKey: 'Bounce Shot Targets' },
      { name: 'Bounce Shot Range', value: 'bounce_shot_range', dataKey: 'Bounce Shot Range' },
      { name: 'Super Crit Chance', value: 'super_crit_chance', dataKey: 'Super Crit Chance' },
      { name: 'Super Crit Mult', value: 'super_crit_mult', dataKey: 'Super Crit Mult' },
      { name: 'Rend Armor Chance', value: 'rend_armor_chance', dataKey: 'Rend Armor Chance' },
      { name: 'Rend Armor Mult', value: 'rend_armor_mult', dataKey: 'Rend Armor Mult' },
    ],
    defense: [
      { name: 'Health', value: 'health', dataKey: 'Health' },
      { name: 'Health Regen', value: 'health_regen', dataKey: 'Health Regen' },
      { name: 'Defense %', value: 'defense_percent', dataKey: 'Defense Percent' },
      { name: 'Defense Absolute', value: 'defense_absolute', dataKey: 'Defense Absolute' },
      { name: 'Thorn Damage', value: 'thorn_damage', dataKey: 'Thorns' },
      { name: 'Lifesteal', value: 'lifesteal', dataKey: 'Lifesteal' },
      { name: 'Knockback Chance', value: 'knockback_chance', dataKey: 'Knockback Chance' },
      { name: 'Knockback Force', value: 'knockback_force', dataKey: 'Knockback Force' },
      { name: 'Orb Speed', value: 'orb_speed', dataKey: 'Orb Speed' },
      { name: 'Orbs', value: 'orbs', dataKey: 'Orbs' },
      { name: 'Shockwave Size', value: 'shockwave_size', dataKey: 'Shockwave Size' },
      { name: 'Shockwave Frequency', value: 'shockwave_frequency', dataKey: 'Shockwave Frequency' },
      { name: 'Land Mine Chance', value: 'land_mine_chance', dataKey: 'Land Mine Chance' },
      { name: 'Land Mine Damage', value: 'land_mine_damage', dataKey: 'Land Mine Damage' },
      { name: 'Land Mine Radius', value: 'land_mine_radius', dataKey: 'Land Mine Radius' },
      { name: 'Wall Health', value: 'wall_health', dataKey: 'Wall Health' },
      { name: 'Wall Rebuild', value: 'wall_rebuild', dataKey: 'Wall Rebuild' },
    ],
    utility: [
      { name: 'Cash Bonus', value: 'cash_bonus', dataKey: 'Cash Bonus' },
      { name: 'Cash / Wave', value: 'cash_wave', dataKey: 'Cash / Wave' },
      { name: 'Coins / Kill Bonus', value: 'coins_kill_bonus', dataKey: 'Coins / Kill Bonus' },
      { name: 'Coins / Wave', value: 'coins_wave', dataKey: 'Coins / Wave' },
      { name: 'Free Attack Upgrade', value: 'free_attack_upgrade', dataKey: 'Free Attack Upgrade' },
      { name: 'Free Defense Upgrade', value: 'free_defense_upgrade', dataKey: 'Free Defense Upgrade' },
      { name: 'Free Utility Upgrade', value: 'free_utility_upgrade', dataKey: 'Free Utility Upgrade' },
      { name: 'Interest / Wave', value: 'interest_wave', dataKey: 'Interest / Wave' },
      { name: 'Recovery Amount', value: 'recovery_amount', dataKey: 'Recovery Amount' },
      { name: 'Max Recovery', value: 'max_recovery', dataKey: 'Max Recovery' },
      { name: 'Package Chance', value: 'package_chance', dataKey: 'Package Chance' },
      { name: 'Enemy Attack Level Skip', value: 'enemy_attack_level_skip', dataKey: 'Enemy Attack Level Skip' },
      { name: 'Enemy Health Level Skip', value: 'enemy_health_level_skip', dataKey: 'Enemy Health Level Skip' },
    ],
  },
  enhancements: {
    attack: [
      { name: 'Damage', value: 'damage', dataKey: 'WSP_DAMAGE' },
      { name: 'Rend Armor', value: 'rend_armor', dataKey: 'WSP_REND_ARMOR' },
      { name: 'Critical Factor', value: 'critical_factor', dataKey: 'WSP_CRITICAL_FACTOR' },
      { name: 'Damage / Meter', value: 'damage_meter', dataKey: 'WSP_DAMAGE_PER_METER' },
      { name: 'Super Crit Mult', value: 'super_crit_mult', dataKey: 'WSP_SUPER_CRIT_MULTI' },
      { name: 'Attack Speed', value: 'attack_speed', dataKey: 'WSP_ATTACK_SPEED' },
    ],
    defense: [
      { name: 'Health', value: 'health', dataKey: 'WSP_HEALTH' },
      { name: 'Health Regen', value: 'health_regen', dataKey: 'WSP_HEALTH_REGEN' },
      { name: 'Defense Absolute', value: 'defense_absolute', dataKey: 'WSP_DEFENSE_ABSOLUTE' },
      { name: 'Land Mine Damage', value: 'land_mine_damage', dataKey: 'WSP_LAND_MINE_DAMAGE' },
      { name: 'Wall Health', value: 'wall_health', dataKey: 'WSP_WALL_HEALTH' },
      { name: 'Orb Size', value: 'orb_size', dataKey: 'WSP_ORB_SIZE' },
    ],
    utility: [
      { name: 'Cash Bonus', value: 'cash_bonus', dataKey: 'WSP_CASH_BONUS' },
      { name: 'Coin Bonus', value: 'coin_bonus', dataKey: 'WSP_COIN_BONUS' },
      { name: 'Cells / Kill Bonus', value: 'cells_per_kill_bonus', dataKey: 'WSP_CELLS_PER_KILL_BONUS' },
      { name: 'Free Upgrades', value: 'free_upgrades', dataKey: 'WSP_FREE_UPGRADES' },
      { name: 'Recovery Package', value: 'recovery_package', dataKey: 'WSP_RECOVERY_PACKAGE' },
      { name: 'Enemy Level Skip', value: 'enemy_level_skip', dataKey: 'WSP_ENEMY_LEVEL_SKIP' },
    ],
  },
};

export function getWorkshopMode(mode: string): WorkshopMode {
  return mode === 'enhancements' ? 'enhancements' : 'normal';
}

export function getWorkshopSection(section: string): WorkshopSection {
  if (section === 'defense' || section === 'utility') return section;
  return 'attack';
}

export function getWorkshopStatOptions(mode: string, section: string): WorkshopStatOption[] {
  const resolvedMode = getWorkshopMode(mode);
  const resolvedSection = getWorkshopSection(section);
  return WORKSHOP_STAT_OPTIONS[resolvedMode][resolvedSection];
}

function getAllWorkshopStatValues(): Set<string> {
  return new Set<string>(Object.values(WORKSHOP_STAT_OPTIONS)
    .flatMap(sectionMap => Object.values(sectionMap).flatMap(options => options.map(option => option.value))));
}

export function getWorkshopStatOption(mode: string, section: string, stat: string): WorkshopStatOption | null {
  const options = getWorkshopStatOptions(mode, section);
  return options.find(option => option.value === stat) ?? null;
}

export function normalizeWorkshopSelection(mode: string, section: string, stat: string): { mode: WorkshopMode; section: WorkshopSection; stat: string } {
  const resolvedMode = getWorkshopMode(mode);
  const resolvedSection = getWorkshopSection(section);
  const options = getWorkshopStatOptions(resolvedMode, resolvedSection);
  const nextStat = options.find(option => option.value === stat)?.value ?? (options[0]?.value ?? workshopConfig.defaults.stat);
  return {
    mode: resolvedMode,
    section: resolvedSection,
    stat: nextStat,
  };
}

export function normalizeWorkshopSharedState(input: Record<string, unknown> | null): WorkshopSharedState {
  const validModes = new Set<string>(workshopConfig.modeChoices.map(choice => choice.value));
  const validSections = new Set<string>(workshopConfig.sectionChoices.map(choice => choice.value));
  const validStats = getAllWorkshopStatValues();

  const mode = typeof input?.mode === 'string' && validModes.has(input.mode)
    ? input.mode
    : workshopConfig.defaults.mode;
  const section = typeof input?.section === 'string' && validSections.has(input.section)
    ? input.section
    : workshopConfig.defaults.section;
  const requestedStat = typeof input?.stat === 'string' && validStats.has(input.stat)
    ? input.stat
    : workshopConfig.defaults.stat;

  const normalized = normalizeWorkshopSelection(mode, section, requestedStat);

  return {
    mode: normalized.mode,
    section: normalized.section,
    stat: normalized.stat,
    currentLevel: Number.isFinite(Number(input?.currentLevel)) ? Math.max(0, Math.floor(Number(input?.currentLevel))) : workshopConfig.defaults.currentLevel,
    targetLevel: Number.isFinite(Number(input?.targetLevel)) ? Math.max(1, Math.floor(Number(input?.targetLevel))) : workshopConfig.defaults.targetLevel,
    discount: Number.isFinite(Number(input?.discount)) ? Math.max(0, Math.min(100, Math.floor(Number(input?.discount)))) : workshopConfig.defaults.discount,
    vaultDiscount: Number.isFinite(Number(input?.vaultDiscount)) ? Math.max(0, Math.min(100, Math.floor(Number(input?.vaultDiscount)))) : workshopConfig.defaults.vaultDiscount,
    hideBaseCosts: typeof input?.hideBaseCosts === 'boolean' ? input.hideBaseCosts : workshopConfig.defaults.hideBaseCosts,
  };
}

export function resolveWorkshopMaxLevel(mode: string, section: string, stat: string, normalData: WorkshopNormalData): number {
  const selectedStat = getWorkshopStatOption(mode, section, stat);
  if (!selectedStat) return 1;

  if (getWorkshopMode(mode) === 'normal') {
    const statData = normalData[selectedStat.dataKey];
    if (!statData) return 1;
    const levelKeys = Object.keys(statData)
      .map(level => Number.parseInt(level, 10))
      .filter(level => Number.isFinite(level));
    return levelKeys.length > 0 ? Math.max(1, ...levelKeys) : 1;
  }

  const maxLevel = getWorkshopMaxLevelByKey(selectedStat.dataKey);
  return Math.max(1, (maxLevel ?? 0) + 1);
}

export function normalizeWorkshopLevels(currentLevel: number, targetLevel: number, maxLevel: number): { currentLevel: number; targetLevel: number } {
  const boundedMax = Math.max(1, Math.floor(maxLevel));
  const maxCurrentLevel = Math.max(0, boundedMax - 1);
  const boundedCurrent = Math.max(0, Math.min(maxCurrentLevel, Math.floor(currentLevel)));
  const boundedTarget = Math.max(boundedCurrent + 1, Math.min(boundedMax, Math.floor(targetLevel)));
  return {
    currentLevel: boundedCurrent,
    targetLevel: boundedTarget,
  };
}

export function toSectionLabel(section: string): string {
  const match = workshopConfig.sectionChoices.find(choice => choice.value === section);
  return match?.name ?? section;
}

export function toStatLabel(mode: string, section: string, stat: string): string {
  const option = getWorkshopStatOption(mode, section, stat);
  return option?.name ?? stat;
}

export function toModeLabel(mode: string): string {
  const match = workshopConfig.modeChoices.find(choice => choice.value === mode);
  return match?.name ?? mode;
}

export function formatStatValue(value: number): string {
  return formatTrimmedNumber(value, 3, '-');
}

export function buildNormalRows(statData: WorkshopNormalStatData, fromLevel: number, toLevel: number, coinDiscount: number): WorkshopNormalRow[] {
  const start = Math.max(0, Math.floor(fromLevel));
  const end = Math.max(start + 1, Math.floor(toLevel));
  const rows: WorkshopNormalRow[] = [];

  let cumulativeCoin = 0;
  let cumulativeCash = 0;

  for (let level = start + 1; level <= end; level += 1) {
    const levelData = statData[String(level)];
    if (!levelData) continue;

    const coinBase = Number(levelData.coins || 0);
    const coinCost = computeDiscountedWorkshopCost(coinBase, coinDiscount);
    const cashCost = Number(levelData.cash || 0);
    cumulativeCoin += coinCost;
    cumulativeCash += cashCost;

    rows.push({
      level,
      value: Number(levelData.value || 0),
      coinCost,
      cashCost,
      cumulativeCoin,
      cumulativeCash,
    });
  }

  return rows;
}

export function buildWorkshopComponents(mode: string, section: string, stat: string, hideBaseCosts: boolean = workshopConfig.defaults.hideBaseCosts) {
  const statOptions = getWorkshopStatOptions(mode, section);
  return [
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(workshopConfig.ids.modeSelect)
        .setPlaceholder(workshopConfig.ui.modePlaceholder)
        .addOptions(workshopConfig.modeChoices.map(choice => ({ label: choice.name, value: choice.value, default: choice.value === mode }))),
    ),
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(workshopConfig.ids.sectionSelect)
        .setPlaceholder(workshopConfig.ui.sectionPlaceholder)
        .addOptions(workshopConfig.sectionChoices.map(choice => ({ label: choice.name, value: choice.value, default: choice.value === section }))),
    ),
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(workshopConfig.ids.statSelect)
        .setPlaceholder(workshopConfig.ui.statPlaceholder)
        .addOptions(statOptions.map(choice => ({ label: choice.name, value: choice.value, default: choice.value === stat }))),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(workshopConfig.ids.setValues)
        .setLabel(workshopConfig.ui.setValuesLabel)
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(workshopConfig.ids.toggleBaseCosts)
        .setLabel(hideBaseCosts ? workshopConfig.ui.showBaseCostsLabel : workshopConfig.ui.hideBaseCostsLabel)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(mode !== 'enhancements'),
    ),
  ];
}

export function createWorkshopValuesModal(mode: string, currentLevel: number, targetLevel: number, discount: number, vaultDiscount: number): ModalBuilder {
  const modalRows: Array<ActionRowBuilder<TextInputBuilder>> = [
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder().setCustomId(workshopConfig.ids.currentLevelInput).setLabel(workshopConfig.ui.currentLevelLabel).setStyle(TextInputStyle.Short).setRequired(true).setValue(String(currentLevel)),
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder().setCustomId(workshopConfig.ids.targetLevelInput).setLabel(workshopConfig.ui.targetLevelLabel).setStyle(TextInputStyle.Short).setRequired(true).setValue(String(targetLevel)),
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder().setCustomId(workshopConfig.ids.discountInput).setLabel(workshopConfig.ui.discountLabel).setStyle(TextInputStyle.Short).setRequired(true).setValue(String(discount)),
    ),
  ];

  if (mode === 'enhancements') {
    modalRows.push(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId(workshopConfig.ids.vaultDiscountInput).setLabel(workshopConfig.ui.vaultDiscountLabel).setStyle(TextInputStyle.Short).setRequired(false).setValue(String(vaultDiscount)),
      ),
    );
  }

  return new ModalBuilder()
    .setCustomId(workshopConfig.ids.valuesModal)
    .setTitle(workshopConfig.ui.valuesModalTitle)
    .addComponents(...modalRows);
}