import { getBotConfig } from '../config/bot-config';

const remindIds = getBotConfig().commands.remind.ids;

export type ReminderStopTarget = {
  userId: string;
  reminderKey: string;
};

export function createReminderStopCustomId(userId: string, reminderKey: string): string {
  return `${remindIds.stopPrefix}${userId}_${reminderKey}`;
}

export function parseReminderStopCustomId(customId: string): ReminderStopTarget | null {
  if (!customId.startsWith(remindIds.stopPrefix)) {
    return null;
  }

  const encoded = customId.slice(remindIds.stopPrefix.length);
  const separatorIndex = encoded.indexOf('_');
  if (separatorIndex <= 0 || separatorIndex >= encoded.length - 1) {
    return null;
  }

  const userId = encoded.slice(0, separatorIndex);
  const reminderKey = encoded.slice(separatorIndex + 1);
  if (!userId || !reminderKey) {
    return null;
  }

  return { userId, reminderKey };
}