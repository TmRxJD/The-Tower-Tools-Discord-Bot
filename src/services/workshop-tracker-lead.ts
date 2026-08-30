import {
  parseCloudJsonBlob,
  findElsLeadFromWorkshopBlob,
  type ElsWorkshopLead,
} from '@tmrxjd/platform/tools';
import { resolveDocumentByCandidates } from '@tmrxjd/platform/node';
import { getAppConfig } from '../config';
import { getAppwriteClient } from './appwrite-client';
import { resolveCloudUserIdCandidates } from './cloud-user-resolution';
import { getToolsBotDb } from './idb';
import { logger } from '../core/logger';

const WORKSHOP_TRACKER_RECORD_ID = 'settings:workshop-tracker-v2';

async function loadLocalWorkshopTrackerBlob(userId: string): Promise<Record<string, unknown> | null> {
  try {
    const database = getToolsBotDb();
    const stableId = `${userId}::settings:${WORKSHOP_TRACKER_RECORD_ID}`;
    const row = await database.shardSplitterSettings.get(stableId)
      ?? await database.shardSplitterSettings.where('[userId+recordId]').equals([userId, WORKSHOP_TRACKER_RECORD_ID]).first();
    if (!row?.data || typeof row.data !== 'object') {
      return null;
    }
    return row.data as Record<string, unknown>;
  } catch (error) {
    logger.warn(`Failed loading local workshop tracker lead for ${userId}`, error);
    return null;
  }
}

async function loadCloudWorkshopTrackerBlob(userId: string): Promise<Record<string, unknown> | null> {
  const cfg = getAppConfig();
  if (!cfg.appwrite) {
    return null;
  }

  const client = getAppwriteClient();
  if (!client) {
    return null;
  }

  try {
    const candidates = await resolveCloudUserIdCandidates(userId);
    const resolved = await resolveDocumentByCandidates({
      databases: client.databases,
      databaseId: cfg.appwrite.cloudDatabaseId,
      collectionId: cfg.appwrite.workshopCollectionId,
      candidateDocumentIds: candidates,
    });
    const doc = resolved?.document;
    if (!doc) {
      return null;
    }

    const blob = parseCloudJsonBlob(doc.data);
    return blob;
  } catch (error) {
    logger.warn(`Failed loading cloud workshop tracker lead for ${userId}`, error);
    return null;
  }
}

export async function loadWorkshopTrackerElsLead(userId: string): Promise<ElsWorkshopLead | null> {
  const localBlob = await loadLocalWorkshopTrackerBlob(userId);
  const localLead = findElsLeadFromWorkshopBlob(localBlob);
  if (localLead) {
    return localLead;
  }

  const cloudBlob = await loadCloudWorkshopTrackerBlob(userId);
  return findElsLeadFromWorkshopBlob(cloudBlob);
}
