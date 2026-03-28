import { beforeEach, describe, expect, it, vi } from 'vitest';

const getDocumentMock = vi.fn();
const updateDocumentMock = vi.fn();
const createDocumentMock = vi.fn();
const listDocumentsMock = vi.fn();
const getDocumentOrNullMock = vi.fn();
const resolveCloudUserIdCandidatesMock = vi.fn(async (userId: string) => [userId]);

vi.mock('../config', () => ({
  getAppConfig: () => ({
    appwrite: {
      cloudDatabaseId: 'cloud-db',
      settingsDatabaseId: 'settings-db',
      settingsCollectionId: 'settings',
      modulesCollectionId: 'modules',
      labsCollectionId: 'labs',
      remindCollectionId: 'reminders',
      checklistCollectionId: 'checklists',
    },
  }),
}));

vi.mock('./appwrite-client', () => ({
  getAppwriteClient: () => ({
    databases: {
      getDocument: getDocumentMock,
      updateDocument: updateDocumentMock,
      createDocument: createDocumentMock,
      listDocuments: listDocumentsMock,
    },
  }),
}));

vi.mock('./cloud-user-resolution', () => ({
  resolveCloudUserIdCandidates: (userId: string) => resolveCloudUserIdCandidatesMock(userId),
}));

vi.mock('./identity', () => ({
  resolveCanonicalAppwriteUserId: (value: string) => value,
}));

vi.mock('./appwrite-document-utils', () => ({
  getDocumentOrNull: (...args: unknown[]) => getDocumentOrNullMock(...args),
}));

vi.mock('../core/logger', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

import {
  loadUserChecklistCloudState,
  loadUserReminderCloudState,
} from './user-reminder-cloud';
import { loadUserShardSplitterCloudState } from './user-shard-splitter-cloud';
import {
  loadUserLabSettingsCloud,
  saveUserLabSettingsCloud,
} from './user-lab-cloud';

beforeEach(() => {
  getDocumentMock.mockReset();
  updateDocumentMock.mockReset();
  createDocumentMock.mockReset();
  listDocumentsMock.mockReset();
  getDocumentOrNullMock.mockReset();
  resolveCloudUserIdCandidatesMock.mockClear();
  resolveCloudUserIdCandidatesMock.mockImplementation(async (userId: string) => [userId]);
  listDocumentsMock.mockResolvedValue({ documents: [] });
});

describe('user cloud boundaries', () => {
  it('parses reminder blobs and document timestamps through the reminder schema', async () => {
    const updatedAtIso = '2026-03-25T12:00:00.000Z';
    getDocumentMock.mockResolvedValue({
      data: JSON.stringify({
        settings: {
          reminders: {
            toggles: {
              daily: true,
              weekly: 0,
            },
            paused: 0,
          },
        },
      }),
      updatedAt: updatedAtIso,
    });

    const result = await loadUserReminderCloudState('user-1');

    expect(result).toEqual({
      toggles: {
        daily: true,
        weekly: false,
      },
      paused: false,
      updatedAt: Date.parse(updatedAtIso),
    });
  });

  it('normalizes checklist labels and task booleans from cloud blobs', async () => {
    getDocumentMock.mockResolvedValue({
      data: JSON.stringify({
        settings: {
          checklist: {
            labels: ['Boss', 4, null],
            tasks: [1, false, 'yes'],
            updatedAt: 1_234,
          },
        },
      }),
      updatedAt: '2026-03-25T12:00:00.000Z',
    });

    const result = await loadUserChecklistCloudState('user-1');

    expect(result).toEqual({
      labels: ['Boss', null, null],
      tasks: [true, false, true],
      updatedAt: 1_234,
    });
  });

  it('returns null for malformed shard splitter cloud state instead of accepting invalid data', async () => {
    getDocumentMock.mockResolvedValue({
      data: JSON.stringify({
        settings: {
          shardSplitter: 'invalid',
        },
      }),
      updatedAt: '2026-03-25T12:00:00.000Z',
    });

    const result = await loadUserShardSplitterCloudState('user-1');

    expect(result).toBeNull();
  });

  it('parses lab blobs into validated lab settings with updated timestamps', async () => {
    const updatedAtIso = '2026-03-25T12:00:00.000Z';
    getDocumentOrNullMock.mockImplementation(async (_databases: unknown, _databaseId: string, _collectionId: string, documentId: string) => {
      if (documentId !== 'user-1') {
        return null;
      }

      return {
        data: JSON.stringify({
          progress: {
            records: [
              {
                labName: 'Attack Speed',
                currentLevel: 12,
                rangeTarget: 20,
              },
            ],
          },
          settings: {
            labs: {
              labSpeed: 3,
              labRelic: 2,
              labDiscount: 1,
              speedUp: 1.5,
            },
            ui: {
              toolsBotHideMaxedLabs: false,
            },
          },
        }),
        updatedAt: updatedAtIso,
      };
    });

    const result = await loadUserLabSettingsCloud('user-1');

    expect(result?.updatedAt).toBe(Date.parse(updatedAtIso));
    expect(result?.settings.hideMaxedLabs).toBe(false);
    expect(result?.settings.labLevels['Attack Speed']).toEqual({
      startLevel: 12,
      targetLevel: 20,
    });
  });

  it('rejects invalid lab settings writes before issuing cloud mutations', async () => {
    const result = await saveUserLabSettingsCloud('user-1', {
      labSpeed: 1,
      labRelic: 1,
      labDiscount: 1,
      speedUp: 1,
      hideMaxedLabs: true,
      labLevels: {
        Attack: {
          startLevel: 'bad' as unknown as number,
          targetLevel: 10,
        },
      },
    });

    expect(result).toBe(false);
    expect(updateDocumentMock).not.toHaveBeenCalled();
    expect(createDocumentMock).not.toHaveBeenCalled();
  });
});