import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type {
  BattleConditionsChannelMap,
  BattleConditionsDeliveredDates,
} from '@tmrxjd/platform/tools';
import sqlite3 from 'sqlite3';
import { logger } from '../core/logger';

export interface ToolsBotStorageStatus {
  backend: 'sqlite';
  persistent: true;
  dbPath: string;
}

export interface CommandUsageRecord {
  id?: number;
  commandName: string;
  userId?: string;
  guildId?: string;
  event: string;
  createdAt: number;
}

export interface ChecklistRecord {
  userId: string;
  labels: Array<string | null>;
  tasks: boolean[];
  updatedAt: number;
}

export interface ReminderToggleRecord {
  id: string;
  userId: string;
  reminderKey: string;
  enabled: number;
  updatedAt?: number;
}

export interface ReminderSettingsRecord {
  userId: string;
  paused: number;
  updatedAt?: number;
}

export interface ReminderLastSentRecord {
  id: string;
  userId: string;
  reminderKey: string;
  lastSent: number;
}

export interface LabSettingsRecord {
  userId: string;
  labSpeed: number;
  labRelic: number;
  labDiscount: number;
  speedUp: number;
  hideMaxedLabs: number;
  labLevels: Record<string, { startLevel: number; targetLevel: number }>;
  updatedAt: number;
}

export interface SharedUserSettingsRecord {
  userId: string;
  cloudSyncEnabled: number;
  chartPalettePreset: string;
  chartDataAlignment: string;
  updatedAt: number;
}

export interface ShardSplitterSettingsRecord {
  id: string;
  userId: string;
  collection: string;
  recordId: string;
  data: Record<string, unknown>;
  updatedAt: number;
}

export interface CloudSyncOutboxRecord {
  id: string;
  userId: string;
  scope: string;
  payload: Record<string, unknown>;
  attempts: number;
  nextRetryAt: number;
  lastError: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface BattleConditionsSubscriptionRecord {
  guildId: string;
  channels: BattleConditionsChannelMap;
  deliveredTournamentDates: BattleConditionsDeliveredDates;
  updatedAt: number;
}

export interface BattleConditionsSchedulerStateRecord {
  id: string;
  windowKey: string | null;
  lastPolledAt: number | null;
  resolvedAt: number | null;
  lastSeenTournamentDates: BattleConditionsDeliveredDates;
  updatedAt: number;
}

export interface AcronymOverrideRecord {
  key: string;
  expansion: string;
  updatedAt: number;
  updatedByUserId?: string;
}

export interface AcronymRemovalRecord {
  key: string;
  updatedAt: number;
  updatedByUserId?: string;
}

export type AcronymProposalAction = 'add' | 'remove';
export type AcronymProposalStatus = 'pending' | 'approved' | 'denied';

export interface AcronymProposalRecord {
  id: string;
  guildId: string;
  requesterUserId: string;
  requestChannelId: string;
  helpersChannelId: string;
  action: AcronymProposalAction;
  key: string;
  expansion?: string;
  existingExpansion?: string;
  status: AcronymProposalStatus;
  createdAt: number;
  helpersMessageId?: string;
  reviewedAt?: number;
  reviewedByUserId?: string;
}

type RowRecord = { value: string };

function runSql(db: sqlite3.Database, sql: string, params: unknown[] = []): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    db.run(sql, params, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolvePromise();
    });
  });
}

function getSqlRow<T>(db: sqlite3.Database, sql: string, params: unknown[] = []): Promise<T | undefined> {
  return new Promise((resolvePromise, reject) => {
    db.get(sql, params, (error, row) => {
      if (error) {
        reject(error);
        return;
      }
      resolvePromise(row as T | undefined);
    });
  });
}

function allSqlRows<T>(db: sqlite3.Database, sql: string, params: unknown[] = []): Promise<T[]> {
  return new Promise((resolvePromise, reject) => {
    db.all(sql, params, (error, rows) => {
      if (error) {
        reject(error);
        return;
      }
      resolvePromise((rows as T[]) ?? []);
    });
  });
}

let sqliteDb: sqlite3.Database | null = null;
let sqliteReady: Promise<sqlite3.Database> | null = null;

function resolveToolsBotDbPath(): string {
  const projectRoot = resolve(__dirname, '../..');
  const explicitDataDir = process.env.TOOLSBOT_DATA_DIR?.trim();
  const dataDirPath = explicitDataDir && explicitDataDir.length > 0
    ? explicitDataDir
    : resolve(projectRoot, '.data');
  return join(dataDirPath, 'indexeddb', 'tools-bot-idb.sqlite');
}

async function getSqliteDb(): Promise<sqlite3.Database> {
  if (sqliteDb) {
    return sqliteDb;
  }

  if (!sqliteReady) {
    sqliteReady = (async () => {
      const dbPath = resolveToolsBotDbPath();
      const indexedDbDir = resolve(dbPath, '..');
      mkdirSync(indexedDbDir, { recursive: true });

      const db = await new Promise<sqlite3.Database>((resolvePromise, reject) => {
        const handle = new sqlite3.Database(dbPath, (error) => {
          if (error) {
            reject(error);
            return;
          }
          resolvePromise(handle);
        });
      });

      await runSql(
        db,
        'CREATE TABLE IF NOT EXISTS kv (tableName TEXT NOT NULL, rowKey TEXT NOT NULL, value TEXT NOT NULL, updatedAt INTEGER NOT NULL, PRIMARY KEY(tableName, rowKey))'
      );

      logger.info(`Initialized ToolsBot sqlite storage at ${dbPath}`);
      return db;
    })();
  }

  sqliteDb = await sqliteReady;
  return sqliteDb;
}

export async function assertToolsBotPersistentStorage(): Promise<void> {
  await getSqliteDb();
}

export async function getToolsBotStorageStatus(): Promise<ToolsBotStorageStatus> {
  await getSqliteDb();
  return {
    backend: 'sqlite',
    persistent: true,
    dbPath: resolveToolsBotDbPath(),
  };
}

async function putRow(tableName: string, rowKey: string, value: unknown): Promise<void> {
  const db = await getSqliteDb();
  await runSql(
    db,
    'INSERT INTO kv (tableName, rowKey, value, updatedAt) VALUES (?, ?, ?, ?) ON CONFLICT(tableName, rowKey) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt',
    [tableName, rowKey, JSON.stringify(value), Date.now()],
  );
}

async function getRow<T>(tableName: string, rowKey: string): Promise<T | undefined> {
  const db = await getSqliteDb();
  const row = await getSqlRow<RowRecord>(db, 'SELECT value FROM kv WHERE tableName = ? AND rowKey = ?', [tableName, rowKey]);
  return row ? JSON.parse(row.value) as T : undefined;
}

async function getAllRows<T>(tableName: string): Promise<T[]> {
  const db = await getSqliteDb();
  const rows = await allSqlRows<RowRecord>(db, 'SELECT value FROM kv WHERE tableName = ?', [tableName]);
  return rows.map((row) => JSON.parse(row.value) as T);
}

async function deleteRow(tableName: string, rowKey: string): Promise<void> {
  const db = await getSqliteDb();
  await runSql(db, 'DELETE FROM kv WHERE tableName = ? AND rowKey = ?', [tableName, rowKey]);
}

async function nextCounter(tableName: string): Promise<number> {
  const key = `counter:${tableName}`;
  const current = (await getRow<number>('__meta__', key)) ?? 0;
  const next = current + 1;
  await putRow('__meta__', key, next);
  return next;
}

function filterEquals<T extends object>(rows: T[], field: string, value: unknown): T[] {
  if (field.startsWith('[') && field.endsWith(']')) {
    const fields = field.slice(1, -1).split('+').map((part) => part.trim());
    const tuple = Array.isArray(value) ? value : [value];
    return rows.filter((row) => {
      const source = row as Record<string, unknown>;
      return fields.every((name, index) => source[name] === tuple[index]);
    });
  }

  return rows.filter((row) => (row as Record<string, unknown>)[field] === value);
}

class TableWhere<T extends object> {
  constructor(private readonly tableName: string, private readonly field: string) {}

  equals(value: unknown) {
    return {
      toArray: async (): Promise<T[]> => {
        const rows = await getAllRows<T>(this.tableName);
        return filterEquals(rows, this.field, value);
      },
      first: async (): Promise<T | undefined> => {
        const rows = await getAllRows<T>(this.tableName);
        return filterEquals(rows, this.field, value)[0];
      },
    };
  }

  aboveOrEqual(value: number) {
    return {
      toArray: async (): Promise<T[]> => {
        const rows = await getAllRows<T>(this.tableName);
        return rows.filter((row) => Number((row as Record<string, unknown>)[this.field] ?? 0) >= value);
      },
    };
  }
}

class TableAdapter<T extends object, K extends string | number> {
  constructor(
    private readonly tableName: string,
    private readonly keyField: keyof T,
    private readonly autoIncrement = false,
  ) {}

  async get(key: K): Promise<T | undefined> {
    return getRow<T>(this.tableName, String(key));
  }

  async put(record: T): Promise<void> {
    const key = (record as Record<string, unknown>)[String(this.keyField)];
    if (key === undefined || key === null || key === '') {
      throw new Error(`Missing primary key for table ${this.tableName}`);
    }

    await putRow(this.tableName, String(key), record);
  }

  async add(record: T): Promise<number> {
    if (!this.autoIncrement) {
      throw new Error(`add() is only supported on auto-increment tables (${this.tableName})`);
    }

    const nextId = await nextCounter(this.tableName);
    const withId = { ...record, [this.keyField]: nextId } as T;
    await putRow(this.tableName, String(nextId), withId);
    return nextId;
  }

  async delete(key: K): Promise<void> {
    await deleteRow(this.tableName, String(key));
  }

  async toArray(): Promise<T[]> {
    return getAllRows<T>(this.tableName);
  }

  where(field: string): TableWhere<T> {
    return new TableWhere<T>(this.tableName, field);
  }
}

export class ToolsBotDb {
  commandUsage = new TableAdapter<CommandUsageRecord, number>('commandUsage', 'id', true);
  checklists = new TableAdapter<ChecklistRecord, string>('checklists', 'userId');
  reminderToggles = new TableAdapter<ReminderToggleRecord, string>('reminderToggles', 'id');
  reminderSettings = new TableAdapter<ReminderSettingsRecord, string>('reminderSettings', 'userId');
  reminderLastSent = new TableAdapter<ReminderLastSentRecord, string>('reminderLastSent', 'id');
  labSettings = new TableAdapter<LabSettingsRecord, string>('labSettings', 'userId');
  sharedUserSettings = new TableAdapter<SharedUserSettingsRecord, string>('sharedUserSettings', 'userId');
  shardSplitterSettings = new TableAdapter<ShardSplitterSettingsRecord, string>('shardSplitterSettings', 'id');
  cloudSyncOutbox = new TableAdapter<CloudSyncOutboxRecord, string>('cloudSyncOutbox', 'id');
  battleConditionsSubscriptions = new TableAdapter<BattleConditionsSubscriptionRecord, string>('battleConditionsSubscriptions', 'guildId');
  battleConditionsSchedulerState = new TableAdapter<BattleConditionsSchedulerStateRecord, string>('battleConditionsSchedulerState', 'id');
  acronymOverrides = new TableAdapter<AcronymOverrideRecord, string>('acronymOverrides', 'key');
  acronymRemovals = new TableAdapter<AcronymRemovalRecord, string>('acronymRemovals', 'key');
  acronymProposals = new TableAdapter<AcronymProposalRecord, string>('acronymProposals', 'id');
}

let db: ToolsBotDb | null = null;

export function getToolsBotDb(): ToolsBotDb {
  if (!db) {
    db = new ToolsBotDb();
  }
  return db;
}

export function reminderPairId(userId: string, reminderKey: string): string {
  return `${userId}::${reminderKey}`;
}
