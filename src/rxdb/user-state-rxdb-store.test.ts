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
});
