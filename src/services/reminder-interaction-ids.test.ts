import { describe, expect, it } from 'vitest';

import { createReminderStopCustomId, parseReminderStopCustomId } from './reminder-interaction-ids';

describe('reminder interaction ids', () => {
  it('creates stable stop reminder ids', () => {
    expect(createReminderStopCustomId('user-1', 'daily_reminder')).toBe('stop_reminder_user-1_daily_reminder');
  });

  it('parses stop reminder ids safely', () => {
    expect(parseReminderStopCustomId('stop_reminder_user-1_daily_reminder')).toEqual({
      userId: 'user-1',
      reminderKey: 'daily_reminder',
    });
    expect(parseReminderStopCustomId('stop_reminder_')).toBeNull();
    expect(parseReminderStopCustomId('other_prefix_user-1_daily_reminder')).toBeNull();
  });
});