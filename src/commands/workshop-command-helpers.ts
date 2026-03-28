import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import {
  computeDiscountedWorkshopCost,
  formatLargeNumber,
  formatTrimmedNumber,
  getWorkshopMode,
  getWorkshopSection,
  getWorkshopStatOption,
  getWorkshopStatOptions,
  normalizeWorkshopLevels,
  normalizeWorkshopSelection,
  normalizeWorkshopSharedState,
  resolveWorkshopMaxLevel,
  type WorkshopMode,
  type WorkshopNormalData,
  type WorkshopNormalLevelData,
  type WorkshopNormalStatData,
  type WorkshopSection,
  type WorkshopSharedState,
  type WorkshopStatOption,
  WORKSHOP_STAT_OPTIONS,
} from '@tmrxjd/platform/tools';
import { getBotConfig } from '../config/bot-config';

export { formatLargeNumber as formatCost } from '@tmrxjd/platform/tools';
export {
  getWorkshopMode,
  getWorkshopSection,
  getWorkshopStatOption,
  getWorkshopStatOptions,
  normalizeWorkshopLevels,
  normalizeWorkshopSelection,
  normalizeWorkshopSharedState,
  resolveWorkshopMaxLevel,
  WORKSHOP_STAT_OPTIONS,
} from '@tmrxjd/platform/tools';
export type {
  WorkshopMode,
  WorkshopNormalData,
  WorkshopNormalLevelData,
  WorkshopNormalStatData,
  WorkshopSection,
  WorkshopSharedState,
  WorkshopStatOption,
} from '@tmrxjd/platform/tools';

const workshopConfig = getBotConfig().commands.workshop;

export type WorkshopNormalRow = {
  level: number;
  value: number;
  coinCost: number;
  cashCost: number;
  cumulativeCoin: number;
  cumulativeCash: number;
};

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