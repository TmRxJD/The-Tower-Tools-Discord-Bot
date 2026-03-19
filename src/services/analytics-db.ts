import { getToolsBotDb } from './idb';
import { aggregateDailyCommandUsage, ANALYTICS_EVENT_COMMAND_INVOKED, type AnalyticsUsageEventLike } from '@tmrxjd/platform/tools';

interface UsageLogInput {
  commandName: string;
  userId?: string;
  guildId?: string;
  event?: string;
}

export interface DailyCommandUsageRow {
  date: string;
  command_name: string;
  total_uses: number;
  unique_users: number;
}

export async function logCommandUsage(input: UsageLogInput): Promise<void> {
  const database = getToolsBotDb();
  await database.commandUsage.add({
    commandName: input.commandName,
    userId: input.userId,
    guildId: input.guildId,
    event: input.event ?? ANALYTICS_EVENT_COMMAND_INVOKED,
    createdAt: Date.now(),
  });
}

export async function queryDailyCommandUsage(days: number): Promise<DailyCommandUsageRow[]> {
  const database = getToolsBotDb();
  const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
  const records = await database.commandUsage.where('createdAt').aboveOrEqual(cutoff).toArray();

  return aggregateDailyCommandUsage(records.map(record => ({
    commandName: record.commandName,
    userId: record.userId,
    guildId: record.guildId,
    event: record.event,
    createdAtMs: record.createdAt,
  }))).map(row => ({
    date: row.date,
    command_name: row.commandName,
    total_uses: row.totalUses,
    unique_users: row.uniqueUsers,
  }));
}

export async function queryUsageEvents(days: number): Promise<AnalyticsUsageEventLike[]> {
  const database = getToolsBotDb();
  const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
  const records = await database.commandUsage.where('createdAt').aboveOrEqual(cutoff).toArray();

  return records.map(record => ({
    commandName: record.commandName,
    userId: record.userId,
    guildId: record.guildId,
    event: record.event,
    createdAtMs: record.createdAt,
  }));
}
