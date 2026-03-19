import fs from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import type { TrackerAiKbArtifactBundle } from '@tmrxjd/platform/node';
import { getAppConfig } from '../config';
import { logger } from '../core/logger';
import { getAppwriteClient } from './appwrite-client';

type EmbeddingProviderId = 'gte-small' | 'gte-base';

type TrackerAiKbArtifactConfig = {
  bucketId: string;
  versionFileId: string;
  metadataFileId: string;
  chunksFileId: string;
  indexFileId: string;
};

type PublishedTrackerAiKbArtifactBundle = TrackerAiKbArtifactBundle & {
  cacheSource: 'published-appwrite';
  artifactFileId: string;
};

const KB_PROVIDER: EmbeddingProviderId = 'gte-small';
const CACHE_DIR = path.resolve(process.cwd(), '.cache', 'trackerai-kb');
const CACHE_FILE = path.join(CACHE_DIR, `${KB_PROVIDER}.bundle.json`);
const REMOTE_VERSION_TTL_MS = 60_000;

let cachedBundle: PublishedTrackerAiKbArtifactBundle | null = null;
let lastRemoteVersionCheckAtMs = 0;

function readTrackerAiKbArtifactConfig(): TrackerAiKbArtifactConfig | null {
  const cfg = getAppConfig().appwrite;
  if (!cfg) return null;

  const bucketId = String(cfg.trackerAiKbBucketId || '').trim();
  const versionFileId = String(cfg.trackerAiKbVersionFileId || '').trim();
  const metadataFileId = String(cfg.trackerAiKbMetadataFileId || '').trim();
  const chunksFileId = String(cfg.trackerAiKbChunksFileId || '').trim();
  const indexFileId = String(cfg.trackerAiKbIndexFileId || '').trim();

  if (!bucketId || !versionFileId || !metadataFileId || !chunksFileId || !indexFileId) {
    return null;
  }

  return {
    bucketId,
    versionFileId,
    metadataFileId,
    chunksFileId,
    indexFileId,
  };
}

function buildVariantArtifactConfig(
  config: TrackerAiKbArtifactConfig,
  provider: EmbeddingProviderId,
): TrackerAiKbArtifactConfig {
  const suffix = `-${provider}`;
  return {
    bucketId: config.bucketId,
    versionFileId: `${config.versionFileId}${suffix}`,
    metadataFileId: `${config.metadataFileId}${suffix}`,
    chunksFileId: `${config.chunksFileId}${suffix}`,
    indexFileId: `${config.indexFileId}${suffix}`,
  };
}

function isTrackerAiKbArtifactBundle(value: unknown): value is PublishedTrackerAiKbArtifactBundle {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return record.contractVersion === 'trackerai-kb-artifact-cache-v1'
    && typeof record.version === 'string'
    && typeof record.syncedAtIso === 'string'
    && record.cacheSource === 'published-appwrite'
    && typeof record.artifactFileId === 'string';
}

async function ensureCacheDir(): Promise<void> {
  await fs.mkdir(CACHE_DIR, { recursive: true });
}

async function readCachedBundleFromDisk(): Promise<PublishedTrackerAiKbArtifactBundle | null> {
  try {
    const raw = await fs.readFile(CACHE_FILE, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    return isTrackerAiKbArtifactBundle(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function writeCachedBundleToDisk(bundle: PublishedTrackerAiKbArtifactBundle): Promise<void> {
  await ensureCacheDir();
  await fs.writeFile(CACHE_FILE, JSON.stringify(bundle), 'utf8');
}

function decodeDownloadPayload(download: unknown): string {
  if (typeof download === 'string') {
    return download;
  }

  if (download && typeof download === 'object' && !ArrayBuffer.isView(download) && !(download instanceof ArrayBuffer)) {
    return JSON.stringify(download);
  }

  if (download instanceof ArrayBuffer) {
    const buffer = Buffer.from(download);
    return decodeBinaryPayload(buffer);
  }

  if (Buffer.isBuffer(download) || download instanceof Uint8Array) {
    return decodeBinaryPayload(Buffer.from(download));
  }

  if (download && typeof download === 'object' && 'buffer' in download && typeof (download as { buffer?: unknown }).buffer === 'object') {
    return decodeBinaryPayload(Buffer.from((download as { buffer: ArrayBuffer }).buffer));
  }

  throw new Error('Unsupported TrackerAI KB artifact payload type.');
}

function decodeBinaryPayload(buffer: Buffer): string {
  const isGzip = buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b;
  const bytes = isGzip ? gunzipSync(buffer) : buffer;
  return bytes.toString('utf8');
}

async function readStorageFileText(config: TrackerAiKbArtifactConfig, fileId: string): Promise<string> {
  const client = getAppwriteClient();
  if (!client) {
    throw new Error('Appwrite client is not configured for TrackerAI KB artifact access.');
  }

  const download = await client.storage.getFileDownload(config.bucketId, fileId);
  return decodeDownloadPayload(download);
}

async function readStorageFileJson(config: TrackerAiKbArtifactConfig, fileId: string): Promise<unknown> {
  return JSON.parse(await readStorageFileText(config, fileId));
}

async function loadRemoteBundle(config: TrackerAiKbArtifactConfig): Promise<PublishedTrackerAiKbArtifactBundle> {
  const remoteVersion = (await readStorageFileText(config, config.versionFileId)).trim();
  if (!remoteVersion) {
    throw new Error('TrackerAI KB version file was empty.');
  }

  const [metadata, chunks, index] = await Promise.all([
    readStorageFileJson(config, config.metadataFileId),
    readStorageFileJson(config, config.chunksFileId),
    readStorageFileJson(config, config.indexFileId),
  ]);

  return {
    contractVersion: 'trackerai-kb-artifact-cache-v1',
    version: remoteVersion,
    metadata,
    chunks,
    index,
    syncedAtIso: new Date().toISOString(),
    cacheSource: 'published-appwrite',
    artifactFileId: config.indexFileId,
  };
}

async function tryLoadRemoteBundle(
  config: TrackerAiKbArtifactConfig,
  options?: { forceRefresh?: boolean },
): Promise<PublishedTrackerAiKbArtifactBundle | null> {
  const remoteVersion = (await readStorageFileText(config, config.versionFileId)).trim();
  if (!remoteVersion) {
    throw new Error('TrackerAI KB version file was empty.');
  }

  if (!options?.forceRefresh && cachedBundle?.version === remoteVersion) {
    return cachedBundle;
  }

  return await loadRemoteBundle(config);
}

export async function loadTrackerAiKbArtifactBundle(forceRefresh = false): Promise<TrackerAiKbArtifactBundle | null> {
  if (!cachedBundle) {
    cachedBundle = await readCachedBundleFromDisk();
  }

  const config = readTrackerAiKbArtifactConfig();
  if (!config) {
    return cachedBundle;
  }

  const now = Date.now();
  if (!forceRefresh && cachedBundle && now - lastRemoteVersionCheckAtMs < REMOTE_VERSION_TTL_MS) {
    return cachedBundle;
  }

  try {
    lastRemoteVersionCheckAtMs = now;
    const publishedConfig = buildVariantArtifactConfig(config, KB_PROVIDER);
    const nextBundle = await tryLoadRemoteBundle(publishedConfig, { forceRefresh });
    if (!nextBundle) {
      throw new Error('TrackerAI KB published artifact bundle was unavailable.');
    }

    cachedBundle = nextBundle;
    await writeCachedBundleToDisk(nextBundle);
    logger.info('TrackerAI KB artifact bundle refreshed from published Appwrite artifact.', {
      version: nextBundle.version,
      embeddingModel: (nextBundle.index as { embeddingModel?: unknown })?.embeddingModel || null,
      fileId: publishedConfig.indexFileId,
    });
    return nextBundle;
  } catch (error) {
    if (cachedBundle) {
      logger.warn('Using cached TrackerAI KB artifact bundle after published Appwrite sync failure.', error);
      return cachedBundle;
    }

    logger.warn('TrackerAI KB artifact bundle sync failed and no cache is available.', error);
    return null;
  }
}