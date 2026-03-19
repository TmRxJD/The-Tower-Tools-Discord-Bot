import { describe, expect, it } from 'vitest';
import {
  buildNormalRows,
  buildWorkshopComponents,
  normalizeWorkshopLevels,
  normalizeWorkshopSelection,
  normalizeWorkshopSharedState,
} from './workshop-command-helpers';

describe('workshop-command-helpers', () => {
  it('normalizes invalid selection to a valid stat for the section', () => {
    const result = normalizeWorkshopSelection('normal', 'attack', 'not-real');

    expect(result.mode).toBe('normal');
    expect(result.section).toBe('attack');
    expect(result.stat).toBeTruthy();
    expect(result.stat).not.toBe('not-real');
  });

  it('bounds current and target levels to valid range', () => {
    expect(normalizeWorkshopLevels(50, 2, 10)).toEqual({
      currentLevel: 9,
      targetLevel: 10,
    });
  });

  it('builds cumulative normal rows with discounted coin cost', () => {
    const rows = buildNormalRows({
      '1': { value: 2, coins: 100, cash: 20 },
      '2': { value: 3, coins: 200, cash: 30 },
    }, 0, 2, 10);

    expect(rows).toHaveLength(2);
    expect(rows[0]?.coinCost).toBe(90);
    expect(rows[1]?.cumulativeCoin).toBe(270);
    expect(rows[1]?.cumulativeCash).toBe(50);
  });

  it('builds four workshop control rows', () => {
    const rows = buildWorkshopComponents('normal', 'attack', 'damage');
    expect(rows).toHaveLength(4);
  });

  it('defaults hidden base costs in shared state', () => {
    const state = normalizeWorkshopSharedState(null);
    expect(state.hideBaseCosts).toBe(true);
  });
});