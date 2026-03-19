import {
  formatEarningsMoney,
  parseEarningsCsvText,
  summarizeEarningsRows,
  type EarningsRow,
  type EarningsSummary,
} from '@tmrxjd/platform/tools';

export type { EarningsRow, EarningsSummary };

export function parseCsvText(text: string): EarningsRow[] {
  return parseEarningsCsvText(text);
}

export function summarizeEarnings(rows: EarningsRow[]): EarningsSummary {
  return summarizeEarningsRows(rows);
}

export function formatMoney(value: number): string {
  return formatEarningsMoney(value);
}
