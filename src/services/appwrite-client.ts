import { Client, Databases, Storage } from 'node-appwrite';
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

  const client = new Client()
    .setEndpoint(cfg.appwrite.endpoint)
    .setProject(cfg.appwrite.projectId);

  const apiKey = cfg.appwrite.apiKey?.trim();
  if (apiKey) {
    client.setKey(apiKey);
  } else if (!hasLoggedMissingCredential) {
    logger.warn('No Appwrite API key configured for ToolsBot; shard cloud sync is disabled.');
    hasLoggedMissingCredential = true;
    return null;
  }

  cachedBundle = {
    client,
    databases: new Databases(client),
    storage: new Storage(client),
  };

  return cachedBundle;
}
