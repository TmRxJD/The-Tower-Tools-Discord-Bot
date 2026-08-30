import {
  battleConditionsAppwriteDocumentSchema,
  battleConditionsDatabaseId,
  battleConditionsMessageDataSchema,
  getBattleConditionsRankConfig,
  type BattleConditionsMessageData,
  type BattleConditionsRank,
} from '@tmrxjd/platform/tools';
import { Query } from 'node-appwrite';
import { logger } from '../core/logger';
import { getAppwriteClient } from './appwrite-client';
import {
  getBattleConditionsByDateFromLocalBridge,
  getLatestBattleConditionsFromLocalBridge,
  listRecentBattleConditionsFromLocalBridge,
} from './battle-conditions-local-bridge';

export interface BattleConditionsRecord extends BattleConditionsMessageData {
  id: string;
}

let hasLoggedLocalBridgeFallback = false;

function mapDocument(rank: BattleConditionsRank, document: unknown): BattleConditionsRecord {
  const parsed = battleConditionsAppwriteDocumentSchema.parse(document);
  const id = parsed.$id ?? parsed.id ?? parsed.tournamentDate;
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
    id,
    ...data,
  };
}

function getCollectionId(rank: BattleConditionsRank): string {
  return getBattleConditionsRankConfig(rank).collectionId;
}

function isBattleConditionsCloudUnavailableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const typed = error as { code?: unknown; status?: unknown; type?: unknown; message?: unknown };
  const code = typeof typed.code === 'number'
    ? typed.code
    : typeof typed.status === 'number'
      ? typed.status
      : null;
  const type = typeof typed.type === 'string' ? typed.type.toLowerCase() : '';
  const message = typeof typed.message === 'string' ? typed.message.toLowerCase() : '';

  if (code === 401 || code === 403 || code === 404 || code === 408 || code === 429) {
    return true;
  }

  if (typeof code === 'number' && code >= 500) {
    return true;
  }

  return type.includes('unauthorized')
    || type.includes('forbidden')
    || type.includes('not_found')
    || message.includes('not authorized')
    || message.includes('timed out')
    || message.includes('econnrefused')
    || message.includes('enotfound');
}

function logLocalBridgeFallback(reason: 'missing-client' | 'cloud-error', detail?: unknown): void {
  if (hasLoggedLocalBridgeFallback) {
    return;
  }

  hasLoggedLocalBridgeFallback = true;
  logger.warn('Falling back to the ModBot local battle conditions bridge.', {
    reason,
    detail,
  });
}

export async function getLatestBattleConditions(rank: BattleConditionsRank): Promise<BattleConditionsRecord | null> {
  const client = getAppwriteClient();
  if (!client) {
    logLocalBridgeFallback('missing-client');
    return getLatestBattleConditionsFromLocalBridge(rank);
  }

  try {
    const response = await client.databases.listDocuments(
      battleConditionsDatabaseId,
      getCollectionId(rank),
      [Query.orderDesc('tournamentTimestamp'), Query.limit(1)],
    );
    const document = response.documents[0];
    return document ? mapDocument(rank, document) : null;
  } catch (error) {
    if (!isBattleConditionsCloudUnavailableError(error)) {
      throw error;
    }

    logLocalBridgeFallback('cloud-error', error);
    return getLatestBattleConditionsFromLocalBridge(rank);
  }
}

export async function getBattleConditionsByDate(rank: BattleConditionsRank, tournamentDate: string): Promise<BattleConditionsRecord | null> {
  const client = getAppwriteClient();
  if (!client) {
    logLocalBridgeFallback('missing-client');
    return getBattleConditionsByDateFromLocalBridge(rank, tournamentDate);
  }

  try {
    const document = await client.databases.getDocument(
      battleConditionsDatabaseId,
      getCollectionId(rank),
      tournamentDate,
    );
    return mapDocument(rank, document);
  } catch (error) {
    if (!isBattleConditionsCloudUnavailableError(error)) {
      return null;
    }

    logLocalBridgeFallback('cloud-error', error);
    return getBattleConditionsByDateFromLocalBridge(rank, tournamentDate);
  }
}

export async function listRecentBattleConditions(rank: BattleConditionsRank, limit = 25): Promise<BattleConditionsRecord[]> {
  const client = getAppwriteClient();
  if (!client) {
    logLocalBridgeFallback('missing-client');
    return listRecentBattleConditionsFromLocalBridge(rank, limit);
  }

  try {
    const response = await client.databases.listDocuments(
      battleConditionsDatabaseId,
      getCollectionId(rank),
      [Query.orderDesc('tournamentTimestamp'), Query.limit(limit)],
    );

    return response.documents.map(document => mapDocument(rank, document));
  } catch (error) {
    if (!isBattleConditionsCloudUnavailableError(error)) {
      throw error;
    }

    logLocalBridgeFallback('cloud-error', error);
    return listRecentBattleConditionsFromLocalBridge(rank, limit);
  }
}