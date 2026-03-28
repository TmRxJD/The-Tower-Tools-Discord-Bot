import { describe, expect, it } from 'vitest';

import {
  createChecklistModalBaseCustomId,
  createChecklistModalPrefix,
  createChecklistTaskCustomId,
  parseChecklistTaskCustomId,
} from './checklist-interaction-ids';

describe('checklist interaction ids', () => {
  it('creates stable checklist task ids and modal ids', () => {
    expect(createChecklistTaskCustomId(4)).toBe('check_4');
    expect(createChecklistModalPrefix('edit')).toBe('edit_modal_');
    expect(createChecklistModalBaseCustomId('add', 2)).toBe('add_modal_2');
  });

  it('parses checklist task ids safely', () => {
    expect(parseChecklistTaskCustomId('check_4')).toBe(4);
    expect(parseChecklistTaskCustomId('check_')).toBeNull();
    expect(parseChecklistTaskCustomId('other_prefix_4')).toBeNull();
    expect(parseChecklistTaskCustomId('check_nan')).toBeNull();
  });
});