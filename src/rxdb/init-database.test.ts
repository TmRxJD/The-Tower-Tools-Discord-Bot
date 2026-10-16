import { randomUUID } from 'node:crypto';
import { BroadcastChannel, OPEN_BROADCAST_CHANNELS } from 'broadcast-channel';
import { expect, it } from 'vitest';
import { normalizeSharedUserToolSettings } from '@tmrxjd/platform/tools';
import { initToolsUserStateRxDatabase } from './init-database';

it('uses Node broadcasts without idle IndexedDB transaction retention and preserves writes', async () => {
  process.env.TRACKER_RUN_RXDB_NODE_ENGINE = 'fake';
  const db = await initToolsUserStateRxDatabase(`synthetic_transport_${randomUUID()}`);
  const channels: BroadcastChannel[] = [];
  const subscriptions = [db.shared_user_settings.find().$.subscribe(() => {})];
  try {
    expect(db.multiInstance).toBe(true);
    expect([...OPEN_BROADCAST_CHANNELS].every(channel => channel.type === 'node')).toBe(true);
    const name = `synthetic_notification_${randomUUID()}`;
    const sender = new BroadcastChannel(name);
    const receiver = new BroadcastChannel(name);
    channels.push(sender, receiver);
    const received = new Promise(resolve => { receiver.onmessage = resolve; });
    await sender.postMessage({ synthetic: true });
    await expect(received).resolves.toEqual({ synthetic: true });

    const userId = '900000000000000099';
    await db.shared_user_settings.upsert({
      id: userId, userId, updatedAt: 1_700_000_000_000,
      ...normalizeSharedUserToolSettings({ useSharedToolInputs: true }),
    });
    expect((await db.shared_user_settings.findOne(userId).exec())?.userId).toBe(userId);
    const indexedDB = globalThis.indexedDB as IDBFactory & {
      _databases: Map<string, { transactions: { _state: string }[] }>;
    };
    const retained = () => [...indexedDB._databases.values()]
      .flatMap(database => database.transactions).filter(tx => tx._state === 'finished').length;
    await new Promise(resolve => setTimeout(resolve, 300));
    const before = retained();
    await new Promise(resolve => setTimeout(resolve, 1_200));
    expect(retained()).toBe(before);
  } finally {
    subscriptions.forEach(subscription => subscription.unsubscribe());
    await Promise.all(channels.map(channel => channel.close()));
    await db.close();
  }
}, 15_000);
