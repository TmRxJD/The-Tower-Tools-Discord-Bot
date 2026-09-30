import {
  defaultUserLabSettings,
  normalizeSharedUserToolSettings,
  normalizeUserLabSettings,
  type SharedUserToolSettings,
  type UserLabSettings,
} from '@tmrxjd/platform/tools';
import { logger } from '../core/logger';
import { getToolsBotDb } from '../services/idb';
import { getOrInitToolsUserStateRxDatabase } from './database-manager';
import { bindToolsUserStateRxDBInboundSync } from './reactive-sync';
import type { ToolsUserStateRxDatabase } from './init-database';

/**
 * The Node RxDB engine keeps documents in memory, so the legacy sqlite rows stay the durable copy and
 * are re-seeded into RxDB after every restart. Seeding is remembered per process only.
 */
const seededThisProcess = new Set<string>();

export async function ensureToolsUserStateRxDatabase(userId: string): Promise<ToolsUserStateRxDatabase> {
  const db = await getOrInitToolsUserStateRxDatabase(userId);
  await bindToolsUserStateRxDBInboundSync(userId).catch(() => {});
  return db;
}

async function readLegacySharedSettingsSqlite(userId: string): Promise<Record<string, unknown> | null> {
  const database = getToolsBotDb();
  const row = await database.sharedUserSettings.get(userId);
  if (!row) {
    return null;
  }

  return {
    cloudSyncEnabled: Boolean(row.cloudSyncEnabled),
    chartPalettePreset: row.chartPalettePreset,
    chartDataAlignment: row.chartDataAlignment,
    languagePreference: row.languagePreference,
    dateFormatPreference: row.dateFormatPreference,
    decimalSeparatorPreference: row.decimalSeparatorPreference,
    runDeltaMode: row.runDeltaMode,
    useSharedToolInputs: row.useSharedToolInputs,
    updatedAt: row.updatedAt,
  };
}

async function readLegacyLabSettingsSqlite(userId: string): Promise<Record<string, unknown> | null> {
  const database = getToolsBotDb();
  const row = await database.labSettings.get(userId);
  if (!row) {
    return null;
  }

  return {
    labSpeed: row.labSpeed,
    labRelic: row.labRelic,
    labDiscount: row.labDiscount,
    speedUp: row.speedUp,
    hideMaxedLabs: row.hideMaxedLabs,
    labLevels: row.labLevels ?? {},
    updatedAt: row.updatedAt,
  };
}

export async function seedToolsUserStateFromLegacyIfNeeded(userId: string): Promise<void> {
  if (seededThisProcess.has(userId)) {
    return;
  }

  const db = await ensureToolsUserStateRxDatabase(userId);
  const [sharedCount, labCount] = await Promise.all([
    db.shared_user_settings.count().exec().catch(() => -1),
    db.lab_settings.count().exec().catch(() => -1),
  ]);

  if (sharedCount > 0 && labCount > 0) {
    seededThisProcess.add(userId);
    return;
  }

  let seeded = false;

  if (sharedCount === 0) {
    const legacyShared = await readLegacySharedSettingsSqlite(userId);
    if (legacyShared) {
      const normalized = normalizeSharedUserToolSettings(legacyShared);
      const updatedAt = Number.isFinite(Number(legacyShared.updatedAt))
        ? Number(legacyShared.updatedAt)
        : Date.now();
      await db.shared_user_settings.upsert({
        id: userId,
        userId,
        updatedAt,
        ...normalized,
      });
      seeded = true;
    }
  }

  if (labCount === 0) {
    const legacyLab = await readLegacyLabSettingsSqlite(userId);
    if (legacyLab) {
      const normalized = normalizeUserLabSettings({
        ...defaultUserLabSettings,
        ...legacyLab,
        labLevels: legacyLab.labLevels ?? {},
      });
      const updatedAt = Number.isFinite(Number(legacyLab.updatedAt))
        ? Number(legacyLab.updatedAt)
        : Date.now();
      await db.lab_settings.upsert({
        id: userId,
        userId,
        updatedAt,
        ...normalized,
      });
      seeded = true;
    }
  }

  if (sharedCount > 0 || labCount > 0 || seeded) {
    seededThisProcess.add(userId);
    if (seeded) {
      logger.info('[rxdb] seeded legacy sqlite user state into RxDB', { userId });
    }
  }
}

export async function loadSharedSettingsFromRxDB(userId: string): Promise<{
  state: SharedUserToolSettings;
  updatedAt: number | null;
}> {
  await seedToolsUserStateFromLegacyIfNeeded(userId);
  const db = await ensureToolsUserStateRxDatabase(userId);
  const document = await db.shared_user_settings.findOne(userId).exec();
  if (!document) {
    const defaults = normalizeSharedUserToolSettings(null);
    return { state: defaults, updatedAt: null };
  }

  const normalized = normalizeSharedUserToolSettings(document.toJSON());
  return {
    state: normalized,
    updatedAt: Number.isFinite(Number(document.updatedAt)) ? Number(document.updatedAt) : null,
  };
}

export async function saveSharedSettingsToRxDB(
  userId: string,
  settings: SharedUserToolSettings,
): Promise<void> {
  await seedToolsUserStateFromLegacyIfNeeded(userId);
  const db = await ensureToolsUserStateRxDatabase(userId);
  const normalized = normalizeSharedUserToolSettings(settings);
  await db.shared_user_settings.upsert({
    id: userId,
    userId,
    updatedAt: Date.now(),
    ...normalized,
  });
}

export async function loadLabSettingsFromRxDB(userId: string): Promise<{
  state: UserLabSettings | null;
  updatedAt: number | null;
}> {
  await seedToolsUserStateFromLegacyIfNeeded(userId);
  const db = await ensureToolsUserStateRxDatabase(userId);
  const document = await db.lab_settings.findOne(userId).exec();
  if (!document) {
    return { state: null, updatedAt: null };
  }

  const payload = document.toJSON();
  return {
    state: normalizeUserLabSettings({
      ...defaultUserLabSettings,
      ...payload,
      labLevels: payload.labLevels ?? {},
    }),
    updatedAt: Number.isFinite(Number(document.updatedAt)) ? Number(document.updatedAt) : null,
  };
}

export async function saveLabSettingsToRxDB(userId: string, settings: UserLabSettings): Promise<void> {
  await seedToolsUserStateFromLegacyIfNeeded(userId);
  const db = await ensureToolsUserStateRxDatabase(userId);
  const normalized = normalizeUserLabSettings(settings);
  await db.lab_settings.upsert({
    id: userId,
    userId,
    updatedAt: Date.now(),
    ...normalized,
  });
}
