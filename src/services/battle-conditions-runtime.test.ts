import { describe, expect, it } from 'vitest';
import { getActiveBattleConditionsWindow } from './battle-conditions-runtime';

describe('getActiveBattleConditionsWindow', () => {
  it('returns a polling window for Monday shortly after midnight UTC', () => {
    const monday = Date.UTC(2026, 3, 20, 0, 5, 0, 0);
    const window = getActiveBattleConditionsWindow(monday);
    expect(window).not.toBeNull();
    expect(window?.startMs).toBe(Date.UTC(2026, 3, 20, 0, 1, 0, 0));
  });

  it('does not return a polling window on non-slot days', () => {
    const tuesday = Date.UTC(2026, 3, 21, 12, 0, 0, 0);
    expect(getActiveBattleConditionsWindow(tuesday)).toBeNull();
  });
});