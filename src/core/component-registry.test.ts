import { describe, expect, it, vi } from 'vitest';
import { ComponentRegistry } from './component-registry';

describe('component-registry', () => {
  it('prefers the longest matching prefix', () => {
    const registry = new ComponentRegistry();
    const genericHandler = vi.fn(async () => {});
    const specificHandler = vi.fn(async () => {});

    registry.register('tool:', genericHandler);
    registry.register('tool:chart:', specificHandler);

    const resolved = registry.find({
      customId: 'tool:chart:refresh',
    } as never);

    expect(resolved).toBe(specificHandler);
    expect(resolved).not.toBe(genericHandler);
  });
});