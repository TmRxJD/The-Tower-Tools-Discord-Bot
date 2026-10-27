import type { ToolsUserStateRxDatabase } from './init-database';
import { initToolsUserStateRxDatabase } from './init-database';

// Documents already use userId as their primary key. Two shared collections avoid
// retaining two collections for every user (and exhausting RxDB's collection cap).
const SHARED_SCOPE = 'shared_user_state';
let database: ToolsUserStateRxDatabase | null = null;
let initializing: Promise<ToolsUserStateRxDatabase> | null = null;

export function getToolsUserStateDatabaseCounts(): { open: number; initializing: number } {
  return { open: database ? 1 : 0, initializing: initializing ? 1 : 0 };
}

export async function getOrInitToolsUserStateRxDatabase(scopeId: string): Promise<ToolsUserStateRxDatabase> {
  const normalizedScope = scopeId.trim();
  if (!normalizedScope) {
    throw new Error('Tools user-state RxDB scope id is required.');
  }

  if (database) return database;
  if (!initializing) {
    initializing = initToolsUserStateRxDatabase(SHARED_SCOPE).then(db => {
      database = db;
      return db;
    }).finally(() => { initializing = null; });
  }
  return initializing;
}

export function getActiveToolsUserStateRxDatabase(scopeId: string): ToolsUserStateRxDatabase | null {
  return scopeId.trim() ? database : null;
}
