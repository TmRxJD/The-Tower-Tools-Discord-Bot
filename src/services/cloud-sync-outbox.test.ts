import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getToolsBotDb } from './idb';
import { syncCloudOutboxState, upsertCloudOutboxState } from './cloud-sync-outbox';

const TEST_USER_ID = 'test-user';
const TEST_SCOPE = 'test-scope';

beforeAll(() => {
  const testDataDir = join(tmpdir(), `toolsbot-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(testDataDir, { recursive: true });
  process.env.TOOLSBOT_DATA_DIR = testDataDir;
});

beforeEach(async () => {
  const db = getToolsBotDb();
  await db.cloudSyncOutbox.delete(`${TEST_USER_ID}::${TEST_SCOPE}`);
});

describe('cloud-sync-outbox', () => {
  it('resets attempts when payload changes', async () => {
    const firstPayload = { version: 1 };
    await upsertCloudOutboxState(TEST_USER_ID, TEST_SCOPE, firstPayload);

    await syncCloudOutboxState({
      userId: TEST_USER_ID,
      scope: TEST_SCOPE,
      payload: firstPayload,
      send: async () => false,
    });

    const db = getToolsBotDb();
    const afterFailure = await db.cloudSyncOutbox.get(`${TEST_USER_ID}::${TEST_SCOPE}`);
    expect(afterFailure?.attempts).toBe(1);
    expect(afterFailure?.lastError).toBe('Cloud save returned unsuccessful result');

    await upsertCloudOutboxState(TEST_USER_ID, TEST_SCOPE, { version: 2 });

    const afterPayloadChange = await db.cloudSyncOutbox.get(`${TEST_USER_ID}::${TEST_SCOPE}`);
    expect(afterPayloadChange?.attempts).toBe(0);
    expect(afterPayloadChange?.lastError).toBeNull();
  });

  it('stops sending after max retry attempts', async () => {
    const send = vi.fn(async () => false);
    const payload = { value: 'retry-test' };

    await upsertCloudOutboxState(TEST_USER_ID, TEST_SCOPE, payload);

    const db = getToolsBotDb();
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const current = await db.cloudSyncOutbox.get(`${TEST_USER_ID}::${TEST_SCOPE}`);
      expect(current).toBeTruthy();

      await db.cloudSyncOutbox.put({
        ...(current as NonNullable<typeof current>),
        nextRetryAt: Date.now() - 1,
      });

      await syncCloudOutboxState({
        userId: TEST_USER_ID,
        scope: TEST_SCOPE,
        payload,
        send,
      });
    }

    const reachedCap = await db.cloudSyncOutbox.get(`${TEST_USER_ID}::${TEST_SCOPE}`);
    expect(reachedCap?.attempts).toBe(8);

    await db.cloudSyncOutbox.put({
      ...(reachedCap as NonNullable<typeof reachedCap>),
      nextRetryAt: Date.now() - 1,
    });

    await syncCloudOutboxState({
      userId: TEST_USER_ID,
      scope: TEST_SCOPE,
      payload,
      send,
    });

    const afterCap = await db.cloudSyncOutbox.get(`${TEST_USER_ID}::${TEST_SCOPE}`);
    expect(send).toHaveBeenCalledTimes(8);
    expect(afterCap?.attempts).toBe(8);
    expect((afterCap?.nextRetryAt ?? 0) > Date.now()).toBe(true);
  });
});
