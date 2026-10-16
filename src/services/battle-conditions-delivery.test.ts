vi.mock('./battle-conditions-payload', () => ({ canAutomaticallyDeliverBattleRecord: vi.fn(async () => true) }));
import { beforeEach, describe, expect, it, vi } from 'vitest';

const listBattleConditionsSubscriptionsMock = vi.fn();
const markBattleConditionsDeliveredMock = vi.fn();
const sendBattleConditionsRecordToChannelMock = vi.fn();

vi.mock('./battle-conditions-db', () => ({
  listBattleConditionsSubscriptions: () => listBattleConditionsSubscriptionsMock(),
  markBattleConditionsDelivered: (input: unknown) => markBattleConditionsDeliveredMock(input),
}));

vi.mock('./battle-conditions-discord', () => ({
  sendBattleConditionsRecordToChannel: (...args: unknown[]) => sendBattleConditionsRecordToChannelMock(...args),
}));

vi.mock('../core/logger', () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { deliverBattleConditionsRecord } from './battle-conditions-delivery';

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
  listBattleConditionsSubscriptionsMock.mockReset();
  markBattleConditionsDeliveredMock.mockReset();
  sendBattleConditionsRecordToChannelMock.mockReset();
  sendBattleConditionsRecordToChannelMock.mockResolvedValue({ ok: true });
});

describe('battle conditions delivery', () => {
  it('skips a record only when the same source update was already delivered', async () => {
    listBattleConditionsSubscriptionsMock.mockResolvedValue([
      {
        guildId: 'guild-1',
        channels: { legends: 'channel-1' },
        enabled: { legends: true },
        deliveredTournamentDates: { legends: '2026-06-01' },
        deliveredSourceUpdatedAt: { legends: sampleRecord.sourceMessageUpdatedAt },
        updatedAt: 1,
      },
    ]);

    const result = await deliverBattleConditionsRecord({} as never, sampleRecord);

    expect(result).toEqual({ delivered: 0, skipped: 1, failed: 0 });
    expect(sendBattleConditionsRecordToChannelMock).not.toHaveBeenCalled();
  });

  it('reposts when the same tournament date has a newer source update timestamp', async () => {
    listBattleConditionsSubscriptionsMock.mockResolvedValue([
      {
        guildId: 'guild-1',
        channels: { legends: 'channel-1' },
        enabled: { legends: true },
        deliveredTournamentDates: { legends: '2026-06-01' },
        deliveredSourceUpdatedAt: { legends: sampleRecord.sourceMessageUpdatedAt - 1 },
        updatedAt: 1,
      },
    ]);

    const result = await deliverBattleConditionsRecord({} as never, sampleRecord);

    expect(result).toEqual({ delivered: 1, skipped: 0, failed: 0 });
    expect(sendBattleConditionsRecordToChannelMock).toHaveBeenCalledTimes(1);
    expect(markBattleConditionsDeliveredMock).toHaveBeenCalledWith({
      guildId: 'guild-1',
      rank: 'legends',
      tournamentDate: '2026-06-01',
      sourceMessageUpdatedAt: sampleRecord.sourceMessageUpdatedAt,
    });
  });
});
it('rejects an older tournament after a newer date was delivered', async () => {
  listBattleConditionsSubscriptionsMock.mockResolvedValue([{ guildId: 'guild-1', channels: { legends: 'channel-1' }, enabled: {}, deliveredTournamentDates: { legends: '2026-06-08' }, deliveredSourceUpdatedAt: {}, updatedAt: 1 }]);
  expect(await deliverBattleConditionsRecord({} as never, sampleRecord)).toEqual({ delivered: 0, skipped: 1, failed: 0 });
  expect(sendBattleConditionsRecordToChannelMock).not.toHaveBeenCalled();
});
it('serializes concurrent bridge/poll delivery and re-reads confirmed receipts', async () => {
  const subscription = { guildId: 'guild-1', channels: { legends: 'channel-1' }, enabled: {}, deliveredTournamentDates: {} as Record<string,string>, deliveredSourceUpdatedAt: {} as Record<string,number>, updatedAt: 1 };
  listBattleConditionsSubscriptionsMock.mockImplementation(async () => [structuredClone(subscription)]);
  markBattleConditionsDeliveredMock.mockImplementation(async () => { subscription.deliveredTournamentDates.legends = sampleRecord.tournamentDate; subscription.deliveredSourceUpdatedAt.legends = sampleRecord.sourceMessageUpdatedAt; });
  const results = await Promise.all([deliverBattleConditionsRecord({} as never, sampleRecord), deliverBattleConditionsRecord({} as never, sampleRecord)]);
  expect(results.map(r => r.delivered)).toEqual([1, 0]);
  expect(sendBattleConditionsRecordToChannelMock).toHaveBeenCalledTimes(1);
});
it('never records success for a failed send', async () => {
  listBattleConditionsSubscriptionsMock.mockResolvedValue([{ guildId: 'guild-1', channels: { legends: 'channel-1' }, enabled: {}, deliveredTournamentDates: {}, deliveredSourceUpdatedAt: {}, updatedAt: 1 }]);
  sendBattleConditionsRecordToChannelMock.mockResolvedValue({ ok: false, reason: 'missing-permissions' });
  expect((await deliverBattleConditionsRecord({} as never, sampleRecord)).failed).toBe(1);
  expect(markBattleConditionsDeliveredMock).not.toHaveBeenCalled();
});


it.each(['legends', 'champ', 'plat', 'gold', 'silver', 'mythic'] as const)('delivers the next tournament once for %s, then permits a newer source edit', async rank => {
  const subscription = { guildId: 'future-fixture', channels: { [rank]: 'isolated-channel' }, enabled: {}, deliveredTournamentDates: { [rank]: '2026-10-03' }, deliveredSourceUpdatedAt: { [rank]: 100 }, updatedAt: 1 };
  const next = { ...sampleRecord, rank, id: '2026-10-07', tournamentDate: '2026-10-07', tournamentTimestamp: Date.parse('2026-10-07T00:00:00Z'), sourceMessageUpdatedAt: 200 };
  listBattleConditionsSubscriptionsMock.mockImplementation(async () => [structuredClone(subscription)]);
  markBattleConditionsDeliveredMock.mockImplementation(async (receipt: { tournamentDate: string; sourceMessageUpdatedAt: number }) => { subscription.deliveredTournamentDates[rank] = receipt.tournamentDate; subscription.deliveredSourceUpdatedAt[rank] = receipt.sourceMessageUpdatedAt; });
  expect((await deliverBattleConditionsRecord({} as never, next)).delivered).toBe(1);
  expect((await deliverBattleConditionsRecord({} as never, next)).skipped).toBe(1);
  expect((await deliverBattleConditionsRecord({} as never, { ...next, sourceMessageUpdatedAt: 201 })).delivered).toBe(1);
  expect((await deliverBattleConditionsRecord({} as never, { ...next, tournamentDate: '2026-10-03', sourceMessageUpdatedAt: 300 })).skipped).toBe(1);
  expect(sendBattleConditionsRecordToChannelMock).toHaveBeenCalledTimes(2);
});
