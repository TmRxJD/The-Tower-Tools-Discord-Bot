import { beforeEach, expect, it, vi } from 'vitest';
import { MessageFlags } from 'discord.js';
const list = vi.hoisted(() => vi.fn());
vi.mock('../services/acronym-registry', () => ({ listManagedAcronyms: list }));
import { acronymsCommand } from './acronyms';
import { renderAcronymMarkdown } from '../features/acronyms/acronym-markdown';
const run = (i: unknown) => acronymsCommand.execute(i as Parameters<typeof acronymsCommand.execute>[0]);
const interaction = (subcommand = 'all') => ({
 id: '123', user: { id: 'owner' }, channelId: 'channel',
 isChatInputCommand: () => true, options: { getSubcommand: () => subcommand },
 deferReply: vi.fn().mockResolvedValue(undefined), editReply: vi.fn().mockResolvedValue({ id: 'reply' }),
 reply: vi.fn().mockResolvedValue(undefined), followUp: vi.fn().mockResolvedValue(undefined),
});
beforeEach(() => vi.clearAllMocks());
it('registers only all, removing export and list_all', () => {
 expect(acronymsCommand.data.options?.map(o => o.name)).toEqual(['all']);
});
it('exports every current entry and alias as UTF-8 after a private defer', async () => {
 const entries = Array.from({ length: 400 }, (_, n) => ({ acronym: `alias${n}`, expansion: `Définition 🌙 ${n} ` + 'x'.repeat(100), source: 'custom' as const }));
 const i = interaction();
 list.mockImplementation(async () => { expect(i.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral }); return entries; });
 await run(i);
 const p = i.editReply.mock.calls[0][0];
 expect(p.files).toHaveLength(1);
 expect(p.files[0].name).toBe('tower-acronyms.md');
 expect(p.files[0].attachment.toString('utf8')).toBe(renderAcronymMarkdown(entries));
 for (const entry of entries) expect(p.files[0].attachment.toString('utf8')).toContain(entry.expansion);
 expect(p.allowedMentions).toEqual({ parse: [] });
 expect(i.reply).not.toHaveBeenCalled(); expect(i.followUp).not.toHaveBeenCalled();
});
it('produces deterministic sorted escaped Markdown without mutating inputs', () => {
 const entries = [{ acronym: 'z|', expansion: '<tag> & *bold*\n[next] \\ é', source: 'base' as const }, { acronym: 'a', expansion: 'first', source: 'base' as const }];
 const text = renderAcronymMarkdown(entries);
 expect(text).toContain('| z\\| | &lt;tag&gt; &amp; \\*bold\\*<br>\\[next\\] \\\\ é |');
 expect(text.indexOf('| a |')).toBeLessThan(text.indexOf('| z'));
 expect(renderAcronymMarkdown([...entries].reverse())).toBe(text);
 expect(entries[0].acronym).toBe('z|');
});
it('exports an empty current registry honestly', async () => {
 list.mockResolvedValue([]); const i = interaction(); await run(i);
 expect(i.editReply.mock.calls[0][0].files[0].attachment.toString()).toContain('Active entries: 0');
});
it.each(['defer', 'read', 'upload'])('never falls back to a public response after %s failure', async failure => {
 list.mockResolvedValue([]); const i = interaction();
 if (failure === 'defer') i.deferReply.mockRejectedValue(new Error('failed'));
 if (failure === 'read') list.mockRejectedValue(new Error('failed'));
 if (failure === 'upload') i.editReply.mockRejectedValue(new Error('failed'));
 await expect(run(i)).rejects.toThrow('failed');
 expect(i.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
 expect(i.reply).not.toHaveBeenCalled(); expect(i.followUp).not.toHaveBeenCalled();
 if (failure === 'defer') expect(list).not.toHaveBeenCalled();
});
it.each(['export', 'list_all'])('rejects obsolete %s privately', async subcommand => {
 const i = interaction(subcommand); await run(i);
 expect(i.reply.mock.calls[0][0].flags).toBe(MessageFlags.Ephemeral);
 expect(list).not.toHaveBeenCalled();
});
