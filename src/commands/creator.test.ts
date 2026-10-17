import { EventEmitter } from 'node:events';
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
import { creatorCommand, getMaxKnownLength, isValidCreatorSubmission, mergeCreatorEntries, normalizeCreatorKnown } from './creator';

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
  it('prevents codes used by someone else, then persists and displays successful additions', async () => {
    storedEntries = [{ id: 'someone-else', code: 'Fresh-Code', known: 'already listed' }];
    await creatorCommand.execute(makeInteraction('new-user', 'add'));
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

describe('creator entry updates', () => {
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

  const modalFields = () => {
    const modal = mocks.showModalAndAwaitSubmit.mock.calls[0][0].modal.toJSON();
    return {
      title: modal.title as string,
      inputs: modal.components.map((row: { components: Array<{ custom_id: string; value?: string }> }) => row.components[0]),
    };
  };

  it('prefills the modal from the user\'s stored entry and replaces it on resubmit', async () => {
    storedEntries = [
      { id: 'other', code: 'other-code', known: 'someone else' },
      { id: 'returning', code: 'old-code', known: 'old description' },
    ];
    submitted = makeSubmission('new-code', 'new description');
    await creatorCommand.execute(makeInteraction('returning', 'add'));

    const { title, inputs } = modalFields();
    expect(title).toBe('Update your creator code');
    expect(inputs[0]).toEqual(expect.objectContaining({ custom_id: 'creator_code', value: 'old-code' }));
    expect(inputs[1]).toEqual(expect.objectContaining({ custom_id: 'creator_known_for', value: 'old description' }));
    expect(inputs[2].value).toBeUndefined();
    expect(storedEntries).toEqual([
      { id: 'other', code: 'other-code', known: 'someone else' },
      { id: 'returning', code: 'new-code', known: 'new description' },
    ]);
    expect(submitted.reply.mock.calls[0][0].content).toMatch(/updated/i);
  });

  it('lets someone on the built-in list update via an override and shows only the new entry', async () => {
    const builtIn = getBotConfig().commands.creator.creators[0];
    submitted = makeSubmission('renamed', 'fresh description');
    await creatorCommand.execute(makeInteraction(builtIn.id, 'add'));

    expect(modalFields().inputs[0].value).toBe(builtIn.code);
    expect(storedEntries).toEqual([{ id: builtIn.id, code: 'renamed', known: 'fresh description' }]);

    const reply = vi.fn();
    await creatorCommand.execute(makeInteraction(builtIn.id, 'list', reply));
    const description = reply.mock.calls[0][0].embeds[0].data.description as string;
    expect(description).toContain('renamed');
    expect(description.split(`<@${builtIn.id}>`)).toHaveLength(2);
  });

  it('allows keeping your own code but rejects another user\'s code', async () => {
    storedEntries = [
      { id: 'other', code: 'taken', known: 'someone else' },
      { id: 'returning', code: 'mine', known: 'old description' },
    ];
    submitted = makeSubmission('mine', 'only the description changed');
    await creatorCommand.execute(makeInteraction('returning', 'add'));
    expect(storedEntries.find(entry => entry.id === 'returning')).toEqual(
      { id: 'returning', code: 'mine', known: 'only the description changed' },
    );

    mocks.setToolsBotKv.mockClear();
    submitted = makeSubmission('TAKEN', 'whatever');
    await creatorCommand.execute(makeInteraction('returning', 'add'));
    expect(mocks.setToolsBotKv).not.toHaveBeenCalled();
    expect(submitted.reply.mock.calls[0][0].content).toMatch(/already used by someone else/i);
  });

  it('does not rewrite storage when nothing changed', async () => {
    storedEntries = [{ id: 'returning', code: 'mine', known: 'same' }];
    submitted = makeSubmission('mine', 'same');
    await creatorCommand.execute(makeInteraction('returning', 'add'));
    expect(mocks.setToolsBotKv).not.toHaveBeenCalled();
    expect(submitted.reply.mock.calls[0][0].content).toMatch(/up to date/i);
  });

  it('merges stored entries over base entries by user id', () => {
    expect(mergeCreatorEntries(
      [{ id: '1', code: 'a', known: 'x' }, { id: '2', code: 'b', known: 'y' }],
      [{ id: '1', code: 'a2', known: 'x2' }],
    )).toEqual([{ id: '2', code: 'b', known: 'y' }, { id: '1', code: 'a2', known: 'x2' }]);
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

describe('creator list pagination', () => {
  it('adds Previous/Next buttons when the list outgrows one embed and pages through it', async () => {
    mocks.getToolsBotKv.mockImplementation(async () => Array.from({ length: 80 }, (_, index) => ({
      id: `2000000000000000${String(index).padStart(3, '0')}`,
      code: `stored-${String(index).padStart(2, '0')}`,
      known: 'k'.repeat(150),
    })));
    const collector = new EventEmitter();
    const register = vi.fn();
    const unregister = vi.fn();
    const reply = vi.fn();
    const editReply = vi.fn(async (_payload: { components: Array<{ toJSON: () => { components: Array<{ disabled: boolean }> } }> }) => {});
    const interaction = {
      ...makeInteraction('lister', 'list', reply),
      client: { scopedInteractionSessions: { register, unregister } },
      fetchReply: vi.fn(async () => ({ id: 'message-1', createMessageComponentCollector: () => collector })),
      editReply,
    } as unknown as ChatInputCommandInteraction;

    await creatorCommand.execute(interaction);

    const first = reply.mock.calls[0][0];
    expect(first.embeds[0].data.description.length).toBeLessThanOrEqual(4096);
    expect(first.embeds[0].data.footer.text).toMatch(/Page 1\/\d+/);
    const [prev, next] = first.components[0].toJSON().components;
    expect(prev.disabled).toBe(true);
    expect(next.disabled).toBe(false);
    expect(register).toHaveBeenCalledWith(expect.objectContaining({ ownerUserId: 'lister', messageId: 'message-1' }));

    const update = vi.fn(async (_payload: { embeds: Array<{ data: { footer: { text: string } } }>; components: Array<{ toJSON: () => { components: Array<{ disabled: boolean }> } }> }) => {});
    collector.emit('collect', { customId: next.custom_id, user: { id: 'lister' }, update });
    await new Promise(resolve => setImmediate(resolve));
    const second = update.mock.calls[0]![0];
    expect(second.embeds[0].data.footer.text).toMatch(/Page 2\/\d+/);
    expect(second.components[0].toJSON().components[0].disabled).toBe(false);

    collector.emit('end');
    await new Promise(resolve => setImmediate(resolve));
    expect(unregister).toHaveBeenCalled();
    expect(editReply.mock.calls[0]![0].components[0]!.toJSON().components.every(b => b.disabled)).toBe(true);
  });

  it('keeps the original single-embed reply when everything fits on one page', async () => {
    mocks.getToolsBotKv.mockImplementation(async () => []);
    const reply = vi.fn();
    await creatorCommand.execute(makeInteraction('lister', 'list', reply));
    expect(reply.mock.calls[0][0].components).toBeUndefined();
    expect(reply.mock.calls[0][0].embeds[0].data.footer.text).not.toMatch(/Page/);
  });
});

