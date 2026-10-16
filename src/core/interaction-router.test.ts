import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  resolveAppwriteUserIdForDiscord: vi.fn(),
  getBotConfig: vi.fn(() => ({ common: { responses: { commandNotFound: 'missing', interactionError: 'error' } } })),
  logger: { warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../services/discord-identity-resolver', () => ({
  resolveAppwriteUserIdForDiscord: mocks.resolveAppwriteUserIdForDiscord,
}));
vi.mock('../config/bot-config', () => ({ getBotConfig: mocks.getBotConfig }));
vi.mock('./logger', () => ({ logger: mocks.logger }));
vi.mock('@tmrxjd/platform/tools', () => ({
  ANALYTICS_EVENT_COMMAND_INVOKED: 'command',
  ANALYTICS_EVENT_CONTEXT_INVOKED: 'context',
}));

import { registerInteractionRouter } from './interaction-router';

function setupCommand(command: Record<string, unknown>) {
  let handler: ((interaction: unknown) => Promise<void>) | undefined;
  const client = {
    on: vi.fn((_event: string, callback: (interaction: unknown) => Promise<void>) => { handler = callback; }),
    commands: new Map([['creator', command]]),
    scopedInteractionSessions: { owns: vi.fn(() => false) },
    components: { dispatch: vi.fn() },
  };
  registerInteractionRouter(client as never);
  const interaction = {
    commandName: 'creator',
    user: { id: 'discord-user' },
    guildId: 'guild',
    isAutocomplete: () => false,
    isChatInputCommand: () => true,
    isMessageContextMenuCommand: () => false,
    isRepliable: () => true,
  };
  return { handler: handler!, interaction };
}

describe('interaction router Appwrite identity lookup', () => {
  beforeEach(() => vi.clearAllMocks());

  it('executes a command opting out without waiting for Appwrite', async () => {
    const execute = vi.fn(async () => {});
    const { handler, interaction } = setupCommand({ skipAppwriteIdentityResolution: true, execute });

    await handler(interaction);

    expect(mocks.resolveAppwriteUserIdForDiscord).not.toHaveBeenCalled();
    expect(execute).toHaveBeenCalledWith(interaction);
  });

  it('keeps the identity lookup for commands that use the default behavior', async () => {
    const order: string[] = [];
    mocks.resolveAppwriteUserIdForDiscord.mockImplementation(async () => { order.push('identity'); });
    const execute = vi.fn(async () => { order.push('execute'); });
    const { handler, interaction } = setupCommand({ execute });

    await handler(interaction);

    expect(order).toEqual(['identity', 'execute']);
  });
});
