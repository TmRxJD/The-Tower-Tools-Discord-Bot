import { describe, expect, it } from 'vitest';
import { expandAcronymsWithMap, mergeAcronymMaps } from './acronym-registry';

describe('acronym registry helpers', () => {
  it('applies overrides and removals over the base acronym map', () => {
    const merged = mergeAcronymMaps(
      { gt: 'Golden Tower', bh: 'Black Hole' },
      [{ key: 'gt', expansion: 'Golden Tower Plus', updatedAt: 1 }],
      [{ key: 'bh', updatedAt: 2 }],
    );

    expect(merged).toEqual({ gt: 'Golden Tower Plus' });
  });

  it('expands acronyms from a supplied map', () => {
    const result = expandAcronymsWithMap('Use gt and bh together.', {
      gt: 'Golden Tower',
      bh: 'Black Hole',
    });

    expect(result.changed).toBe(true);
    expect(result.text).toContain('**Golden Tower**');
    expect(result.text).toContain('**Black Hole**');
  });
});