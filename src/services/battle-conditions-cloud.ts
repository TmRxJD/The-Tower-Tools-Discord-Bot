import {
  battleConditionsAppwriteDocumentSchema,
  battleConditionsDatabaseId,
  battleConditionsMessageDataSchema,
  getBattleConditionsRankConfig,
  type BattleConditionsMessageData,
  type BattleConditionsRank,
} from '@tmrxjd/platform/tools';
import { Query } from 'node-appwrite';
import { getAppwriteClient } from './appwrite-client';

export interface BattleConditionsRecord extends BattleConditionsMessageData {
  id: string;
}

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

export async function getLatestBattleConditions(rank: BattleConditionsRank): Promise<BattleConditionsRecord | null> {
  const client = getAppwriteClient();
  if (!client) {
    return null;
  }

  const response = await client.databases.listDocuments(
    battleConditionsDatabaseId,
    getCollectionId(rank),
    [Query.orderDesc('tournamentTimestamp'), Query.limit(1)],
  );
  const document = response.documents[0];
  return document ? mapDocument(rank, document) : null;
}

export async function getBattleConditionsByDate(rank: BattleConditionsRank, tournamentDate: string): Promise<BattleConditionsRecord | null> {
  const client = getAppwriteClient();
  if (!client) {
    return null;
  }

  try {
    const document = await client.databases.getDocument(
      battleConditionsDatabaseId,
      getCollectionId(rank),
      tournamentDate,
    );
    return mapDocument(rank, document);
  } catch {
    return null;
  }
}

export async function listRecentBattleConditions(rank: BattleConditionsRank, limit = 25): Promise<BattleConditionsRecord[]> {
  const client = getAppwriteClient();
  if (!client) {
    return [];
  }

  const response = await client.databases.listDocuments(
    battleConditionsDatabaseId,
    getCollectionId(rank),
    [Query.orderDesc('tournamentTimestamp'), Query.limit(limit)],
  );

  return response.documents.map(document => mapDocument(rank, document));
}