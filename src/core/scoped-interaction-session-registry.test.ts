import { describe, expect, it } from 'vitest';

import { ScopedInteractionSessionRegistry } from './scoped-interaction-session-registry';

describe('ScopedInteractionSessionRegistry', () => {
  it('claims ownership of additional select menu kinds for registered sessions', () => {
    const registry = new ScopedInteractionSessionRegistry();

    registry.register({
      sessionId: 'session-1',
      ownerUserId: 'user-1',
      messageId: 'message-1',
      componentCustomIds: ['channel:select'],
    });

    const owned = registry.owns({
      user: { id: 'user-1' },
      message: { id: 'message-1' },
      customId: 'channel:select',
      isButton: () => false,
      isStringSelectMenu: () => false,
      isUserSelectMenu: () => false,
      isRoleSelectMenu: () => false,
      isMentionableSelectMenu: () => false,
      isChannelSelectMenu: () => true,
      isModalSubmit: () => false,
    } as never);

    expect(owned).toBe(true);
  });
});