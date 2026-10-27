import { expect, it } from 'vitest';
import { getOrInitToolsUserStateRxDatabase, getToolsUserStateDatabaseCounts } from './database-manager';
import { bindToolsUserStateRxDBInboundSync, getToolsUserStateSubscriptionCount, registerToolsUserStateInboundChangeHandler, unbindToolsUserStateRxDBInboundSync } from './reactive-sync';
import { defaultUserLabSettings, normalizeSharedUserToolSettings } from '@tmrxjd/platform/tools';

it('serves more than seven users concurrently with two collections and isolates their settings', async () => {
  const users = Array.from({ length: 20 }, (_, index) => `offline-cap-${index}`);
  const databases = await Promise.all(users.map(user => getOrInitToolsUserStateRxDatabase(user)));
  expect(new Set(databases).size).toBe(1);
  expect(getToolsUserStateDatabaseCounts()).toEqual({ open: 1, initializing: 0 });
  const db = databases[0];
  expect(Object.keys(db.collections).sort()).toEqual(['lab_settings', 'shared_user_settings']);
  for (const [index, userId] of users.entries()) {
    await db.shared_user_settings.upsert({ id: userId, userId, updatedAt: 1, ...normalizeSharedUserToolSettings({ useSharedToolInputs: index % 2 === 0 }) });
    await db.lab_settings.upsert({ id: userId, userId, updatedAt: 1, ...defaultUserLabSettings, labSpeed: index + 1 });
  }
  for (const [index, userId] of users.entries()) {
    expect((await db.shared_user_settings.findOne(userId).exec())?.useSharedToolInputs).toBe(index % 2 === 0);
    expect((await db.lab_settings.findOne(userId).exec())?.labSpeed).toBe(index + 1);
  }
  await Promise.all(users.flatMap(user => [bindToolsUserStateRxDBInboundSync(user), bindToolsUserStateRxDBInboundSync(user)]));
  expect(getToolsUserStateSubscriptionCount()).toBe(users.length);
  await new Promise(resolve => setTimeout(resolve, 50));
  const changedUsers: string[] = [];
  registerToolsUserStateInboundChangeHandler(({ userId }) => changedUsers.push(userId));
  await db.shared_user_settings.upsert({ id: users[0], userId: users[0], updatedAt: 2, ...normalizeSharedUserToolSettings({ useSharedToolInputs: false }) });
  await new Promise(resolve => setTimeout(resolve, 50));
  expect(changedUsers).toContain(users[0]);
  expect(new Set(changedUsers)).toEqual(new Set([users[0]]));
  users.forEach(unbindToolsUserStateRxDBInboundSync);
  expect(getToolsUserStateSubscriptionCount()).toBe(0);
  await db.close();
}, 15_000);
