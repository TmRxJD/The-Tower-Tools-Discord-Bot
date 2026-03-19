import path from 'node:path';
import fs from 'node:fs';
import { config as dotenvConfig } from 'dotenv';
import { z } from 'zod';

export type DeploymentMode = 'dev' | 'prod';

export interface AppConfig {
  deploymentMode: DeploymentMode;
  discord: {
    token: string;
    clientId: string;
    guildId?: string;
  };
  ai: {
    cloudApiKey?: string;
    cloudEndpoint?: string;
    cloudReasoningModel: string;
    cloudFallbackReasoningModel?: string;
  };
  appwrite: {
    endpoint: string;
    projectId: string;
    apiKey?: string;
    cloudDatabaseId: string;
    settingsDatabaseId: string;
    settingsCollectionId: string;
    modulesCollectionId: string;
    labsCollectionId: string;
    botsCollectionId: string;
    workshopCollectionId: string;
    chartCollectionId: string;
    stoneCollectionId: string;
    thornsCollectionId: string;
    remindCollectionId: string;
    checklistCollectionId: string;
    trackerAiKbBucketId?: string;
    trackerAiKbVersionFileId?: string;
    trackerAiKbMetadataFileId?: string;
    trackerAiKbChunksFileId?: string;
    trackerAiKbIndexFileId?: string;
  } | null;
}

const envSchema = z.object({
  DEPLOYMENT_MODE: z.enum(['dev', 'prod']).default('dev'),
  DISCORD_TOKEN: z.string().min(1),
  CLIENT_ID: z.string().min(1),
  GUILD_ID: z.string().optional(),
  TRACKERAI_CLOUD_AI_ENDPOINT: z.string().url().optional(),
  TRACKERAI_CLOUD_AI_API_KEY: z.string().min(1).optional(),
  TRACKERAI_CLOUD_REASONING_MODEL: z.string().min(1).optional(),
  TRACKERAI_CLOUD_FALLBACK_REASONING_MODEL: z.string().min(1).optional(),
  APPWRITE_ENDPOINT: z.string().url().optional(),
  APPWRITE_PROJECT_ID: z.string().min(1).optional(),
  APPWRITE_API_KEY: z.string().min(1).optional(),
  APPWRITE_FUNCTION_API_KEY: z.string().min(1).optional(),
  APPWRITE_KEY: z.string().min(1).optional(),
  APPWRITE_CLOUD_DATABASE_ID: z.string().min(1).optional(),
  APPWRITE_SETTINGS_DATABASE_ID: z.string().min(1).optional(),
  APPWRITE_SETTINGS_COLLECTION_ID: z.string().min(1).optional(),
  APPWRITE_MODULES_COLLECTION_ID: z.string().min(1).optional(),
  APPWRITE_LABS_COLLECTION_ID: z.string().min(1).optional(),
  APPWRITE_BOTS_COLLECTION_ID: z.string().min(1).optional(),
  APPWRITE_WORKSHOP_COLLECTION_ID: z.string().min(1).optional(),
  APPWRITE_CHART_COLLECTION_ID: z.string().min(1).optional(),
  APPWRITE_STONE_COLLECTION_ID: z.string().min(1).optional(),
  APPWRITE_THORNS_COLLECTION_ID: z.string().min(1).optional(),
  APPWRITE_REMIND_COLLECTION_ID: z.string().min(1).optional(),
  APPWRITE_CHECKLIST_COLLECTION_ID: z.string().min(1).optional(),
  TRACKERAI_KB_STORAGE_BUCKET_ID: z.string().min(1).optional(),
  TRACKERAI_KB_VERSION_FILE_ID: z.string().min(1).optional(),
  TRACKERAI_KB_METADATA_FILE_ID: z.string().min(1).optional(),
  TRACKERAI_KB_CHUNKS_FILE_ID: z.string().min(1).optional(),
  TRACKERAI_KB_INDEX_FILE_ID: z.string().min(1).optional(),
  VITE_TRACKERAI_KB_STORAGE_BUCKET_ID: z.string().min(1).optional(),
  VITE_TRACKERAI_KB_VERSION_FILE_ID: z.string().min(1).optional(),
  VITE_TRACKERAI_KB_METADATA_FILE_ID: z.string().min(1).optional(),
  VITE_TRACKERAI_KB_CHUNKS_FILE_ID: z.string().min(1).optional(),
  VITE_TRACKERAI_KB_INDEX_FILE_ID: z.string().min(1).optional(),
});

let cachedConfig: AppConfig | null = null;

function applyDotenvFiles() {
  const mode = (process.env.DEPLOYMENT_MODE as DeploymentMode | undefined) ?? 'dev';
  const envFilename = mode === 'prod' ? '.env.prod' : '.env.dev';
  const envPath = path.resolve(process.cwd(), envFilename);
  if (fs.existsSync(envPath)) {
    dotenvConfig({ path: envPath });
  }
  dotenvConfig();
}

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    if (value && value.trim().length > 0) {
      return value;
    }
  }
  return undefined;
}

export function loadConfig(): AppConfig {
  if (cachedConfig) return cachedConfig;

  applyDotenvFiles();
  const parsed = envSchema.parse(process.env);

  cachedConfig = {
    deploymentMode: parsed.DEPLOYMENT_MODE,
    discord: {
      token: parsed.DISCORD_TOKEN,
      clientId: parsed.CLIENT_ID,
      guildId: parsed.GUILD_ID,
    },
    ai: {
      cloudApiKey: parsed.TRACKERAI_CLOUD_AI_API_KEY,
      cloudEndpoint: parsed.TRACKERAI_CLOUD_AI_ENDPOINT,
      cloudReasoningModel: firstNonEmpty(parsed.TRACKERAI_CLOUD_REASONING_MODEL) ?? 'qwen/qwen3-32b',
      cloudFallbackReasoningModel: firstNonEmpty(parsed.TRACKERAI_CLOUD_FALLBACK_REASONING_MODEL),
    },
    appwrite: parsed.APPWRITE_ENDPOINT && parsed.APPWRITE_PROJECT_ID
      ? {
          endpoint: parsed.APPWRITE_ENDPOINT,
          projectId: parsed.APPWRITE_PROJECT_ID,
          apiKey: parsed.APPWRITE_API_KEY ?? parsed.APPWRITE_FUNCTION_API_KEY ?? parsed.APPWRITE_KEY,
          cloudDatabaseId: parsed.APPWRITE_CLOUD_DATABASE_ID ?? 'cloud-saves',
          settingsDatabaseId: parsed.APPWRITE_SETTINGS_DATABASE_ID ?? 'run-tracker-data',
          settingsCollectionId: parsed.APPWRITE_SETTINGS_COLLECTION_ID ?? 'settings',
          modulesCollectionId: parsed.APPWRITE_MODULES_COLLECTION_ID ?? 'tracker_modules',
          labsCollectionId: parsed.APPWRITE_LABS_COLLECTION_ID ?? 'tracker_labs',
          botsCollectionId: parsed.APPWRITE_BOTS_COLLECTION_ID ?? 'tracker_bots',
          workshopCollectionId: parsed.APPWRITE_WORKSHOP_COLLECTION_ID ?? 'tracker_workshop',
          chartCollectionId: parsed.APPWRITE_CHART_COLLECTION_ID ?? 'tracker_chart',
          stoneCollectionId: parsed.APPWRITE_STONE_COLLECTION_ID ?? 'tracker_uw',
          thornsCollectionId: parsed.APPWRITE_THORNS_COLLECTION_ID ?? 'tracker_thorns',
          remindCollectionId: parsed.APPWRITE_REMIND_COLLECTION_ID ?? 'tracker_remind',
          checklistCollectionId: parsed.APPWRITE_CHECKLIST_COLLECTION_ID ?? 'tracker_checklist',
          trackerAiKbBucketId: firstNonEmpty(parsed.TRACKERAI_KB_STORAGE_BUCKET_ID, parsed.VITE_TRACKERAI_KB_STORAGE_BUCKET_ID) ?? 'trackerai-kb-index',
          trackerAiKbVersionFileId: firstNonEmpty(parsed.TRACKERAI_KB_VERSION_FILE_ID, parsed.VITE_TRACKERAI_KB_VERSION_FILE_ID) ?? 'trackerai-kb-version',
          trackerAiKbMetadataFileId: firstNonEmpty(parsed.TRACKERAI_KB_METADATA_FILE_ID, parsed.VITE_TRACKERAI_KB_METADATA_FILE_ID) ?? 'trackerai-kb-metadata',
          trackerAiKbChunksFileId: firstNonEmpty(parsed.TRACKERAI_KB_CHUNKS_FILE_ID, parsed.VITE_TRACKERAI_KB_CHUNKS_FILE_ID) ?? 'trackerai-kb-chunks',
          trackerAiKbIndexFileId: firstNonEmpty(parsed.TRACKERAI_KB_INDEX_FILE_ID, parsed.VITE_TRACKERAI_KB_INDEX_FILE_ID) ?? 'trackerai-kb-index',
        }
      : null,
  };

  return cachedConfig;
}

export function getAppConfig(): AppConfig {
  if (!cachedConfig) return loadConfig();
  return cachedConfig;
}

export function resetConfig(): void {
  cachedConfig = null;
}

export {
  defaultBotConfig,
  getBotConfig,
  resetBotConfig,
  type ToolsBotConfig,
} from './bot-config';
