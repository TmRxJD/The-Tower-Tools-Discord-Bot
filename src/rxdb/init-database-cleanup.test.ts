import { expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ create: vi.fn(), close: vi.fn(), collections: vi.fn() }));
vi.mock('rxdb/plugins/core', () => ({ addRxPlugin: vi.fn(), createRxDatabase: mocks.create }));
vi.mock('@tmrxjd/platform/node', () => ({ buildTrackerRunRxDatabaseName: (_prefix: string, scope: string) => scope, ensureTrackerRunNodeRxDBStorage: vi.fn() }));
import { initToolsUserStateRxDatabase } from './init-database';

it('closes partially initialized databases before a retry can reuse the name', async () => {
  const error = Object.assign(new Error('collection limit'), { code: 'COL23' });
  mocks.collections.mockRejectedValueOnce(error).mockResolvedValueOnce({});
  mocks.close.mockResolvedValue(true);
  mocks.create.mockResolvedValue({ addCollections: mocks.collections, close: mocks.close });
  await expect(initToolsUserStateRxDatabase('same-user')).rejects.toBe(error);
  expect(mocks.close).toHaveBeenCalledOnce();
  await expect(initToolsUserStateRxDatabase('same-user')).resolves.toBeDefined();
  expect(mocks.create).toHaveBeenCalledTimes(2);
});
