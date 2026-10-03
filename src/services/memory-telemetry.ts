import { mkdir, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { ToolsBotClient } from '../core/tools-bot-client';
import { collectMemoryMetrics, type MemoryActivityCounts } from '../core/memory-metrics';
import { getToolsUserStateDatabaseCounts } from '../rxdb/database-manager';
import { getToolsUserStateSubscriptionCount } from '../rxdb/reactive-sync';
import { getDiscordIdentityCacheCount } from './discord-identity-resolver';
import { getCachedTrackerAiKbArtifactCounts } from './trackerai-kb-artifact';
import { getPendingBattleConditionsDeliveryCount } from './battle-conditions-delivery';

let stop: (() => void) | null = null;

/** One fixed-size snapshot per minute; a separate passive collector retains bounded history. */
export function startMemoryTelemetry(client: ToolsBotClient): void {
  if (stop) return;
  const activity: MemoryActivityCounts = { gatewayDispatches: 0, messageCreates: 0, interactionCreates: 0 };
  const onRaw = (packet: { t?: string }) => {
    activity.gatewayDispatches += 1;
    if (packet.t === 'MESSAGE_CREATE') activity.messageCreates += 1;
    if (packet.t === 'INTERACTION_CREATE') activity.interactionCreates += 1;
  };
  client.on('raw', onRaw);
  const directory = resolve(process.env.TOOLSBOT_DATA_DIR?.trim() || resolve(__dirname, '../..', '.data'));
  const filename = resolve(directory, 'memory-telemetry.json');
  const pendingFilename = filename + '.pending';
  let stopped = false;
  let writing = false;
  const sample = async () => {
    if (stopped || writing) return;
    writing = true;
    try {
      const databases = getToolsUserStateDatabaseCounts();
      const kb = getCachedTrackerAiKbArtifactCounts();
      const metrics = collectMemoryMetrics(client, {
        rxdbDatabases: databases.open,
        rxdbInitializing: databases.initializing,
        rxdbSubscriptions: getToolsUserStateSubscriptionCount(),
        identityCache: getDiscordIdentityCacheCount(),
        scopedSessions: client.scopedInteractionSessions.size,
        battleDeliveryPending: getPendingBattleConditionsDeliveryCount(),
        kbChunks: kb.chunks,
        kbEmbeddings: kb.embeddings,
      }, activity);
      await mkdir(directory, { recursive: true });
      await writeFile(pendingFilename, JSON.stringify(metrics), 'utf8');
      await rename(pendingFilename, filename);
    } catch {
      // Diagnostic I/O failure must never affect commands or create an unbounded error log.
    } finally {
      writing = false;
    }
  };
  const interval = setInterval(() => { void sample(); }, 60_000);
  interval.unref();
  stop = () => {
    stopped = true;
    clearInterval(interval);
    client.off('raw', onRaw);
  };
  void sample();
}

export function stopMemoryTelemetry(): void {
  stop?.();
  stop = null;
}
