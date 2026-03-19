import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runDirectTrackerAiCalculatorCommand } from './trackerai-direct-calculator';

const resolveEffectiveBotsState = vi.fn();

vi.mock('./bots-command-state', () => ({
  resolveEffectiveBotsState: (...args: unknown[]) => resolveEffectiveBotsState(...args),
}));

describe('trackerai-direct-calculator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveEffectiveBotsState.mockResolvedValue({
      botName: 'Golden Bot',
      selectedStats: ['Cooldown'],
      startLevel: 3,
      targetLevel: 20,
      cooldownLab: 17,
      durationLab: 12,
    });
  });

  it('fills missing bot calculator values from saved state and lists the values used', async () => {
    const result = await runDirectTrackerAiCalculatorCommand({
      message: 'how many medals to max gb',
      userId: 'user-1',
    });

    expect(result?.tier).toBe('bot-direct-calculator');
    expect(result?.ui?.description).toContain('Golden Bot cooldown');
    const valuesField = result?.ui?.fields?.find(field => field.name === 'Values Used');
    expect(valuesField?.value).toContain('Bot: Golden Bot');
    expect(valuesField?.value).toContain('Stat: Cooldown');
    expect(valuesField?.value).toContain('Start: 3');
    expect(valuesField?.value).toContain('Target: max');
    expect(valuesField?.value).toContain('Cooldown Lab: 17');
    expect(valuesField?.value).toContain('Duration Lab: 12');
  });

  it('answers explicit uptime sync prompts with shared platform projection logic', async () => {
    const result = await runDirectTrackerAiCalculatorCommand({
      message: 'if gt cooldown 200 and bh cooldown 100 sync in the uptime calculator?',
      userId: 'user-1',
    });

    expect(result?.tier).toBe('bot-direct-calculator');
    expect(result?.ui?.description).toContain('Golden Tower and Black Hole project to a 2:1 effective-cooldown ratio');
    const valuesField = result?.ui?.fields?.find(field => field.name === 'Values Used');
    expect(valuesField?.value).toContain('Field: sync');
    expect(valuesField?.value).toContain('Focus: gt, bh');
    expect(valuesField?.value).toContain('gtCdLevel=200');
    expect(valuesField?.value).toContain('bhCdLevel=100');
  });
});