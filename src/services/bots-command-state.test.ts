import { describe, expect, it } from 'vitest';
import { normalizeBotsSharedState } from './bots-command-state';

describe('bots-command-state', () => {
  it('preserves higher valid levels for bots with 30-level stats', () => {
    const state = normalizeBotsSharedState({
      botName: 'Golden Bot',
      startLevel: 28,
      targetLevel: 30,
    });

    expect(state.startLevel).toBe(28);
    expect(state.targetLevel).toBe(30);
  });

  it('clamps levels to the shared bot data cap', () => {
    const state = normalizeBotsSharedState({
      botName: 'Amplify Bot',
      startLevel: 40,
      targetLevel: 99,
    });

    expect(state.startLevel).toBe(30);
    expect(state.targetLevel).toBe(30);
  });
});