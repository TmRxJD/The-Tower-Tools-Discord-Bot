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

import { getBotConfig } from '../config/bot-config';
import { creatorCommand, getMaxKnownLength, isValidCreatorSubmission, normalizeCreatorKnown } from './creator';

const creatorListKey = 'creatorEntries';
const longestKnown = getMaxKnownLength(getBotConfig().commands.creator.creators);

function makeSubmission(code = 'fresh-code', known = 'content creator', serverId = '1509606869336068347') {
  const values: Record<string, string> = {
    creator_code: code,
    creator_known_for: known,
    creator_server_id: serverId,
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

  it('registers add and list and constructs the required three-field modal', async () => {
    expect(creatorCommand.skipAppwriteIdentityResolution).toBe(true);
    const options = creatorCommand.data.options ?? [];
    expect(options.map(option => option.name)).toEqual(['add', 'list']);

    await creatorCommand.execute(makeInteraction('submitter', 'add'));
    const args = mocks.showModalAndAwaitSubmit.mock.calls[0][0];
    expect(args.baseCustomId).toBe('creator_add_modal');
    const rows = args.modal.toJSON().components;
    expect(rows).toHaveLength(3);
    expect(rows.map((row: { components: Array<{ custom_id: string; max_length: number }> }) => row.components[0]))
      .toEqual([
        expect.objectContaining({ custom_id: 'creator_code', max_length: 30 }),
        expect.objectContaining({ custom_id: 'creator_known_for', max_length: longestKnown }),
        expect.objectContaining({ custom_id: 'creator_server_id', label: 'The Tower Network Discord ServerID', max_length: 32 }),
      ]);
  });

  it.each(['wrong-server-id', ''])('rejects a wrong or empty server ID privately without persisting', async serverId => {
    submitted = makeSubmission('fresh-code', 'content creator', serverId);
    await creatorCommand.execute(makeInteraction('server-id-check', 'add'));

    expect(mocks.setToolsBotKv).not.toHaveBeenCalled();
    const reply = submitted.reply.mock.calls[0][0];
    expect(reply.ephemeral).toBe(true);
    expect(reply.content).toMatch(/server ID did not match/i);
    expect(reply.content).not.toContain('1509606869336068347');
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
  it('limits codes to 30 characters and descriptions to the longest current one', () => {
    expect(isValidCreatorSubmission('code', 'known for', 50)).toBe(true);
    expect(isValidCreatorSubmission('a'.repeat(30), 'known for', 50)).toBe(true);
    expect(isValidCreatorSubmission('a'.repeat(31), 'known for', 50)).toBe(false);
    expect(isValidCreatorSubmission('code', 'a'.repeat(50), 50)).toBe(true);
    expect(isValidCreatorSubmission('code', 'a'.repeat(51), 50)).toBe(false);
    expect(isValidCreatorSubmission('', 'known for', 50)).toBe(false);
    expect(isValidCreatorSubmission('code', '', 50)).toBe(false);
  });

  it('rejects mentions but accepts handles inside links', () => {
    expect(isValidCreatorSubmission('@everyone', 'known for', 50)).toBe(false);
    expect(isValidCreatorSubmission('code', '<@123456789012345678>', 50)).toBe(false);
    expect(isValidCreatorSubmission('code', 'https://www.youtube.com/@Handle', 50)).toBe(true);
  });

  it('computes the longest known length across entries', () => {
    expect(getMaxKnownLength([{ id: '1', code: 'a', known: 'abc' }, { id: '2', code: 'b', known: 'abcdef' }])).toBe(6);
  });

  it('collapses line breaks and expands bare links', () => {
    expect(normalizeCreatorKnown('Videos\nyoutube.com/@Handle | thetower.lol'))
      .toBe('Videos https://youtube.com/@Handle | https://thetower.lol');
    expect(normalizeCreatorKnown('https://a.com/x and Sheets & Tools')).toBe('https://a.com/x and Sheets & Tools');
  });
});
