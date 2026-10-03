import { EventEmitter } from 'node:events';
import type { Client } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { collectMemoryMetrics, type MemoryStateCounts } from './memory-metrics';

describe('sanitized passive memory metrics', () => {
  it('counts cache sizes and listeners without serializing entries or event names', () => {
    const client = Object.assign(new EventEmitter(), {
      guilds: { cache: new Map([['private-guild-id', { members: { cache: new Map([['private-member-id', {}]]) } }]]) },
      channels: { cache: new Map([
        ['private-channel-id', { messages: { cache: new Map([['private-message-id', { content: 'private-message-body' }]]) } }],
        ['private-voice-id', {}],
      ]) },
      users: { cache: new Map([['private-user-id', { username: 'private-username' }]]) },
      isReady: () => true,
    });
    client.on('interactionCreate', () => {});
    client.on('private-event-name', () => {});
    const state = Object.assign({ rxdbDatabases: 3, rxdbInitializing: 0, rxdbSubscriptions: 3, identityCache: 2, scopedSessions: 1, battleDeliveryPending: 0, kbChunks: 10, kbEmbeddings: 10 }, { unexpectedSecret: 'private-token' });
    const metrics = collectMemoryMetrics(client as unknown as Client, state, { gatewayDispatches: 5, messageCreates: 4, interactionCreates: 1 });
    expect(metrics.discord).toMatchObject({ ready: true, guilds: 1, channels: 2, users: 1, members: 1, messages: 1, listeners: 2, interactionListeners: 1 });
    expect(metrics.activity).toEqual({ gatewayDispatches: 5, messageCreates: 4, interactionCreates: 1 });
    expect(metrics.state.rxdbDatabases).toBe(3);
    expect(JSON.stringify(metrics)).not.toContain('private-');
    expect(metrics.memory.heapUsed).toBeGreaterThan(0);
  });

  it('reports empty caches without opening user databases or fetching Discord data', () => {
    const client = Object.assign(new EventEmitter(), {
      guilds: { cache: new Map() }, channels: { cache: new Map() }, users: { cache: new Map() }, isReady: () => false,
    });
    const state: MemoryStateCounts = { rxdbDatabases: 0, rxdbInitializing: 0, rxdbSubscriptions: 0, identityCache: 0, scopedSessions: 0, battleDeliveryPending: 0, kbChunks: 0, kbEmbeddings: 0 };
    expect(collectMemoryMetrics(client as unknown as Client, state, { gatewayDispatches: 0, messageCreates: 0, interactionCreates: 0 }).discord).toMatchObject({ ready: false, messages: 0, members: 0, users: 0, listeners: 0 });
  });
});
