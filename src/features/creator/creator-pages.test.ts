import { describe, expect, it } from 'vitest';
import {
  EMBED_DESCRIPTION_LIMIT,
  EMBED_TOTAL_LIMIT,
  getCreatorPageBudget,
  paginateCreatorEntries,
} from './creator-pages';

const prefix = 'Known for:';
const makeEntries = (count: number, known = 'x'.repeat(200)) =>
  Array.from({ length: count }, (_, index) => ({ id: `1000000000000000${String(index).padStart(3, '0')}`, code: `code${index}`, known }));

describe('creator list pagination', () => {
  it('keeps a short list on a single page', () => {
    const pages = paginateCreatorEntries(makeEntries(3), prefix, 4000);
    expect(pages).toHaveLength(1);
    expect(pages[0]).toContain('code0');
    expect(pages[0]).toContain('code2');
  });

  it('splits long lists into pages within budget without splitting or losing entries', () => {
    const entries = makeEntries(60);
    const pages = paginateCreatorEntries(entries, prefix, 1500);
    expect(pages.length).toBeGreaterThan(1);
    for (const page of pages) expect(page.length).toBeLessThanOrEqual(1500);
    const joined = pages.join('\n\n');
    for (const entry of entries) {
      expect(joined.split(`<@${entry.id}>`)).toHaveLength(2);
    }
    for (const page of pages) expect(page.startsWith('**<@')).toBe(true);
  });

  it('truncates a single oversized entry instead of failing', () => {
    const pages = paginateCreatorEntries(makeEntries(1, 'y'.repeat(5000)), prefix, 1000);
    expect(pages).toHaveLength(1);
    expect(pages[0].length).toBeLessThanOrEqual(1000);
    expect(pages[0].endsWith('…')).toBe(true);
  });

  it('returns a placeholder page for an empty list', () => {
    expect(paginateCreatorEntries([], prefix, 1000)).toEqual(['No creators listed yet.']);
  });

  it('budgets title, footer and the page counter inside the 6000 character embed limit', () => {
    const title = 'Known Creators & Codes';
    const footer = 'If a creator is missing or needs updating, contact a moderator.';
    const budget = getCreatorPageBudget(title.length, footer.length);
    expect(budget).toBeLessThanOrEqual(EMBED_DESCRIPTION_LIMIT);
    expect(title.length + footer.length + ' • Page 99/99'.length + budget).toBeLessThanOrEqual(EMBED_TOTAL_LIMIT);
    expect(getCreatorPageBudget(256, 2048)).toBeLessThanOrEqual(EMBED_DESCRIPTION_LIMIT);
  });
});
