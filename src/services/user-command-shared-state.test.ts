import { beforeEach, describe, expect, it, vi } from 'vitest';

const syncCloudOutboxStateMock = vi.fn();
const getEffectiveUserSharedSettingsMock = vi.fn();

const shardStateStore = new Map<string, Record<string, unknown>>();

vi.mock('./cloud-sync-outbox', () => ({
  syncCloudOutboxState: (...args: unknown[]) => syncCloudOutboxStateMock(...args),
}));

vi.mock('./user-shared-settings-db', () => ({
  getEffectiveUserSharedSettings: (...args: unknown[]) => getEffectiveUserSharedSettingsMock(...args),
}));

vi.mock('./idb', () => ({
  getToolsBotDb: () => ({
    shardSplitterSettings: {
      get: vi.fn(async (id: string) => shardStateStore.get(id)),
      where: vi.fn(() => ({
        equals: vi.fn(() => ({
          first: vi.fn(async () => undefined),
        })),
      })),
      put: vi.fn(async (value: Record<string, unknown>) => {
        const id = String(value.id ?? '');
        shardStateStore.set(id, value);
      }),
    },
  }),
}));

vi.mock('@tmrxjd/platform/tools', async () => {
  const actual = await vi.importActual<typeof import('@tmrxjd/platform/tools')>('@tmrxjd/platform/tools');
  return {
    ...actual,
    saveSyncedToolState: vi.fn(async ({ state, normalize, saveLocal, isCloudSyncEnabled, queueCloudSync }) => {
      const normalized = normalize(state);
      await saveLocal(normalized);
      if (await isCloudSyncEnabled()) {
        await queueCloudSync(normalized);
      }
    }),
  };
});

import { saveUserCommandSharedState } from './user-command-shared-state';

describe('user-command-shared-state cloud gating', () => {
  beforeEach(() => {
    syncCloudOutboxStateMock.mockReset();
    getEffectiveUserSharedSettingsMock.mockReset();
    shardStateStore.clear();
  });

  it('does not queue cloud sync when shared settings disable it', async () => {
    getEffectiveUserSharedSettingsMock.mockResolvedValue({
      cloudSyncEnabled: false,
      chartPalettePreset: 'default',
      chartDataAlignment: 'left',
    });

    await saveUserCommandSharedState(
      'user-1',
      'chart',
      { renderer: 'cells', metric: 'wave' },
      input => ({ ...(input ?? {}) }),
    );

    expect(syncCloudOutboxStateMock).not.toHaveBeenCalled();
  });

  it('queues cloud sync when shared settings enable it', async () => {
    getEffectiveUserSharedSettingsMock.mockResolvedValue({
      cloudSyncEnabled: true,
      chartPalettePreset: 'default',
      chartDataAlignment: 'left',
    });

    await saveUserCommandSharedState(
      'user-1',
      'chart',
      { renderer: 'cells', metric: 'wave' },
      input => ({ ...(input ?? {}) }),
    );

    expect(syncCloudOutboxStateMock).toHaveBeenCalledTimes(1);
    expect(syncCloudOutboxStateMock).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      scope: 'command-shared:chart',
      payload: { renderer: 'cells', metric: 'wave' },
    }));
  });
});