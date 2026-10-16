import type { ManagedAcronymEntry } from '../../services/acronym-registry';

function escapeCell(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/[\\`*_{}[\]()#+.!|~-]/g, '\\$&').replace(/\r\n|\r|\n/g, '<br>');
}

/** Export every active key, including aliases, without a Discord message-length limit. */
export function renderAcronymMarkdown(entries: readonly ManagedAcronymEntry[]): string {
  const sorted = [...entries].sort((a, b) => a.acronym < b.acronym ? -1 : a.acronym > b.acronym ? 1 : 0);
  return sorted.reduce((text, entry) => text + '| ' + escapeCell(entry.acronym) + ' | ' + escapeCell(entry.expansion) + ' |\n',
    '# The Tower Acronyms\n\nActive entries: ' + entries.length + '\n\nIncludes all active acronym keys and aliases with their current definitions.\n\n| Acronym / alias | Definition |\n| --- | --- |\n');
}
