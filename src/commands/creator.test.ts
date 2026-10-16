import type { ChatInputCommandInteraction } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getToolsBotKv: vi.fn(),
  setToolsBotKv: vi.fn(),
  showModalAndAwaitSubmit: vi.fn(),
}));

vi.mock('../services/idb', () => ({
  getToolsBotKv: mocks.getToolsBotKv,
  setToolsBotKv: mocks.setToolsBotKv,
}));
vi.mock('../services/modal-submit', () => ({
  showModalAndAwaitSubmit: mocks.showModalAndAwaitSubmit,
}));

import { creatorCommand, isValidCreatorSubmission } from './creator';

const creatorListKey = 'creatorEntries';

function makeSubmission(code = 'fresh-code', known = 'content creator') {
  const values: Record<string, string> = {
    creator_code: code,
    creator_known_for: known,
  };
  return {
    fields: {
      getTextInputValue: vi.fn((key: string) => values[key]),
    },
    reply: vi.fn(),
  };
}

function makeInteraction(
  userId: string,
  subcommand: 'add' | 'list',
  reply = vi.fn(),
) {
  return {
    id: 'interaction-' + userId,
    user: { id: userId },
    options: { getSubcommand: vi.fn(() => subcommand) },
    reply,
  } as unknown as ChatInputCommandInteraction;
}

describe('creator command', () => {
  let storedEntries: Array<{ id: string; code: string; known: string }>;
  let submitted: ReturnType<typeof makeSubmission>;

  beforeEach(() => {
    vi.clearAllMocks();
    storedEntries = [];
    submitted = makeSubmission();
    mocks.getToolsBotKv.mockImplementation(async () => storedEntries);
    mocks.setToolsBotKv.mockImplementation(async (_key, value) => {
      storedEntries = value;
    });
    mocks.showModalAndAwaitSubmit.mockImplementation(async ({ modal, baseCustomId, componentInteraction }) => {
      modal.setCustomId(baseCustomId + ':' + componentInteraction.id);
      return submitted;
    });
  });

  it('registers add and list and constructs a two-field modal', async () => {
    const options = creatorCommand.data.options ?? [];
    expect(options.map(option => option.name)).toEqual(['add', 'list']);

    await creatorCommand.execute(makeInteraction('submitter', 'add'));
    const args = mocks.showModalAndAwaitSubmit.mock.calls[0][0];
    expect(args.baseCustomId).toBe('creator_add_modal');
    const rows = args.modal.toJSON().components;
    expect(rows).toHaveLength(2);
    expect(rows.map((row: { components: Array<{ custom_id: string; max_length: number }> }) => row.components[0]))
      .toEqual([
        expect.objectContaining({ custom_id: 'creator_code', max_length: 100 }),
        expect.objectContaining({ custom_id: 'creator_known_for', max_length: 300 }),
      ]);
  });

  it('prevents duplicate users and codes, then persists and displays successful additions', async () => {
    storedEntries = [{ id: 'someone-else', code: 'Fresh-Code', known: 'already listed' }];
    await creatorCommand.execute(makeInteraction('new-user', 'add'));
    expect(mocks.setToolsBotKv).not.toHaveBeenCalled();

    storedEntries = [{ id: 'duplicate-user', code: 'other-code', known: 'already listed' }];
    await creatorCommand.execute(makeInteraction('duplicate-user', 'add'));
    expect(mocks.setToolsBotKv).not.toHaveBeenCalled();

    storedEntries = [];
    const userId = 'listed-after-submit';
    await creatorCommand.execute(makeInteraction(userId, 'add'));
    expect(mocks.setToolsBotKv).toHaveBeenCalledWith(creatorListKey, [
      { id: userId, code: 'fresh-code', known: 'content creator' },
    ]);

    const reply = vi.fn();
    await creatorCommand.execute(makeInteraction(userId, 'list', reply));
    const description = reply.mock.calls[0][0].embeds[0].data.description as string;
    expect(description).toContain('fresh-code');
    expect(description).toContain('content creator');
  });
});

describe('creator submission validation', () => {
  it('requires nonempty values within their limits and rejects mentions or line breaks', () => {
    expect(isValidCreatorSubmission('code', 'known for')).toBe(true);
    expect(isValidCreatorSubmission(' ', 'known for')).toBe(false);
    expect(isValidCreatorSubmission('a'.repeat(101), 'known for')).toBe(false);
    expect(isValidCreatorSubmission('code', 'a'.repeat(301))).toBe(false);
    expect(isValidCreatorSubmission('', 'known for')).toBe(false);
    expect(isValidCreatorSubmission('code', '')).toBe(false);
    expect(isValidCreatorSubmission('@everyone', 'known for')).toBe(false);
    expect(isValidCreatorSubmission('code', '<@123456789012345678>')).toBe(false);
    expect(isValidCreatorSubmission('code', 'first line\nsecond line')).toBe(false);
  });
});
