import { describe, expect, it } from 'vitest';
import {
  createAcronymRequestApproveCustomId,
  createAcronymRequestDenyCustomId,
  parseAcronymRequestApproveCustomId,
  parseAcronymRequestDenyCustomId,
} from './acronym-interaction-ids';

describe('acronym interaction ids', () => {
  it('round-trips approve ids', () => {
    const customId = createAcronymRequestApproveCustomId('proposal-123');
    expect(parseAcronymRequestApproveCustomId(customId)).toBe('proposal-123');
  });

  it('round-trips deny ids', () => {
    const customId = createAcronymRequestDenyCustomId('proposal-456');
    expect(parseAcronymRequestDenyCustomId(customId)).toBe('proposal-456');
  });
});