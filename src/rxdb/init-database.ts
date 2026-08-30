import type { RxCollection, RxDatabase, RxJsonSchema } from 'rxdb';
import { createRxDatabase } from 'rxdb/plugins/core';
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie';
import {
  toolsLabSettingsRxJsonSchema,
  toolsSharedUserSettingsRxJsonSchema,
  type ToolsUserStateDocument,
  type ToolsUserStateRxJsonSchema,
} from '@tmrxjd/platform/tools';
import { buildTrackerRunRxDatabaseName, ensureTrackerRunNodeRxDBStorage } from '@tmrxjd/platform/node';

const RXDB_SCOPE_PREFIX = 'tools_bot_rxdb';

export type ToolsSharedUserSettingsRxCollection = RxCollection<ToolsUserStateDocument>;
export type ToolsLabSettingsRxCollection = RxCollection<ToolsUserStateDocument>;

export type ToolsUserStateRxDatabase = RxDatabase<{
  shared_user_settings: ToolsSharedUserSettingsRxCollection;
  lab_settings: ToolsLabSettingsRxCollection;
}>;

let nodeStorageReady = false;

function ensureToolsUserStateNodeStorage(): void {
  if (nodeStorageReady) return;
  ensureTrackerRunNodeRxDBStorage({ dbFileName: 'tools-bot-user-state-rxdb.sqlite' });
  nodeStorageReady = true;
}

function asRxJsonSchema(schema: ToolsUserStateRxJsonSchema): RxJsonSchema<ToolsUserStateDocument> {
  return schema as RxJsonSchema<ToolsUserStateDocument>;
}

export async function initToolsUserStateRxDatabase(scopeId: string): Promise<ToolsUserStateRxDatabase> {
  ensureToolsUserStateNodeStorage();

  const db = await createRxDatabase({
    name: buildTrackerRunRxDatabaseName(RXDB_SCOPE_PREFIX, scopeId),
    storage: getRxStorageDexie(),
    ignoreDuplicate: true,
  }) as ToolsUserStateRxDatabase;

  await db.addCollections({
    shared_user_settings: {
      schema: asRxJsonSchema(toolsSharedUserSettingsRxJsonSchema),
    },
    lab_settings: {
      schema: asRxJsonSchema(toolsLabSettingsRxJsonSchema),
    },
  });

  return db;
}
