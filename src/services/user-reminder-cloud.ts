import { getAppConfig } from '../config';
import { logger } from '../core/logger';
import { getAppwriteClient } from './appwrite-client';
import { resolveCloudUserIdCandidates } from './cloud-user-resolution';
import { z } from 'zod';
import {
  checklistStateSchema,
  normalizeChecklistState,
  normalizeReminderCompositeState,
  parseCloudJsonBlob,
  parseIsoTimestampToMillis,
  toObjectRecord,
} from '@tmrxjd/platform/tools';
import { mutateCloudJsonBlobDocument, resolveDocumentByCandidates } from '@tmrxjd/platform/node';

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

const cloudBlobDocumentSchema = z.object({
  data: z.string(),
  updatedAt: z.string().optional(),
  $updatedAt: z.string().optional(),
}).passthrough();

const reminderStateSchema = z.object({
  paused: z.boolean(),
  toggles: z.record(z.string(), z.boolean()),
  updatedAt: z.number().nullable(),
}).strict();

async function getCollectionDocumentWithId(
  userId: string,
  collectionId: string,
): Promise<{ documentId: string; document: Record<string, unknown> } | null> {
  const cfg = getAppConfig();
  if (!cfg.appwrite) {
    return null;
  }

  const client = getAppwriteClient();
  if (!client) {
    return null;
  }

  const candidates = await resolveCloudUserIdCandidates(userId);
  return await resolveDocumentByCandidates({
    databases: client.databases,
    databaseId: cfg.appwrite.cloudDatabaseId,
    collectionId,
    candidateDocumentIds: candidates,
  });
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
  await mutateCloudJsonBlobDocument({
    databases: client.databases,
    databaseId: cfg.appwrite.cloudDatabaseId,
    collectionId,
    candidateDocumentIds: candidates,
    fallbackDocumentId: userId,
    nowIso,
    mutate: existingBlob => mutator(existingBlob),
  });
}

export async function loadUserReminderCloudState(userId: string): Promise<CloudReminderState | null> {
  try {
    const cfg = getAppConfig();
    if (!cfg.appwrite) {
      return null;
    }

    const resolved = await getCollectionDocumentWithId(userId, cfg.appwrite.remindCollectionId);
    const rawDoc = resolved?.document;
    if (!rawDoc || typeof rawDoc.data !== 'string') {
      return null;
    }
    const doc = cloudBlobDocumentSchema.parse(rawDoc);

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

    const updatedAt = parseIsoTimestampToMillis(doc.updatedAt ?? doc.$updatedAt)

    const parsed = reminderStateSchema.parse({
      ...normalizeReminderCompositeState({
        toggles,
        paused: Boolean(reminderObj.paused),
      }),
      updatedAt: typeof updatedAt === 'number' ? updatedAt : null,
    });

    return {
      toggles: parsed.toggles,
      paused: parsed.paused,
      updatedAt: parsed.updatedAt,
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

    const parsedState = reminderStateSchema.parse(state);

    await saveCollectionBlob(userId, cfg.appwrite.remindCollectionId, existingBlob => {
      const settings = toObjectRecord(existingBlob.settings) ?? {};
      return {
        ...existingBlob,
        settings: {
          ...settings,
          reminders: {
            toggles: parsedState.toggles,
            paused: parsedState.paused,
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
    const rawDoc = resolved?.document;
    if (!rawDoc || typeof rawDoc.data !== 'string') {
      return null;
    }
    const doc = cloudBlobDocumentSchema.parse(rawDoc);

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

    return normalizeChecklistState({ labels, tasks, updatedAt });
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

    const parsedState = checklistStateSchema.parse(state);

    await saveCollectionBlob(userId, cfg.appwrite.checklistCollectionId, existingBlob => {
      const settings = toObjectRecord(existingBlob.settings) ?? {};
      return {
        ...existingBlob,
        settings: {
          ...settings,
          checklist: {
            labels: parsedState.labels,
            tasks: parsedState.tasks,
            updatedAt: parsedState.updatedAt,
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
