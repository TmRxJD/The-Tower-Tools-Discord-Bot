import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ read: vi.fn(), list: vi.fn() }));
vi.mock('@tmrxjd/platform/node', () => ({ readBattlePayload: mocks.read, listBattlePayloads: mocks.list }));
import { canAutomaticallyDeliverBattleRecord } from './battle-conditions-payload';
import { buildBattleConditionsSourcePayload } from './battle-conditions-discord';
const record = { rank: 'legends', tournamentDate: new Date().toISOString().slice(0, 10), sourceMessageId: 'fixture', sourceMessageUpdatedAt: Date.now() - 1000 } as never;
beforeEach(() => { vi.clearAllMocks(); });
it('reconstructs exact bytes and embeds without using any Discord source reads', async () => {
  mocks.read.mockResolvedValue({ payload: { content: 'Exact content', embeds: [{ title: 'Exact', fields: [{ name: 'n', value: 'v' }] }], files: [{ name: 'test.txt', data: Buffer.from('fixture').toString('base64') }] } });
  const payload = await buildBattleConditionsSourcePayload({} as never, record);
  expect(payload).toMatchObject({ content: 'Exact content', allowedMentions: { parse: [] }, embeds: [{ title: 'Exact', fields: [{ name: 'n', value: 'v' }] }] });
  expect(payload?.files).toEqual([{ name: 'test.txt', attachment: Buffer.from('fixture') }]);
});
it('rejects unavailable, historical seed and superseded versions for automatic delivery', async () => {
  mocks.read.mockResolvedValue(null); expect(await canAutomaticallyDeliverBattleRecord(record)).toBe(false);
  mocks.read.mockResolvedValue({ automatic: false }); expect(await canAutomaticallyDeliverBattleRecord(record)).toBe(false);
  mocks.read.mockResolvedValue({ automatic: true }); mocks.list.mockResolvedValue([{ record: { ...record as object, sourceMessageUpdatedAt: Date.now() } }]);
  expect(await canAutomaticallyDeliverBattleRecord(record)).toBe(false);
});
it('allows the current live version but refuses past tournaments', async () => {
  mocks.read.mockResolvedValue({ automatic: true }); mocks.list.mockResolvedValue([{ record }]);
  expect(await canAutomaticallyDeliverBattleRecord(record)).toBe(true);
  const stale = { ...record as object, tournamentDate: '2001-01-01' } as never;
  mocks.list.mockResolvedValue([{ record: stale }]); expect(await canAutomaticallyDeliverBattleRecord(stale)).toBe(false);
});
