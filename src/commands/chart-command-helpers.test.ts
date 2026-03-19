import { describe, expect, it } from 'vitest';
import { ComponentType } from 'discord-api-types/v10';
import {
  createChartCommandComponents,
  normalizeChartState,
} from './chart-command-helpers';

describe('chart-command-helpers', () => {
  it('clears invalid chart selections', () => {
    expect(normalizeChartState({ category: 'not-real', subcategory: 'x', item: 'y' })).toEqual({
      category: null,
      subcategory: null,
      item: null,
      selectedStats: [],
    });
  });

  it('builds four command component rows', () => {
    const rows = createChartCommandComponents({
      category: null,
      subcategory: null,
      item: null,
      selectedStats: [],
    });

    expect(rows).toHaveLength(4);
  });

  it('shows a stat multiselect row with all stats enabled by default for multi-stat charts', () => {
    const state = normalizeChartState({
      category: 'Bots',
      subcategory: 'Upgrades and Costs',
      item: 'Flame Bot',
    });

    const rows = createChartCommandComponents(state);
    const filterRow = rows[3]?.toJSON();
  const filterComponent = filterRow?.components?.[0];
  const options = filterComponent?.type === ComponentType.StringSelect ? filterComponent.options : [];

    expect(rows).toHaveLength(5);
    expect(options).toHaveLength(4);
    expect(options.every((option: { default?: boolean }) => option.default === true)).toBe(true);
  });
});