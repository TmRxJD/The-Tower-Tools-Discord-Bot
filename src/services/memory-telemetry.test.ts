import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ToolsBotClient } from '../core/tools-bot-client';

vi.mock('../rxdb/database-manager', () => ({ getToolsUserStateDatabaseCounts: () => ({ open: 2, initializing: 0 }) }));
vi.mock('../rxdb/reactive-sync', () => ({ getToolsUserStateSubscriptionCount: () => 2 }));
vi.mock('./discord-identity-resolver', () => ({ getDiscordIdentityCacheCount: () => 3 }));
vi.mock('./trackerai-kb-artifact', () => ({ getCachedTrackerAiKbArtifactCounts: () => ({ chunks: 10, embeddings: 10 }) }));
vi.mock('./battle-conditions-delivery', () => ({ getPendingBattleConditionsDeliveryCount: () => 0 }));
import { startMemoryTelemetry, stopMemoryTelemetry } from './memory-telemetry';

afterEach(() => { stopMemoryTelemetry(); vi.useRealTimers(); vi.unstubAllEnvs(); });

describe('passive memory telemetry lifecycle', () => {
  it('overwrites one bounded snapshot, ignores raw payload content, and removes its listener on stop', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'toolsbot-memory-test-'));
    vi.stubEnv('TOOLSBOT_DATA_DIR', directory);
    vi.useFakeTimers();
    const client = Object.assign(new EventEmitter(), {
      guilds: { cache: new Map() }, channels: { cache: new Map() }, users: { cache: new Map() },
      scopedInteractionSessions: { size: 0 }, isReady: () => true,
    });
    const filename = join(directory, 'memory-telemetry.json');
    try {
      startMemoryTelemetry(client as unknown as ToolsBotClient);
      startMemoryTelemetry(client as unknown as ToolsBotClient);
      expect(client.listenerCount('raw')).toBe(1);
      await vi.waitFor(async () => { expect(JSON.parse(await readFile(filename, 'utf8')).activity.gatewayDispatches).toBe(0); });
      client.emit('raw', { t: 'MESSAGE_CREATE', d: { content: 'private-message-body', author: { id: 'private-user-id' } } });
      client.emit('raw', { t: 'INTERACTION_CREATE', d: { token: 'private-token' } });
      await vi.advanceTimersByTimeAsync(60_000);
      await vi.waitFor(async () => {
        const raw = await readFile(filename, 'utf8');
        expect(JSON.parse(raw).activity).toEqual({ gatewayDispatches: 2, messageCreates: 1, interactionCreates: 1 });
        expect(raw).not.toContain('private-');
        expect(raw.length).toBeLessThan(4096);
      });
      expect(await readdir(directory)).toEqual(['memory-telemetry.json']);
      stopMemoryTelemetry();
      expect(client.listenerCount('raw')).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      stopMemoryTelemetry();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
