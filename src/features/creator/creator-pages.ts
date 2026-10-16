import { formatCreatorEntriesDescription } from '@tmrxjd/platform/tools';

/** Discord caps: embed description 4096, whole embed 6000 (title + description + footer + fields). */
export const EMBED_DESCRIPTION_LIMIT = 4096;
export const EMBED_TOTAL_LIMIT = 6000;
const ENTRY_SEPARATOR = '\n\n';
const PAGE_FOOTER_RESERVE = 24;
const SAFETY_MARGIN = 40;

export interface CreatorListEntry {
  id: string;
  code: string;
  known: string;
}

export function getCreatorPageBudget(titleLength: number, footerLength: number): number {
  const remaining = EMBED_TOTAL_LIMIT - titleLength - footerLength - PAGE_FOOTER_RESERVE - SAFETY_MARGIN;
  return Math.max(200, Math.min(EMBED_DESCRIPTION_LIMIT, remaining));
}

/**
 * Packs whole entries into pages no longer than `budget` characters, never splitting an entry.
 * An entry that cannot fit on a page by itself is truncated instead of failing the command.
 */
export function paginateCreatorEntries(
  entries: readonly CreatorListEntry[],
  knownForPrefix: string,
  budget: number,
): string[] {
  const pages: string[] = [];
  let current = '';
  for (const entry of entries) {
    let text = formatCreatorEntriesDescription([entry], knownForPrefix);
    if (text.length > budget) text = `${text.slice(0, budget - 1)}…`;
    const joined = current ? `${current}${ENTRY_SEPARATOR}${text}` : text;
    if (current && joined.length > budget) {
      pages.push(current);
      current = text;
    } else {
      current = joined;
    }
  }
  if (current) pages.push(current);
  return pages.length > 0 ? pages : ['No creators listed yet.'];
}
