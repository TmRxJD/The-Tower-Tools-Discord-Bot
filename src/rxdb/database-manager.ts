import type { ToolsUserStateRxDatabase } from './init-database';
import { initToolsUserStateRxDatabase } from './init-database';

const databaseByScope = new Map<string, ToolsUserStateRxDatabase>();
const initPromiseByScope = new Map<string, Promise<ToolsUserStateRxDatabase>>();

export async function getOrInitToolsUserStateRxDatabase(scopeId: string): Promise<ToolsUserStateRxDatabase> {
  const normalizedScope = scopeId.trim();
  if (!normalizedScope) {
    throw new Error('Tools user-state RxDB scope id is required.');
  }

  const cached = databaseByScope.get(normalizedScope);
  if (cached) {
    return cached;
  }

  const inFlight = initPromiseByScope.get(normalizedScope);
  if (inFlight) {
    return inFlight;
  }

  const initPromise = initToolsUserStateRxDatabase(normalizedScope).then((db) => {
    databaseByScope.set(normalizedScope, db);
    initPromiseByScope.delete(normalizedScope);
    return db;
  }).catch((error) => {
    initPromiseByScope.delete(normalizedScope);
    throw error;
  });

  initPromiseByScope.set(normalizedScope, initPromise);
  return initPromise;
}

export function getActiveToolsUserStateRxDatabase(scopeId: string): ToolsUserStateRxDatabase | null {
  return databaseByScope.get(scopeId.trim()) ?? null;
}
