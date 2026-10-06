import { beforeEach, expect, it, vi } from 'vitest';
const expand = vi.hoisted(() => vi.fn());
vi.mock('../services/acronym-registry', () => ({ expandManagedAcronymsInText: expand }));
import { defineCommand } from './define';
import { defineMessageCommand } from './define-message';

beforeEach(() => vi.clearAllMocks());

it.each([true, false])('bounds message-context output when changed=%s', async changed => {
  const source = '🚀\n'.repeat(900);
  const expanded = 'expanded '.repeat(1_000);
  expand.mockResolvedValue({ text: expanded, changed });
  const interaction = {
    isMessageContextMenuCommand: () => true, targetMessage: { content: source },
    deferReply: vi.fn().mockResolvedValue(undefined), editReply: vi.fn().mockResolvedValue(undefined),
  };
  await defineMessageCommand.execute(interaction as unknown as Parameters<typeof defineMessageCommand.execute>[0]);
  expect(interaction.deferReply).toHaveBeenCalledTimes(1);
  expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
  const payload = interaction.editReply.mock.calls[0][0];
  expect(payload.content.length).toBeLessThanOrEqual(2_000);
  expect(payload.files).toHaveLength(1);
  if (changed) expect(payload.files[0].attachment.toString('utf8')).toContain(expanded);
});

it.each([true, false])('bounds slash output while preserving public/changed policy %s', async changed => {
  expand.mockResolvedValue({ text: 'expanded '.repeat(1_000), changed });
  const interaction = {
    isChatInputCommand: () => true,
    options: { getString: () => 'input '.repeat(700), getBoolean: () => true },
    deferReply: vi.fn().mockResolvedValue(undefined), editReply: vi.fn().mockResolvedValue(undefined),
  };
  await defineCommand.execute(interaction as unknown as Parameters<typeof defineCommand.execute>[0]);
  expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: !changed });
  const payload = interaction.editReply.mock.calls[0][0];
  expect(payload.content.length).toBeLessThanOrEqual(2_000);
  expect(payload.files).toHaveLength(1);
});
