import { afterEach, describe, expect, it, vi } from 'vitest';
import { getToolsBotDb } from './idb';
import { upsertCloudOutboxState } from './cloud-sync-outbox';

const sendMock = vi.fn();

vi.mock('./user-shared-settings-cloud', () => ({
  saveUserSharedSettingsCloud: (...args: unknown[]) => sendMock(...args),
}));

vi.mock('./user-lab-cloud', () => ({
  saveUserLabSettingsCloud: vi.fn(),
}));

vi.mock('./user-shard-splitter-cloud', () => ({
  saveUserShardSplitterCloudState: vi.fn(),
}));

vi.mock('./user-reminder-cloud', () => ({
  saveUserChecklistCloudState: vi.fn(),
  saveUserReminderCloudState: vi.fn(),
}));

vi.mock('./user-command-shared-state', () => ({
  sendCommandSharedCloudOutboxPayload: vi.fn(),
}));

import { drainDueCloudOutboxEntries } from './cloud-sync-outbox-drain';

const TEST_USER_ID = 'drain-test-user';
const TEST_SCOPE = 'shared-settings';

describe('cloud-sync-outbox-drain', () => {
  afterEach(async () => {
    sendMock.mockReset();
    const db = getToolsBotDb();
    await db.cloudSyncOutbox.delete(`${TEST_USER_ID}::${TEST_SCOPE}`);
  });

  it('drains due outbox entries through scope send handlers', async () => {
    sendMock.mockResolvedValue(true);
    await upsertCloudOutboxState(TEST_USER_ID, TEST_SCOPE, { cloudSyncEnabled: true });

    const result = await drainDueCloudOutboxEntries();

    expect(result.attempted).toBeGreaterThanOrEqual(1);
    expect(result.synced).toBeGreaterThanOrEqual(1);
    expect(sendMock).toHaveBeenCalledWith(TEST_USER_ID, expect.objectContaining({ cloudSyncEnabled: true }));

    const db = getToolsBotDb();
    const remaining = await db.cloudSyncOutbox.get(`${TEST_USER_ID}::${TEST_SCOPE}`);
    expect(remaining).toBeUndefined();
  });
});
