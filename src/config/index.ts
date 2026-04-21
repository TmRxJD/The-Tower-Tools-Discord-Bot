import path from 'node:path';
import fs from 'node:fs';
import { config as dotenvConfig } from 'dotenv';
import { z } from 'zod';

export type DeploymentMode = 'dev' | 'prod';

export interface AppConfig {
  deploymentMode: DeploymentMode;
  helpersChannelId?: string;
  discord: {
    token: string;
    clientId: string;
    guildId?: string;
  };
  ai: {
    cloudApiKey?: string;
    cloudEndpoint?: string;
    cloudReasoningModel: string;
    cloudDeepReasoningModel?: string;
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
  HELPERS_CHANNEL_ID: z.string().optional(),
  DISCORD_TOKEN: z.string().min(1).optional(),
  CLIENT_ID: z.string().min(1).optional(),
  DEV_DISCORD_TOKEN: z.string().min(1).optional(),
  DEV_CLIENT_ID: z.string().min(1).optional(),
  DEV_GUILD_ID: z.string().min(1).optional(),
  GUILD_ID: z.string().optional(),
  TRACKERAI_CLOUD_AI_ENDPOINT: z.string().url().optional(),
  TRACKERAI_CLOUD_AI_API_KEY: z.string().min(1).optional(),
  TRACKERAI_CLOUD_REASONING_MODEL: z.string().min(1).optional(),
  TRACKERAI_CLOUD_DEEP_REASONING_MODEL: z.string().min(1).optional(),
  TRACKERAI_CLOUD_FALLBACK_REASONING_MODEL: z.string().min(1).optional(),
  APPWRITE_ENDPOINT: z.string().url().optional(),
  APPWRITE_PROJECT_ID: z.string().min(1).optional(),
  APPWRITE_API_KEY: z.string().min(1).optional(),
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
});

let cachedConfig: AppConfig | null = null;

function applyDotenvFiles() {
  const mode = normalizeDeploymentMode(process.env.DEPLOYMENT_MODE ?? process.env.NODE_ENV);
  const envRoot = resolveEnvRootCandidates().find(root => hasAnyEnvFile(root, mode));
  if (envRoot) {
    loadEnvFilesFromRoot(envRoot, mode);
    return;
  }

  dotenvConfig();
}

function normalizeDeploymentMode(value: string | undefined): DeploymentMode {
  if (!value) return 'dev';
  const normalized = value.trim().toLowerCase();
  if (normalized === 'prod' || normalized === 'production') return 'prod';
  return 'dev';
}

function resolveEnvRootCandidates(): string[] {
  const cwdRoot = process.cwd();
  const runtimeRoot = path.resolve(__dirname, '..', '..');
  const explicitRoot = process.env.TOOLSBOT_ENV_DIR?.trim();

  const candidates = [
    explicitRoot,
    runtimeRoot,
    cwdRoot,
  ].filter((value): value is string => Boolean(value));

  return [...new Set(candidates.map(candidate => path.resolve(candidate)))];
}

function hasAnyEnvFile(root: string, mode: DeploymentMode): boolean {
  return [
    `.env.${mode}`,
    `.env.${mode}.local`,
    '.env',
    '.env.local',
  ].some(filename => fs.existsSync(path.resolve(root, filename)));
}

function loadEnvFilesFromRoot(root: string, mode: DeploymentMode): void {
  const modeFilenames = [`.env.${mode}`, `.env.${mode}.local`];
  const fallbackFilenames = ['.env', '.env.local'];
  const orderedFilenames = modeFilenames.some(filename => fs.existsSync(path.resolve(root, filename)))
    ? modeFilenames
    : fallbackFilenames;

  for (const filename of orderedFilenames) {
    const envPath = path.resolve(root, filename);
    if (!fs.existsSync(envPath)) {
      continue;
    }

    dotenvConfig({ path: envPath, override: true });
  }
}

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    if (value && value.trim().length > 0) {
      return value;
    }
  }
  return undefined;
}

function assertNoUnsupportedKbEnvAliases(): void {
  const unsupportedKeys = [
    'VITE_TRACKERAI_KB_STORAGE_BUCKET_ID',
    'VITE_TRACKERAI_KB_VERSION_FILE_ID',
    'VITE_TRACKERAI_KB_METADATA_FILE_ID',
    'VITE_TRACKERAI_KB_CHUNKS_FILE_ID',
    'VITE_TRACKERAI_KB_INDEX_FILE_ID',
  ].filter(key => String(process.env[key] || '').trim().length > 0);

  if (unsupportedKeys.length === 0) {
    return;
  }

  throw new Error(
    `Unsupported ToolsBot KB env aliases detected: ${unsupportedKeys.join(', ')}. Use TRACKERAI_KB_* variables only.`
  );
}

function resolveDiscordProfile(parsed: z.infer<typeof envSchema>): { token: string; clientId: string; guildId?: string } {
  if (parsed.DEPLOYMENT_MODE === 'dev') {
    return {
      token: requiredModeValue(parsed.DEV_DISCORD_TOKEN, 'DEV_DISCORD_TOKEN'),
      clientId: requiredModeValue(parsed.DEV_CLIENT_ID, 'DEV_CLIENT_ID'),
      guildId: requiredModeValue(parsed.DEV_GUILD_ID, 'DEV_GUILD_ID'),
    };
  }

  return {
    token: requiredModeValue(parsed.DISCORD_TOKEN, 'DISCORD_TOKEN'),
    clientId: requiredModeValue(parsed.CLIENT_ID, 'CLIENT_ID'),
    guildId: undefined,
  };
}

function requiredModeValue(value: string | undefined, field: string): string {
  if (value && value.trim().length > 0) {
    return value;
  }

  throw new Error(`Missing required configuration value: ${field}`);
}

export function loadConfig(): AppConfig {
  if (cachedConfig) return cachedConfig;

  applyDotenvFiles();
  assertNoUnsupportedKbEnvAliases();
  const parsed = envSchema.parse(process.env);
  const discordProfile = resolveDiscordProfile(parsed);

  cachedConfig = {
    deploymentMode: parsed.DEPLOYMENT_MODE,
    helpersChannelId: firstNonEmpty(parsed.HELPERS_CHANNEL_ID),
    discord: {
      token: discordProfile.token,
      clientId: discordProfile.clientId,
      guildId: discordProfile.guildId,
    },
    ai: {
      cloudApiKey: parsed.TRACKERAI_CLOUD_AI_API_KEY,
      cloudEndpoint: parsed.TRACKERAI_CLOUD_AI_ENDPOINT,
      cloudReasoningModel: firstNonEmpty(parsed.TRACKERAI_CLOUD_REASONING_MODEL) ?? 'qwen/qwen3-32b',
      cloudDeepReasoningModel: firstNonEmpty(parsed.TRACKERAI_CLOUD_DEEP_REASONING_MODEL),
      cloudFallbackReasoningModel: firstNonEmpty(parsed.TRACKERAI_CLOUD_FALLBACK_REASONING_MODEL),
    },
    appwrite: parsed.APPWRITE_ENDPOINT && parsed.APPWRITE_PROJECT_ID
      ? {
          endpoint: parsed.APPWRITE_ENDPOINT,
          projectId: parsed.APPWRITE_PROJECT_ID,
          apiKey: parsed.APPWRITE_API_KEY,
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
          trackerAiKbBucketId: firstNonEmpty(parsed.TRACKERAI_KB_STORAGE_BUCKET_ID) ?? 'trackerai-kb-index',
          trackerAiKbVersionFileId: firstNonEmpty(parsed.TRACKERAI_KB_VERSION_FILE_ID) ?? 'trackerai-kb-version',
          trackerAiKbMetadataFileId: firstNonEmpty(parsed.TRACKERAI_KB_METADATA_FILE_ID) ?? 'trackerai-kb-metadata',
          trackerAiKbChunksFileId: firstNonEmpty(parsed.TRACKERAI_KB_CHUNKS_FILE_ID) ?? 'trackerai-kb-chunks',
          trackerAiKbIndexFileId: firstNonEmpty(parsed.TRACKERAI_KB_INDEX_FILE_ID) ?? 'trackerai-kb-index',
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
