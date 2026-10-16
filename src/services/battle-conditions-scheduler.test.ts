import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ latest: vi.fn(), subscriptions: vi.fn(), state: vi.fn(), save: vi.fn(), deliver: vi.fn() }));
vi.mock('./battle-conditions-cloud', () => ({ getLatestBattleConditions: mocks.latest }));
vi.mock('./battle-conditions-db', () => ({ listBattleConditionsSubscriptions: mocks.subscriptions, getBattleConditionsSchedulerState: mocks.state, saveBattleConditionsSchedulerState: mocks.save }));
vi.mock('./battle-conditions-delivery', () => ({ deliverBattleConditionsRecords: mocks.deliver }));
vi.mock('../core/logger', () => ({ logger: { warn: vi.fn(), info: vi.fn() } }));
import { checkAndSend } from './battle-conditions-scheduler';
beforeEach(() => { vi.clearAllMocks(); vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-02T00:30:00Z')); mocks.subscriptions.mockResolvedValue([{ channels: { legends: 'channel' }, enabled: {} }]); mocks.state.mockResolvedValue({ windowKey: '2026-10-02T00:00:00.000Z', resolvedAt: 1, lastSeenTournamentDates: {} }); mocks.latest.mockResolvedValue({ rank: 'legends', tournamentDate: '2026-10-03', tournamentTimestamp: Date.parse('2026-10-03T00:00:00Z'), sourceMessageUpdatedAt: Date.parse('2026-10-02T00:00:05Z') }); mocks.deliver.mockResolvedValue({ delivered: 0, skipped: 1, failed: 0 }); });
afterEach(() => vi.restoreAllMocks());
it('polls Friday current conditions even after an earlier resolved pass', async () => { await checkAndSend({} as never); expect(mocks.deliver).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ legends: expect.objectContaining({ tournamentDate: '2026-10-03' }) })); expect(mocks.save).toHaveBeenCalled(); });
it('coalesces overlapping scheduler checks', async () => { await Promise.all([checkAndSend({} as never), checkAndSend({} as never)]); expect(mocks.latest).toHaveBeenCalledTimes(1); });
it('contains polling failures and permits the next retry', async () => { mocks.latest.mockRejectedValueOnce(new Error('offline')); await expect(checkAndSend({} as never)).resolves.toBeUndefined(); await checkAndSend({} as never); expect(mocks.deliver).toHaveBeenCalledTimes(1); });
it('does not deliver expired tournaments', async () => { mocks.latest.mockResolvedValue({ tournamentTimestamp: Date.parse('2026-09-30T00:00:00Z') }); await checkAndSend({} as never); expect(mocks.deliver).toHaveBeenCalledWith(expect.anything(), {}); });


it('continues on the next UTC tournament window for all six ranks after prior resolution', async () => {
  vi.mocked(Date.now).mockReturnValue(Date.parse('2026-10-06T00:10:00Z'));
  const ranks = ['legends', 'champ', 'plat', 'gold', 'silver', 'mythic'];
  mocks.subscriptions.mockResolvedValue([{ channels: Object.fromEntries(ranks.map(rank => [rank, 'isolated-' + rank])), enabled: {} }]);
  mocks.state.mockResolvedValue({ windowKey: '2026-10-02T00:00:00.000Z', resolvedAt: 1, lastSeenTournamentDates: Object.fromEntries(ranks.map(rank => [rank, '2026-10-03'])) });
  mocks.latest.mockImplementation(async rank => ({ rank, tournamentDate: '2026-10-07', tournamentTimestamp: Date.parse('2026-10-07T00:00:00Z'), sourceMessageUpdatedAt: Date.parse('2026-10-06T00:00:05Z') }));
  await checkAndSend({} as never);
  expect(mocks.latest).toHaveBeenCalledTimes(6);
  const records = mocks.deliver.mock.calls[0][1];
  expect(Object.keys(records)).toEqual(ranks);
  expect(records.mythic.tournamentDate).toBe('2026-10-07');
  expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ windowKey: '2026-10-06T00:00:00.000Z', lastSeenTournamentDates: Object.fromEntries(ranks.map(rank => [rank, '2026-10-07'])) }));
});
