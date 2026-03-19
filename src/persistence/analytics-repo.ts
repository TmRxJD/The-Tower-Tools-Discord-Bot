import { logCommandUsage } from '../services/analytics-db';

type LogAnalyticsInput = {
  commandName: string;
  userId?: string;
  guildId?: string;
  event?: string;
};

export class AnalyticsRepo {
  log(input: LogAnalyticsInput): Promise<void> {
    return logCommandUsage(input);
  }
}