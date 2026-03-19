export function quoteText(text: string): string {
  if (!text) return '';
  return text
    .split(/\r?\n/)
    .map(line => `> ${line}`)
    .join('\n');
}
