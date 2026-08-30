import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAppwriteClientMock = vi.fn();
const getLatestBattleConditionsFromLocalBridgeMock = vi.fn();
const getBattleConditionsByDateFromLocalBridgeMock = vi.fn();
const listRecentBattleConditionsFromLocalBridgeMock = vi.fn();
const loggerWarnMock = vi.fn();

vi.mock('./appwrite-client', () => ({
  getAppwriteClient: () => getAppwriteClientMock(),
}));

vi.mock('./battle-conditions-local-bridge', () => ({
  getLatestBattleConditionsFromLocalBridge: (...args: unknown[]) => getLatestBattleConditionsFromLocalBridgeMock(...args),
  getBattleConditionsByDateFromLocalBridge: (...args: unknown[]) => getBattleConditionsByDateFromLocalBridgeMock(...args),
  listRecentBattleConditionsFromLocalBridge: (...args: unknown[]) => listRecentBattleConditionsFromLocalBridgeMock(...args),
}));

vi.mock('../core/logger', () => ({
  logger: {
    warn: (...args: unknown[]) => loggerWarnMock(...args),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import {
  getBattleConditionsByDate,
  getLatestBattleConditions,
  listRecentBattleConditions,
} from './battle-conditions-cloud';

const sampleRecord = {
  id: '2026-06-01',
  rank: 'legends' as const,
  title: 'Legend League Battle Conditions',
  description: 'Predicted battle conditions',
  rawText: 'Legend League Battle Conditions\n\nPredicted battle conditions',
  tournamentDate: '2026-06-01',
  tournamentTimestamp: 1_717_200_000_000,
  conditions: ['Enemy Health +200%'],
  versionText: 'v1.0.0',
  color: 0xfacc15,
  sourceMessageId: 'source-message',
  sourceChannelId: 'source-channel',
  sourceGuildId: 'source-guild',
  sourceMessageUrl: 'https://discord.com/channels/1/2/3',
  sourceMessageCreatedAt: 1_717_199_000_000,
  sourceMessageUpdatedAt: 1_717_199_100_000,
  createdAt: 1_717_199_000_000,
  updatedAt: 1_717_199_100_000,
};

beforeEach(() => {
  getAppwriteClientMock.mockReset();
  getLatestBattleConditionsFromLocalBridgeMock.mockReset();
  getBattleConditionsByDateFromLocalBridgeMock.mockReset();
  listRecentBattleConditionsFromLocalBridgeMock.mockReset();
  loggerWarnMock.mockReset();
});

describe('battle conditions cloud fallback', () => {
  it('uses the local bridge when no Appwrite client is configured', async () => {
    getAppwriteClientMock.mockReturnValue(null);
    getLatestBattleConditionsFromLocalBridgeMock.mockResolvedValue(sampleRecord);

    await expect(getLatestBattleConditions('legends')).resolves.toEqual(sampleRecord);
    expect(getLatestBattleConditionsFromLocalBridgeMock).toHaveBeenCalledWith('legends');
  });

  it('falls back to the local bridge when Appwrite rejects with unauthorized', async () => {
    const listDocumentsMock = vi.fn().mockRejectedValue({
      code: 401,
      type: 'user_unauthorized',
      message: 'The current user is not authorized to perform the requested action.',
    });
    getAppwriteClientMock.mockReturnValue({
      databases: {
        listDocuments: listDocumentsMock,
      },
    });
    listRecentBattleConditionsFromLocalBridgeMock.mockResolvedValue([sampleRecord]);

    await expect(listRecentBattleConditions('legends', 5)).resolves.toEqual([sampleRecord]);
    expect(listRecentBattleConditionsFromLocalBridgeMock).toHaveBeenCalledWith('legends', 5);
  });

  it('preserves missing-doc behavior for get-by-date lookups', async () => {
    const getDocumentMock = vi.fn().mockRejectedValue({
      code: 404,
      type: 'document_not_found',
      message: 'Document not found',
    });
    getAppwriteClientMock.mockReturnValue({
      databases: {
        getDocument: getDocumentMock,
      },
    });
    getBattleConditionsByDateFromLocalBridgeMock.mockResolvedValue(null);

    await expect(getBattleConditionsByDate('legends', '2026-06-01')).resolves.toBeNull();
    expect(getBattleConditionsByDateFromLocalBridgeMock).toHaveBeenCalledWith('legends', '2026-06-01');
  });
});