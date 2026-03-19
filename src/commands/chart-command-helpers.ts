import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
} from 'discord.js';
import {
  createChartStudioProfileFromChartPath,
  getChartCategoryNames,
  getChartItemNames,
  getChartPath,
  getChartSubcategoryNames,
  hasChartRendererDefinition,
  listStatGroupLabelsForDocument,
  resolveEditableChartDocument,
} from '@tmrxjd/platform/tools';
import { getBotConfig } from '../config/bot-config';
import { brandCommandEmbed } from '../services/command-embed-branding';
import type { ChartRenderSuccessResult } from '../services/chart-render';

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

export type ChartState = {
  category: string | null;
  subcategory: string | null;
  item: string | null;
  selectedStats: string[];
};

function getAvailableChartStatLabels(state: Pick<ChartState, 'category' | 'subcategory' | 'item'>): string[] {
  const profile = state.category && state.subcategory && state.item
    ? createChartStudioProfileFromChartPath(state.category, state.subcategory, state.item)
    : null;
  if (!profile) return [];

  const document = resolveEditableChartDocument(profile.document, {
    renderMode: 'view',
    activeSectionIndex: 0,
  }).document;

  return listStatGroupLabelsForDocument(document);
}

function reconcileSelectedStats(state: ChartState): void {
  const availableStats = getAvailableChartStatLabels(state);
  if (availableStats.length === 0) {
    state.selectedStats = [];
    return;
  }

  const availableSet = new Set(availableStats);
  const nextSelected = state.selectedStats.filter(stat => availableSet.has(stat));
  state.selectedStats = nextSelected.length > 0 ? nextSelected : [...availableStats];
}

export function normalizeChartState(input: Record<string, unknown> | null): ChartState {
  const category = typeof input?.category === 'string' && input.category.trim().length > 0
    ? input.category
    : null;
  const subcategory = typeof input?.subcategory === 'string' && input.subcategory.trim().length > 0
    ? input.subcategory
    : null;
  const item = typeof input?.item === 'string' && input.item.trim().length > 0
    ? input.item
    : null;
  const selectedStats = Array.isArray(input?.selectedStats)
    ? input.selectedStats.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    : [];

  const categoryNames = new Set(getChartCategoryNames());
  if (!category || !categoryNames.has(category)) {
    return {
      category: null,
      subcategory: null,
      item: null,
      selectedStats: [],
    };
  }

  const subcategoryNames = new Set(getChartSubcategoryNames(category));
  if (!subcategory || !subcategoryNames.has(subcategory)) {
    return {
      category,
      subcategory: null,
      item: null,
      selectedStats: [],
    };
  }

  const itemNames = new Set(getChartItemNames(category, subcategory));
  if (!item || !itemNames.has(item)) {
    return {
      category,
      subcategory,
      item: null,
      selectedStats: [],
    };
  }

  const normalizedState: ChartState = {
    category,
    subcategory,
    item,
    selectedStats,
  };
  reconcileSelectedStats(normalizedState);
  return normalizedState;
}

export function autoSelectSingleOptions(state: ChartState): void {
  if (!state.category) return;

  if (!state.subcategory) {
    const subcategories = getChartSubcategoryNames(state.category);
    if (subcategories.length === 1) {
      state.subcategory = subcategories[0];
    }
  }

  if (state.subcategory && !state.item) {
    const items = getChartItemNames(state.category, state.subcategory);
    if (items.length === 1) {
      state.item = items[0];
    }
  }

  reconcileSelectedStats(state);
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