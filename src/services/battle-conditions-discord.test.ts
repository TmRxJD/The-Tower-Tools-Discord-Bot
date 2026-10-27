import { beforeEach, expect, it, vi } from 'vitest';
import { ChannelType } from 'discord.js';
const mocks = vi.hoisted(() => ({ payload: vi.fn(), receipt: vi.fn() }));
vi.mock('./battle-conditions-payload', () => ({ readLocalBattlePayload: mocks.payload }));
vi.mock('./battle-delivery-receipt', () => ({ sendWithBattleReceipt: mocks.receipt }));
import { sendBattleConditionsRecordToChannel } from './battle-conditions-discord';
const record = { rank: 'legends', tournamentDate: '2026-10-28', sourceMessageUpdatedAt: 1 } as never;
function fixture() {
  const channel = { type: ChannelType.GuildText, isTextBased: () => true, permissionsFor: () => ({ has: () => true }), send: vi.fn().mockResolvedValue({ id: 'confirmed' }) };
  const guild = { available: true, channels: { cache: new Map([['channel', channel]]), fetch: vi.fn() }, members: { me: {}, fetchMe: vi.fn() } };
  const client = { isReady: () => true, guilds: { cache: new Map([['guild', guild]]), fetch: vi.fn() } };
  const send = () => sendBattleConditionsRecordToChannel(client as never, 'guild', 'channel', record);
  return { client, guild, channel, send };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.payload.mockResolvedValue({ payload: { content: 'offline fixture', embeds: [], files: [] } });
  mocks.receipt.mockImplementation(async (_nonce, send) => (await send()).id);
});
it.each([
  [10004, 404, 'invalid-destination'], [50001, 403, 'inaccessible'],
  [50013, 403, 'inaccessible'], [undefined, 503, 'transient'], ['ECONNRESET', undefined, 'transient'], [undefined, undefined, 'unknown'],
])('classifies guild lookup code %s status %s without sending', async (code, status, classification) => {
  const { client, channel, send } = fixture();
  client.guilds.cache.clear();
  client.guilds.fetch.mockRejectedValue(Object.assign(new Error('raw private response'), { code, status }));
  expect(await send()).toMatchObject({ ok: false, stage: 'guild-fetch', classification });
  expect(channel.send).not.toHaveBeenCalled();
  expect(mocks.receipt).not.toHaveBeenCalled();
});
it('retains a transient result when gateway/guild availability drops', async () => {
  const { client, guild, send } = fixture();
  guild.available = false;
  expect(await send()).toMatchObject({ ok: false, classification: 'transient', stage: 'guild-available' });
  client.isReady = () => false;
  expect(await send()).toMatchObject({ ok: false, classification: 'transient', stage: 'client-ready' });
});
it('distinguishes missing channels, permissions and member transport failures', async () => {
  const { guild, channel, send } = fixture();
  guild.channels.cache.clear();
  guild.channels.fetch.mockRejectedValue({ code: 10003, status: 404 });
  expect(await send()).toMatchObject({ classification: 'invalid-destination', stage: 'channel-fetch' });
  guild.channels.cache.set('channel', channel);
  channel.permissionsFor = () => ({ has: () => false });
  expect(await send()).toMatchObject({ classification: 'inaccessible', stage: 'permission-check' });
  guild.members.me = null as never;
  guild.members.fetchMe.mockRejectedValue({ code: 'ECONNRESET' });
  expect(await send()).toMatchObject({ classification: 'transient', stage: 'member-fetch' });
});
it('preserves confirmed sends and holds ambiguous receipts', async () => {
  const { channel, send } = fixture();
  expect(await send()).toEqual({ ok: true, messageId: 'confirmed' });
  expect(channel.send).toHaveBeenCalledOnce();
  mocks.receipt.mockResolvedValue(null);
  expect(await send()).toMatchObject({ ok: false, classification: 'uncertain', reason: 'delivery-uncertain' });
  expect(channel.send).toHaveBeenCalledOnce();
});
