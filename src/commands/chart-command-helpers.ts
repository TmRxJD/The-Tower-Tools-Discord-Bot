import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
} from 'discord.js';
import {
  autoSelectSingleChartState,
  type ChartState,
  getAvailableChartStatLabels,
  getChartCategoryNames,
  getChartItemNames,
  getChartPath,
  getChartSubcategoryNames,
  hasChartRendererDefinition,
  normalizeChartState,
} from '@tmrxjd/platform/tools';
import { getBotConfig } from '../config/bot-config';
import { brandCommandEmbed } from '../services/command-embed-branding';
import type { ChartRenderSuccessResult } from '../services/chart-render';

export { normalizeChartState } from '@tmrxjd/platform/tools';
export type { ChartState } from '@tmrxjd/platform/tools';

const chartConfig = getBotConfig().commands.chart;
const toolsHubConfig = getBotConfig().common.toolsHub;
export const CHART_SHARE_BUTTON_ID = 'chart_share';

export type ChartCommandSessionIds = {
  categorySelect: string;
  subcategorySelect: string;
  itemSelect: string;
  statFilterSelect: string;
  shareButton: string;
};

const defaultChartCommandSessionIds: ChartCommandSessionIds = {
  categorySelect: chartConfig.ids.categorySelect,
  subcategorySelect: chartConfig.ids.subcategorySelect,
  itemSelect: chartConfig.ids.itemSelect,
  statFilterSelect: chartConfig.ids.statFilterSelect,
  shareButton: CHART_SHARE_BUTTON_ID,
};

export function createChartCommandSessionIds(sessionId: string): ChartCommandSessionIds {
  const scope = `chart:${sessionId}`;
  return {
    categorySelect: `${scope}:category`,
    subcategorySelect: `${scope}:subcategory`,
    itemSelect: `${scope}:item`,
    statFilterSelect: `${scope}:stats`,
    shareButton: `${scope}:share`,
  };
}

export function autoSelectSingleOptions(state: ChartState): void {
  const nextState = autoSelectSingleChartState(state);
  state.category = nextState.category;
  state.subcategory = nextState.subcategory;
  state.item = nextState.item;
  state.selectedStats = nextState.selectedStats;
}

export function createBaseChartEmbed(state: ChartState): EmbedBuilder {
  const selection = [
    state.category ? `Category: ${state.category}` : null,
    state.subcategory ? `Subcategory: ${state.subcategory}` : null,
    state.item ? `Chart: ${state.item}` : null,
  ].filter(Boolean);

  return new EmbedBuilder()
    .setTitle(chartConfig.ui.title)
    .setDescription([
      chartConfig.ui.description,
      selection.length ? `\n**Current Selection**\n${selection.join('\n')}` : null,
    ].filter(Boolean).join('\n'))
    .setColor(chartConfig.color);
}

export function createCategoryRow(
  selected: string | null,
  ids: ChartCommandSessionIds = defaultChartCommandSessionIds,
): ActionRowBuilder<StringSelectMenuBuilder> {
  const categories = getChartCategoryNames();
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(ids.categorySelect)
      .setPlaceholder(chartConfig.ui.categoryPlaceholder)
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(categories.map(category => ({
        label: category,
        value: category,
        description: chartConfig.ui.categoryDescriptionTemplate.replace('{category}', category),
        default: selected === category,
      }))),
  );
}

export function createSubcategoryRow(
  state: ChartState,
  ids: ChartCommandSessionIds = defaultChartCommandSessionIds,
): ActionRowBuilder<StringSelectMenuBuilder> {
  const subcategories = state.category ? getChartSubcategoryNames(state.category) : [];
  const disabled = !state.category || subcategories.length === 0;

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(ids.subcategorySelect)
      .setPlaceholder(chartConfig.ui.subcategoryPlaceholder)
      .setMinValues(1)
      .setMaxValues(1)
      .setDisabled(disabled)
      .addOptions(
        subcategories.length
          ? subcategories.map(subcategory => ({
            label: subcategory,
            value: subcategory,
            description: chartConfig.ui.subcategoryDescriptionTemplate.replace('{subcategory}', subcategory),
            default: state.subcategory === subcategory,
          }))
          : [{
            label: chartConfig.ui.noneLabel,
            value: chartConfig.ids.noneValue,
            description: chartConfig.ui.noneSubcategories,
            default: false,
          }],
      ),
  );
}

export function createItemRow(
  state: ChartState,
  ids: ChartCommandSessionIds = defaultChartCommandSessionIds,
): ActionRowBuilder<StringSelectMenuBuilder> {
  const items = state.category && state.subcategory
    ? getChartItemNames(state.category, state.subcategory)
    : [];
  const disabled = !state.category || !state.subcategory || items.length === 0;

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(ids.itemSelect)
      .setPlaceholder(chartConfig.ui.itemPlaceholder)
      .setMinValues(1)
      .setMaxValues(1)
      .setDisabled(disabled)
      .addOptions(
        items.length
          ? items.map(item => ({
            label: item,
            value: item,
            description: chartConfig.ui.itemDescriptionTemplate.replace('{item}', item),
            default: state.item === item,
          }))
          : [{
            label: chartConfig.ui.noneLabel,
            value: chartConfig.ids.noneValue,
            description: chartConfig.ui.noneItems,
            default: false,
          }],
      ),
  );
}

export function createStatFilterRow(
  state: ChartState,
  ids: ChartCommandSessionIds = defaultChartCommandSessionIds,
): ActionRowBuilder<StringSelectMenuBuilder> | null {
  const stats = getAvailableChartStatLabels(state);
  if (stats.length <= 1) {
    return null;
  }

  const selectedStats = state.selectedStats.length > 0 ? state.selectedStats : stats;
  const selectedSet = new Set(selectedStats);

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(ids.statFilterSelect)
      .setPlaceholder(chartConfig.ui.statFilterPlaceholder)
      .setMinValues(1)
      .setMaxValues(Math.min(stats.length, 25))
      .addOptions(stats.slice(0, 25).map(stat => ({
        label: stat,
        value: stat,
        description: chartConfig.ui.statFilterDescriptionTemplate.replace('{stat}', stat),
        default: selectedSet.has(stat),
      }))),
  );
}

export function createChartActionRow(
  canShare: boolean,
  ids: ChartCommandSessionIds = defaultChartCommandSessionIds,
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(ids.shareButton)
      .setLabel('Share')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!canShare),
  );
}

export function createChartCommandComponents(
  state: ChartState,
  ids: ChartCommandSessionIds = defaultChartCommandSessionIds,
) {
  const canShare = Boolean(state.category && state.subcategory && state.item);
  const statFilterRow = createStatFilterRow(state, ids);

  return [
    createCategoryRow(state.category, ids),
    createSubcategoryRow(state, ids),
    createItemRow(state, ids),
    ...(statFilterRow ? [statFilterRow] : []),
    createChartActionRow(canShare, ids),
  ];
}

export function createSelectionChartEmbed(state: ChartState): EmbedBuilder {
  const selectedPath = state.category && state.subcategory && state.item
    ? getChartPath(state.category, state.subcategory, state.item)
    : null;

  const hasRenderer = selectedPath ? hasChartRendererDefinition(selectedPath.id) : false;
  const body = selectedPath
    ? chartConfig.ui.selectedTemplate
      .replace('{category}', selectedPath.category)
      .replace('{subcategory}', selectedPath.subcategory)
      .replace('{item}', selectedPath.item)
      .replace('{id}', selectedPath.id)
      .replace('{rendererStatus}', hasRenderer ? chartConfig.ui.rendererReady : chartConfig.ui.rendererPending)
    : chartConfig.ui.notReady;

  return brandCommandEmbed(createBaseChartEmbed(state)
    .addFields({
      name: chartConfig.ui.statusField,
      value: body,
      inline: false,
    }), chartConfig.name);
}

export function createRenderedChartEmbed(result: ChartRenderSuccessResult): EmbedBuilder {
  const rendered = result.attachment;
  const embed = brandCommandEmbed(new EmbedBuilder()
    .setTitle(rendered.title)
    .setDescription(rendered.description)
    .setImage(`attachment://${rendered.fileName}`)
    .setColor(rendered.color), chartConfig.name);

  if (rendered.creatorCredit) {
    embed.addFields({
      name: chartConfig.ui.creatorField,
      value: rendered.creatorCredit,
      inline: false,
    });
  }

  return embed;
}

export function createChartRenderErrorEmbed(state: ChartState, message: string): EmbedBuilder {
  return createSelectionChartEmbed(state).addFields({
    name: chartConfig.ui.rendererErrorField,
    value: chartConfig.ui.rendererErrorTemplate.replace('{message}', message),
    inline: false,
  });
}

export function createChartTimeoutEmbed(): EmbedBuilder {
  return brandCommandEmbed(new EmbedBuilder()
    .setTitle(chartConfig.ui.closedTitle)
    .setDescription(chartConfig.ui.timeoutDescription)
    .setColor(chartConfig.color), chartConfig.name);
}