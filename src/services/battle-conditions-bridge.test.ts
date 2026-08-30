import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  battleConditionsBridgeEventSchema,
  battleConditionsBridgeHost,
  battleConditionsBridgePath,
  battleConditionsBridgePort,
} from '@tmrxjd/platform/tools';

const deliverBattleConditionsRecordMock = vi.fn();

vi.mock('./battle-conditions-delivery', () => ({
  deliverBattleConditionsRecord: (...args: unknown[]) => deliverBattleConditionsRecordMock(...args),
}));

vi.mock('../core/logger', () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import {
  startBattleConditionsBridgeServer,
  stopBattleConditionsBridgeServer,
} from './battle-conditions-bridge';

const sampleRecord = {
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
  deliverBattleConditionsRecordMock.mockReset();
});

afterEach(() => {
  stopBattleConditionsBridgeServer();
});

describe('battle conditions bridge server', () => {
  it('accepts a validated loopback payload and forwards it to delivery', async () => {
    deliverBattleConditionsRecordMock.mockResolvedValue({ delivered: 1, skipped: 0, failed: 0 });
    startBattleConditionsBridgeServer({} as never);

    const payload = battleConditionsBridgeEventSchema.parse({
      event: 'battle_conditions.updated',
      sentAt: Date.now(),
      record: sampleRecord,
    });

    const response = await fetch(`http://${battleConditionsBridgeHost}:${battleConditionsBridgePort}${battleConditionsBridgePath}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      delivered: 1,
      skipped: 0,
      failed: 0,
    });
    expect(deliverBattleConditionsRecordMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        rank: 'legends',
        tournamentDate: '2026-06-01',
      }),
    );
  });
});