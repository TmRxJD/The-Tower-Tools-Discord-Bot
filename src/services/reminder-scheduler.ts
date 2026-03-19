import { getNextReminderTimestamp as getNextTimestampFor, reminderDefinitions as reminders } from '@tmrxjd/platform/tools';
import { getLastSent, getReminderSettings, getUsersForReminder, setLastSent } from './user-reminder-db';
import { sendReminderDM } from './reminder-service';
import type { ToolsBotClient } from '../core/tools-bot-client';
import { logger } from '../core/logger';

let interval: NodeJS.Timeout | null = null;

async function checkAndSend(client: ToolsBotClient): Promise<void> {
  const nowSec = Math.floor(Date.now() / 1000);
  const windowSeconds = 70;

  for (const reminder of reminders) {
    const nextTimestamp = getNextTimestampFor(reminder.key);
    if (!nextTimestamp || nextTimestamp < nowSec || nextTimestamp > nowSec + windowSeconds) {
      continue;
    }

    const users = await getUsersForReminder(reminder.key);
    for (const userId of users) {
      try {
        const settings = await getReminderSettings(userId);
        if (settings.paused) {
          continue;
        }

        const lastSent = await getLastSent(userId, reminder.key);
        if (lastSent && lastSent >= nextTimestamp) {
          continue;
        }

        const sent = await sendReminderDM(client, userId, reminder.key);
        if (sent) {
          await setLastSent(userId, reminder.key, nextTimestamp);
        }
      } catch (error) {
        logger.warn(`Failed reminder send for user ${userId} and key ${reminder.key}`, error);
      }
    }
  }
}

export function startReminderScheduler(client: ToolsBotClient): void {
  if (interval) {
    return;
  }

  void checkAndSend(client);
  interval = setInterval(() => {
    void checkAndSend(client);
  }, 60 * 1000);
  logger.info('Reminder scheduler started');
}

export function stopReminderScheduler(): void {
  if (!interval) {
    return;
  }
  clearInterval(interval);
  interval = null;
}
