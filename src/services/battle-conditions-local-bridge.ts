import fs from 'node:fs';
import path from 'node:path';
import {
  battleConditionsAppwriteDocumentSchema,
  battleConditionsMessageDataSchema,
  getBattleConditionsRankConfig,
  type BattleConditionsMessageData,
  type BattleConditionsRank,
} from '@tmrxjd/platform/tools';
import sqlite3 from 'sqlite3';

export interface LocalBridgeBattleConditionsRecord extends BattleConditionsMessageData {
  id: string;
}

type BridgeQueryOptions = {
  sqlitePath?: string;
};

type SqliteBattleConditionsRow = {
  id: string;
  document: string;
  createdAt: number | null;
  updatedAt: number | null;
};

function getProjectRoot(): string {
  return path.resolve(__dirname, '../..');
}

function getDefaultSqliteCandidates(): string[] {
  const projectRoot = getProjectRoot();
  return [
    path.resolve(projectRoot, '..', '..', 'TowerModBot', 'The-Tower-Discord-Mod-Bot', 'data', 'appwrite_backup.sqlite'),
    path.resolve(projectRoot, '..', 'The-Tower-Discord-Mod-Bot', 'data', 'appwrite_backup.sqlite'),
    path.resolve(projectRoot, '..', '..', 'The-Tower-Discord-Mod-Bot', 'data', 'appwrite_backup.sqlite'),
  ];
}

function resolveSqlitePath(options?: BridgeQueryOptions): string | null {
  if (options?.sqlitePath) {
    return fs.existsSync(options.sqlitePath) ? options.sqlitePath : null;
  }

  for (const candidate of getDefaultSqliteCandidates()) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function openReadOnlyDatabase(sqlitePath: string): Promise<sqlite3.Database> {
  return new Promise((resolvePromise, reject) => {
    const db = new sqlite3.Database(sqlitePath, sqlite3.OPEN_READONLY, error => {
      if (error) {
        reject(error);
        return;
      }

      resolvePromise(db);
    });
  });
}

function closeDatabase(db: sqlite3.Database): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    db.close(error => {
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

function isMissingTableError(error: unknown): boolean {
  const message = (error as { message?: string } | null | undefined)?.message ?? '';
  return typeof message === 'string' && message.toLowerCase().includes('no such table');
}

function getCollectionTable(rank: BattleConditionsRank): string {
  return getBattleConditionsRankConfig(rank).collectionId;
}

function mapRow(rank: BattleConditionsRank, row: SqliteBattleConditionsRow): LocalBridgeBattleConditionsRecord {
  const rawDocument = JSON.parse(row.document) as Record<string, unknown>;
  const parsed = battleConditionsAppwriteDocumentSchema.parse({
    ...rawDocument,
    $id: typeof rawDocument.$id === 'string' ? rawDocument.$id : row.id,
    id: typeof rawDocument.id === 'string' ? rawDocument.id : row.id,
    createdAt: rawDocument.createdAt ?? row.createdAt ?? undefined,
    updatedAt: rawDocument.updatedAt ?? row.updatedAt ?? undefined,
  });

  const data = battleConditionsMessageDataSchema.parse({
    title: parsed.title,
    description: parsed.description,
    rawText: parsed.rawText,
    tournamentDate: parsed.tournamentDate,
    tournamentTimestamp: parsed.tournamentTimestamp,
    conditions: parsed.conditions,
    versionText: parsed.versionText,
    color: parsed.color,
    sourceMessageId: parsed.sourceMessageId,
    sourceChannelId: parsed.sourceChannelId,
    sourceGuildId: parsed.sourceGuildId,
    sourceMessageUrl: parsed.sourceMessageUrl,
    sourceMessageCreatedAt: parsed.sourceMessageCreatedAt,
    sourceMessageUpdatedAt: parsed.sourceMessageUpdatedAt,
    createdAt: parsed.createdAt,
    updatedAt: parsed.updatedAt,
    rank,
  });

  return {
    id: parsed.$id ?? parsed.id ?? parsed.tournamentDate,
    ...data,
  };
}

async function withBridgeDatabase<T>(
  options: BridgeQueryOptions | undefined,
  runQuery: (db: sqlite3.Database) => Promise<T>,
  fallbackValue: T,
): Promise<T> {
  const sqlitePath = resolveSqlitePath(options);
  if (!sqlitePath) {
    return fallbackValue;
  }

  const db = await openReadOnlyDatabase(sqlitePath);
  try {
    return await runQuery(db);
  } catch (error) {
    if (isMissingTableError(error)) {
      return fallbackValue;
    }

    throw error;
  } finally {
    await closeDatabase(db).catch(() => {});
  }
}

export async function getLatestBattleConditionsFromLocalBridge(
  rank: BattleConditionsRank,
  options?: BridgeQueryOptions,
): Promise<LocalBridgeBattleConditionsRecord | null> {
  const table = getCollectionTable(rank);
  return withBridgeDatabase(options, async db => {
    const row = await getSqlRow<SqliteBattleConditionsRow>(
      db,
      `SELECT id, document, createdAt, updatedAt FROM ${table} ORDER BY updatedAt DESC, createdAt DESC LIMIT 1`,
    );
    return row ? mapRow(rank, row) : null;
  }, null);
}

export async function getBattleConditionsByDateFromLocalBridge(
  rank: BattleConditionsRank,
  tournamentDate: string,
  options?: BridgeQueryOptions,
): Promise<LocalBridgeBattleConditionsRecord | null> {
  const table = getCollectionTable(rank);
  return withBridgeDatabase(options, async db => {
    const row = await getSqlRow<SqliteBattleConditionsRow>(
      db,
      `SELECT id, document, createdAt, updatedAt FROM ${table} WHERE id = ? LIMIT 1`,
      [tournamentDate],
    );
    return row ? mapRow(rank, row) : null;
  }, null);
}

export async function listRecentBattleConditionsFromLocalBridge(
  rank: BattleConditionsRank,
  limit = 25,
  options?: BridgeQueryOptions,
): Promise<LocalBridgeBattleConditionsRecord[]> {
  const table = getCollectionTable(rank);
  return withBridgeDatabase(options, async db => {
    const rows = await allSqlRows<SqliteBattleConditionsRow>(
      db,
      `SELECT id, document, createdAt, updatedAt FROM ${table} ORDER BY updatedAt DESC, createdAt DESC LIMIT ?`,
      [limit],
    );
    return rows.map(row => mapRow(rank, row));
  }, []);
}