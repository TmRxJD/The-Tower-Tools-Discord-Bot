import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AttachmentBuilder, MessageFlags, type ChatInputCommandInteraction, type ButtonInteraction } from 'discord.js';
import { PrivateFileShares, PRIVATE_FILE_SHARE_PREFIX, PRIVATE_FILE_SHARE_TTL } from './private-file-share';
let shares: PrivateFileShares;
const source = () => ({ id: '123456789012345678', user: { id: 'owner' }, channelId: 'channel', editReply: vi.fn().mockResolvedValue({ id: 'message' }) });
const click = () => ({ customId: PRIVATE_FILE_SHARE_PREFIX + '123456789012345678', user: { id: 'owner' }, channelId: 'channel', message: { id: 'message' }, channel: { send: vi.fn().mockResolvedValue({ id: 'public-message' }) }, deferReply: vi.fn().mockResolvedValue(undefined), reply: vi.fn().mockResolvedValue(undefined), editReply: vi.fn().mockResolvedValue(undefined) });
const handle = (i: ReturnType<typeof click>) => shares.handle(i as unknown as ButtonInteraction);
const payload = () => ({ content: 'Complete list', files: [new AttachmentBuilder(Buffer.from('complete \u00e9 \ud83c\udf19')).setName('tower-acronyms.md')] });
const offer = (i = source(), p = payload()) => shares.offer(i as unknown as ChatInputCommandInteraction, p);
beforeEach(() => { vi.useFakeTimers(); shares = new PrivateFileShares(); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });
it('offers Share and publishes the exact attachment only on an owner click, with private acknowledgements', async () => {
 const original = source(); const p = payload(); await offer(original, p);
 const row = original.editReply.mock.calls[0][0].components[0].toJSON();
 expect(row.components[0].label).toBe('Share');
 const i = click(); expect(i.channel.send).not.toHaveBeenCalled(); await handle(i);
 expect(i.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
 expect(i.channel.send).toHaveBeenCalledWith({ ...p, allowedMentions: { parse: [] }, nonce: '123456789012345678', enforceNonce: true });
 expect(i.editReply).toHaveBeenCalledWith({ content: 'Shared in this channel.' });
 expect(original.editReply).toHaveBeenLastCalledWith({ content: 'Shared in this channel.', components: [] });
});
it.each(['owner', 'channel', 'message'])('rejects mismatched %s privately', async field => {
 await offer(); const i = click();
 if (field === 'owner') i.user.id = 'stranger';
 if (field === 'channel') i.channelId = 'elsewhere';
 if (field === 'message') i.message.id = 'other';
 await handle(i); expect(i.channel.send).not.toHaveBeenCalled();
 expect(i.reply.mock.calls[0][0].flags).toBe(MessageFlags.Ephemeral);
});
it('claims before await to block concurrent and repeated clicks', async () => {
 await offer(); const first = click(); let release!: () => void;
 first.deferReply.mockImplementation(() => new Promise<void>(resolve => { release = resolve; }));
 const pending = handle(first); const second = click(); await handle(second);
 expect(second.channel.send).not.toHaveBeenCalled(); release(); await pending;
 await handle(second); expect(first.channel.send).toHaveBeenCalledTimes(1); expect(second.channel.send).not.toHaveBeenCalled();
 expect(second.reply).toHaveBeenLastCalledWith({ content: 'Already shared in this channel.', flags: MessageFlags.Ephemeral });
});
it('expires and disables offers, including sessions lost on process restart', async () => {
 const original = source(); await offer(original); await vi.advanceTimersByTimeAsync(PRIVATE_FILE_SHARE_TTL);
 const i = click(); await handle(i); expect(i.channel.send).not.toHaveBeenCalled();
 expect(original.editReply).toHaveBeenLastCalledWith({ content: 'Share expired. Run /acronyms all again to share.', components: [] });
 shares = new PrivateFileShares(); await handle(i); expect(i.reply.mock.calls.at(-1)?.[0].flags).toBe(MessageFlags.Ephemeral);
});
it('does not send or retry after an expired acknowledgement', async () => {
 await offer(); const i = click(); i.deferReply.mockRejectedValue({ code: 10062 });
 await handle(i); await handle(click()); expect(i.channel.send).not.toHaveBeenCalled(); expect(i.reply).not.toHaveBeenCalled();
});
it('holds an uncertain send and never retries', async () => {
 await offer(); const i = click(); i.channel.send.mockRejectedValue(new Error('timeout after acceptance'));
 await handle(i); await handle(i); expect(i.channel.send).toHaveBeenCalledTimes(1);
 expect(i.editReply.mock.calls[0][0].content).toContain('could not be confirmed');
 expect(i.reply.mock.calls[0][0].flags).toBe(MessageFlags.Ephemeral);
});
it('retains successful-send state even when private confirmation fails', async () => {
 const original = source(); await offer(original); original.editReply.mockRejectedValue(new Error('expired'));
 const i = click(); i.editReply.mockRejectedValue(new Error('expired')); await handle(i); await handle(i);
 expect(i.channel.send).toHaveBeenCalledTimes(1); expect(i.reply.mock.calls[0][0].content).toContain('Already shared');
});
it('handles missing channel privately without a public fallback', async () => {
 await offer(); const i = click(); Object.assign(i, { channel: null }); await handle(i);
 expect(i.editReply).toHaveBeenCalledWith({ content: 'Unable to share a file in this channel.' });
});
it('removes an offer if initial attachment upload fails', async () => {
 const original = source(); original.editReply.mockRejectedValue(new Error('upload failed'));
 await expect(offer(original)).rejects.toThrow('upload failed'); const i = click(); await handle(i);
 expect(i.channel.send).not.toHaveBeenCalled(); expect(i.reply.mock.calls[0][0].content).toContain('expired');
});
