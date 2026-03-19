import { getAppConfig } from '../config';
import { logger } from '../core/logger';
import { getAppwriteClient } from './appwrite-client';
import { resolveCloudUserIdCandidates } from './cloud-user-resolution';
import {
  createCloudJsonBlobPayload,
  findFirstResolvedCloudDocument,
  isCloudNotFoundError,
  parseCloudJsonBlob,
  parseIsoTimestampToMillis,
  toObjectRecord,
} from '@tmrxjd/platform/tools';

export type CloudReminderState = {
  toggles: Record<string, boolean>;
  paused: boolean;
  updatedAt: number | null;
};

export type CloudChecklistState = {
  labels: Array<string | null>;
  tasks: boolean[];
  updatedAt: number | null;
};

async function getCollectionDocumentOrNull(userId: string, collectionId: string): Promise<Record<string, unknown> | null> {
  const cfg = getAppConfig();
  if (!cfg.appwrite) {
    return null;
  }

  const client = getAppwriteClient();
  if (!client) {
    return null;
  }

  try {
    return await client.databases.getDocument(
      cfg.appwrite.cloudDatabaseId,
      collectionId,
      userId,
    ) as unknown as Record<string, unknown>;
  } catch (error) {
    if (isCloudNotFoundError(error)) {
      return null;
    }

    throw error;
  }
}

async function getCollectionDocumentWithId(
  userId: string,
  collectionId: string,
): Promise<{ documentId: string; document: Record<string, unknown> } | null> {
  const candidates = await resolveCloudUserIdCandidates(userId);
  return findFirstResolvedCloudDocument(candidates, candidate => getCollectionDocumentOrNull(candidate, collectionId));
}

async function saveCollectionBlob(
  userId: string,
  collectionId: string,
  mutator: (blob: Record<string, unknown>) => Record<string, unknown>,
): Promise<void> {
  const cfg = getAppConfig();
  if (!cfg.appwrite) {
    return;
  }

  const client = getAppwriteClient();
  if (!client) {
    return;
  }

  const nowIso = new Date().toISOString();
  const candidates = await resolveCloudUserIdCandidates(userId);
  const existingResolved = await getCollectionDocumentWithId(userId, collectionId);
  const existing = existingResolved?.document;
  const targetDocumentId = existingResolved?.documentId ?? candidates[0] ?? userId;
  const existingBlob = parseCloudJsonBlob(existing?.data) ?? {};

  const nextBlob = mutator(existingBlob);

  const payload = createCloudJsonBlobPayload(existing ?? null, nextBlob, nowIso);

  if (existing) {
    await client.databases.updateDocument(
      cfg.appwrite.cloudDatabaseId,
      collectionId,
      targetDocumentId,
      payload,
    );
    return;
  }

  await client.databases.createDocument(
    cfg.appwrite.cloudDatabaseId,
    collectionId,
    targetDocumentId,
    payload,
  );
}

export async function loadUserReminderCloudState(userId: string): Promise<CloudReminderState | null> {
  try {
    const cfg = getAppConfig();
    if (!cfg.appwrite) {
      return null;
    }

    const resolved = await getCollectionDocumentWithId(userId, cfg.appwrite.remindCollectionId);
    const doc = resolved?.document;
    if (!doc || typeof doc.data !== 'string') {
      return null;
    }

    const blob = parseCloudJsonBlob(doc.data);
    if (!blob) {
      return null;
    }
    const settings = toObjectRecord(blob.settings);
    if (!settings) {
      return null;
    }

    const reminderObj = toObjectRecord(settings.reminders) ?? toObjectRecord(settings.reminderSettings);
    if (!reminderObj) {
      return null;
    }

    const togglesObj = toObjectRecord(reminderObj.toggles) ?? {};
    const toggles: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(togglesObj)) {
      toggles[key] = Boolean(value);
    }

    return {
      toggles,
      paused: Boolean(reminderObj.paused),
      updatedAt: parseIsoTimestampToMillis(doc.updatedAt ?? doc.$updatedAt),
    };
  } catch (error) {
    logger.warn('Failed loading reminder cloud state', error);
    return null;
  }
}

export async function saveUserReminderCloudState(userId: string, state: CloudReminderState): Promise<boolean> {
  try {
    const cfg = getAppConfig();
    if (!cfg.appwrite) {
      return false;
    }

    await saveCollectionBlob(userId, cfg.appwrite.remindCollectionId, existingBlob => {
      const settings = toObjectRecord(existingBlob.settings) ?? {};
      return {
        ...existingBlob,
        settings: {
          ...settings,
          reminders: {
            toggles: state.toggles,
            paused: state.paused,
          },
        },
      };
    });
    return true;
  } catch (error) {
    logger.warn('Failed saving reminder cloud state', error);
    return false;
  }
}

export async function loadUserChecklistCloudState(userId: string): Promise<CloudChecklistState | null> {
  try {
    const cfg = getAppConfig();
    if (!cfg.appwrite) {
      return null;
    }

    const resolved = await getCollectionDocumentWithId(userId, cfg.appwrite.checklistCollectionId);
    const doc = resolved?.document;
    if (!doc || typeof doc.data !== 'string') {
      return null;
    }

    const blob = parseCloudJsonBlob(doc.data);
    if (!blob) {
      return null;
    }
    const settings = toObjectRecord(blob.settings);
    if (!settings) {
      return null;
    }

    const checklistObj = toObjectRecord(settings.checklist);
    if (!checklistObj) {
      return null;
    }

    const labels = Array.isArray(checklistObj.labels)
      ? checklistObj.labels.map(item => (typeof item === 'string' ? item : null))
      : [];
    const tasks = Array.isArray(checklistObj.tasks)
      ? checklistObj.tasks.map(item => Boolean(item))
      : [];
    const updatedAt = Number.isFinite(Number(checklistObj.updatedAt))
      ? Number(checklistObj.updatedAt)
      : null;

    return { labels, tasks, updatedAt };
  } catch (error) {
    logger.warn('Failed loading checklist cloud state', error);
    return null;
  }
}

export async function saveUserChecklistCloudState(userId: string, state: CloudChecklistState): Promise<boolean> {
  try {
    const cfg = getAppConfig();
    if (!cfg.appwrite) {
      return false;
    }

    await saveCollectionBlob(userId, cfg.appwrite.checklistCollectionId, existingBlob => {
      const settings = toObjectRecord(existingBlob.settings) ?? {};
      return {
        ...existingBlob,
        settings: {
          ...settings,
          checklist: {
            labels: state.labels,
            tasks: state.tasks,
            updatedAt: state.updatedAt,
          },
        },
      };
    });
    return true;
  } catch (error) {
    logger.warn('Failed saving checklist cloud state', error);
    return false;
  }
}
