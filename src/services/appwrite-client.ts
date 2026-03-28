import { Client, Databases, Storage } from 'node-appwrite';
import { createAppwriteClientBundle, resolveAppwriteCredential } from '@tmrxjd/platform/node';
import { getAppConfig } from '../config';
import { logger } from '../core/logger';

type AppwriteClientBundle = {
  client: Client;
  databases: Databases;
  storage: Storage;
};

let cachedBundle: AppwriteClientBundle | null = null;
let hasLoggedMissingConfig = false;
let hasLoggedMissingCredential = false;

export function getAppwriteClient(): AppwriteClientBundle | null {
  if (cachedBundle) {
    return cachedBundle;
  }

  const cfg = getAppConfig();
  if (!cfg.appwrite) {
    if (!hasLoggedMissingConfig) {
      logger.warn('Appwrite is not configured for ToolsBot; shard cloud sync is disabled.');
      hasLoggedMissingConfig = true;
    }
    return null;
  }

  const credential = resolveAppwriteCredential({
    apiKey: cfg.appwrite.apiKey,
  });
  if (credential.kind === 'none') {
    if (!hasLoggedMissingCredential) {
      logger.warn('No Appwrite API key configured for ToolsBot; shard cloud sync is disabled.');
      hasLoggedMissingCredential = true;
    }
    return null;
  }

  const bundle = createAppwriteClientBundle({
    client: new Client(),
    endpoint: cfg.appwrite.endpoint,
    projectId: cfg.appwrite.projectId,
    credential,
    createDatabases: client => new Databases(client),
    createStorage: client => new Storage(client),
  });

  cachedBundle = {
    client: bundle.client,
    databases: bundle.databases,
    storage: bundle.storage,
  };

  return cachedBundle;
}
