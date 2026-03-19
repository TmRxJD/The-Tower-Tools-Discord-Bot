import { describe, expect, it } from 'vitest';
import { stableEquals, stableSerialize } from '@tmrxjd/platform/tools';

describe('state-equality', () => {
  it('treats object key ordering as equal', () => {
    const left = { b: 2, a: 1, nested: { y: true, x: false } };
    const right = { a: 1, nested: { x: false, y: true }, b: 2 };

    expect(stableEquals(left, right)).toBe(true);
  });

  it('produces stable string output for equivalent objects', () => {
    const first = { list: [{ id: 2, value: 'b' }, { id: 1, value: 'a' }], z: 9, a: 1 };
    const second = { a: 1, z: 9, list: [{ value: 'b', id: 2 }, { value: 'a', id: 1 }] };

    expect(stableSerialize(first)).toBe(stableSerialize(second));
  });

  it('detects meaningful differences', () => {
    const baseline = { a: 1, nested: { flag: false } };
    const changed = { a: 1, nested: { flag: true } };

    expect(stableEquals(baseline, changed)).toBe(false);
  });
});
