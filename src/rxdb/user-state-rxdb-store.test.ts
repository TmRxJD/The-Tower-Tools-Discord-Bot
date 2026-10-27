import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

const tables = vi.hoisted(() => ({
  shared: new Map<string, Row>(),
  lab: new Map<string, Row>(),
}));

vi.mock('../services/idb', () => ({
  getToolsBotDb: () => ({
    sharedUserSettings: {
      get: async (id: string) => tables.shared.get(id),
      put: async (row: Row) => { tables.shared.set(String(row.userId), row); },
      delete: async (id: string) => { tables.shared.delete(id); },
    },
    labSettings: {
      get: async (id: string) => tables.lab.get(id),
      put: async (row: Row) => { tables.lab.set(String(row.userId), row); },
      delete: async (id: string) => { tables.lab.delete(id); },
    },
  }),
}));

import { getUserSharedSettings, saveUserSharedSettings } from '../services/user-shared-settings-db';
import { getUserLabSettings } from '../services/user-lab-db';

const USER = '900000000000000001';

describe('tools user-state RxDB store', () => {
  beforeEach(() => {
    tables.shared.clear();
    tables.lab.clear();
  });

  it('initialises RxDB in production mode (no DB9) and serves the legacy row through it', async () => {
    tables.shared.set(USER, {
      userId: USER,
      cloudSyncEnabled: 0,
      useSharedToolInputs: 1,
      chartPalettePreset: 'default',
      chartDataAlignment: 'left',
      languagePreference: 'en',
      dateFormatPreference: 'mdy',
      decimalSeparatorPreference: 'dot',
      runDeltaMode: 'off',
      updatedAt: 1_700_000_000_000,
    });

    const { loadSharedSettingsFromRxDB } = await import('./user-state-rxdb-store');
    const loaded = await loadSharedSettingsFromRxDB(USER);

    expect(loaded.updatedAt).toBe(1_700_000_000_000);
    expect(loaded.state.useSharedToolInputs).toBe(true);
  });

  it('keeps the legacy sqlite rows after seeding: they are the durable copy', async () => {
    tables.shared.set(USER, { userId: USER, cloudSyncEnabled: 0, useSharedToolInputs: 1, updatedAt: 1_700_000_000_000 });
    tables.lab.set(USER, { userId: USER, labSpeed: 5, labRelic: 0, labDiscount: 0, speedUp: 0, hideMaxedLabs: 0, labLevels: {}, updatedAt: 1_700_000_000_000 });

    const { seedToolsUserStateFromLegacyIfNeeded } = await import('./user-state-rxdb-store');
    await seedToolsUserStateFromLegacyIfNeeded(USER);

    expect(tables.shared.has(USER)).toBe(true);
    expect(tables.lab.has(USER)).toBe(true);
  });

  it('writes every save through to sqlite as well as RxDB', async () => {
    const current = await getUserSharedSettings(USER);
    await saveUserSharedSettings(USER, { ...current, runDeltaMode: '3day' } as never);

    expect(tables.shared.get(USER)?.runDeltaMode).toBe('3day');
    expect((await getUserSharedSettings(USER)).runDeltaMode).toBe('3day');
  });

  it('returns defaults for a user with no rows anywhere', async () => {
    expect(await getUserLabSettings('900000000000000002')).toBeTruthy();
  });
  it('seeds each user independently even when the shared collections already contain other users', async () => {
    const { loadSharedSettingsFromRxDB, loadLabSettingsFromRxDB } = await import('./user-state-rxdb-store');
    for (let index = 0; index < 12; index += 1) {
      const userId = `9000000000000001${String(index).padStart(2, '0')}`;
      tables.shared.set(userId, { userId, cloudSyncEnabled: 0, useSharedToolInputs: index % 2, updatedAt: 1_700_000_000_000 + index });
      tables.lab.set(userId, { userId, labSpeed: index + 1, labRelic: 0, labDiscount: 0, speedUp: 0, hideMaxedLabs: 0, labLevels: {}, updatedAt: 1_700_000_000_000 + index });
      expect((await loadSharedSettingsFromRxDB(userId)).state.useSharedToolInputs).toBe(index % 2 === 1);
      expect((await loadLabSettingsFromRxDB(userId)).state?.labSpeed).toBe(index + 1);
      expect((await loadLabSettingsFromRxDB(userId)).state?.hideMaxedLabs).toBe(false);
    }
  });
  it('falls back to the newly saved durable row after a cache write fails', async () => {
    const userId = 'offline-cache-write-failure';
    const { saveSharedSettingsToRxDB } = await import('./user-state-rxdb-store');
    const { getOrInitToolsUserStateRxDatabase } = await import('./database-manager');
    const current = await getUserSharedSettings(userId);
    await saveUserSharedSettings(userId, { ...current, useSharedToolInputs: true });
    const db = await getOrInitToolsUserStateRxDatabase(userId);
    const upsert = vi.spyOn(db.shared_user_settings, 'upsert').mockRejectedValueOnce(Object.assign(new Error('private payload'), { code: 'SQLITE_BUSY' }));
    await saveUserSharedSettings(userId, { ...current, useSharedToolInputs: false });
    expect(tables.shared.get(userId)?.useSharedToolInputs).toBe(0);
    expect((await getUserSharedSettings(userId)).useSharedToolInputs).toBe(false);
    upsert.mockRestore();
    await saveSharedSettingsToRxDB(userId, { ...current, useSharedToolInputs: false });
    expect((await getUserSharedSettings(userId)).useSharedToolInputs).toBe(false);
  });
  it('propagates a seeding read failure so callers use sqlite instead of empty defaults', async () => {
    const userId = 'offline-seed-read-failure';
    tables.shared.set(userId, { userId, useSharedToolInputs: 0, updatedAt: 123 });
    const { getOrInitToolsUserStateRxDatabase } = await import('./database-manager');
    const db = await getOrInitToolsUserStateRxDatabase(userId);
    const find = vi.spyOn(db.shared_user_settings, 'findOne').mockImplementationOnce(() => ({ exec: async () => { throw Object.assign(new Error('private'), { code: 'SQLITE_BUSY' }); } }) as never);
    expect((await getUserSharedSettings(userId)).useSharedToolInputs).toBe(false);
    find.mockRestore();
    expect((await getUserSharedSettings(userId)).useSharedToolInputs).toBe(false);
  });
  it('keeps a newer failed cache write dirty when an older overlapping write completes', async () => {
    const userId = 'offline-overlapping-cache-writes';
    const { saveSharedSettingsToRxDB, loadSharedSettingsFromRxDB } = await import('./user-state-rxdb-store');
    const { getOrInitToolsUserStateRxDatabase } = await import('./database-manager');
    const current = await getUserSharedSettings(userId);
    await saveUserSharedSettings(userId, current);
    const db = await getOrInitToolsUserStateRxDatabase(userId);
    let finishOlder!: () => void;
    let failNewer!: (error: Error) => void;
    const upsert = vi.spyOn(db.shared_user_settings, 'upsert')
      .mockImplementationOnce(() => new Promise(resolve => { finishOlder = () => resolve(undefined as never); }))
      .mockImplementationOnce(() => new Promise((_resolve, reject) => { failNewer = reject; }));
    const older = saveSharedSettingsToRxDB(userId, current);
    const newer = saveSharedSettingsToRxDB(userId, current).catch(error => error);
    await vi.waitFor(() => expect(upsert).toHaveBeenCalledTimes(2));
    finishOlder();
    await older;
    failNewer(new Error('offline failure'));
    await newer;
    await expect(loadSharedSettingsFromRxDB(userId)).rejects.toMatchObject({ code: 'CACHE_STALE' });
    upsert.mockRestore();
  });
});
