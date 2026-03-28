import {
  BaseInteraction,
  ChannelSelectMenuInteraction,
  MentionableSelectMenuInteraction,
  MessageComponentInteraction,
  ModalSubmitInteraction,
  RoleSelectMenuInteraction,
  StringSelectMenuInteraction,
  UserSelectMenuInteraction,
} from 'discord.js';

export interface ScopedInteractionSessionRegistration {
  sessionId: string;
  ownerUserId: string;
  messageId?: string;
  componentCustomIds?: readonly string[];
  modalCustomIds?: readonly string[];
  ttlMs?: number;
}

interface ScopedInteractionSession {
  ownerUserId: string;
  messageId?: string;
  componentCustomIds?: ReadonlySet<string>;
  modalCustomIds?: ReadonlySet<string>;
  expiresAt: number;
}

function isScopedInteraction(
  interaction: BaseInteraction,
): interaction is MessageComponentInteraction | ModalSubmitInteraction | StringSelectMenuInteraction | UserSelectMenuInteraction | RoleSelectMenuInteraction | MentionableSelectMenuInteraction | ChannelSelectMenuInteraction {
  return (
    interaction.isButton()
    || interaction.isStringSelectMenu()
    || interaction.isUserSelectMenu()
    || interaction.isRoleSelectMenu()
    || interaction.isMentionableSelectMenu()
    || interaction.isChannelSelectMenu()
    || interaction.isModalSubmit()
  );
}

export class ScopedInteractionSessionRegistry {
  private readonly sessions = new Map<string, ScopedInteractionSession>();

  register(input: ScopedInteractionSessionRegistration) {
    this.pruneExpired();
    this.sessions.set(input.sessionId, {
      ownerUserId: input.ownerUserId,
      messageId: input.messageId,
      componentCustomIds: input.componentCustomIds ? new Set(input.componentCustomIds) : undefined,
      modalCustomIds: input.modalCustomIds ? new Set(input.modalCustomIds) : undefined,
      expiresAt: Date.now() + Math.max(60_000, input.ttlMs ?? 15 * 60 * 1000),
    });
  }

  unregister(sessionId: string) {
    this.sessions.delete(sessionId);
  }

  owns(interaction: BaseInteraction): boolean {
    if (!isScopedInteraction(interaction)) return false;

    this.pruneExpired();

    for (const session of this.sessions.values()) {
      if (session.ownerUserId !== interaction.user.id) {
        continue;
      }

      if (interaction.isModalSubmit()) {
        if (session.modalCustomIds) {
          for (const customId of session.modalCustomIds) {
            if (interaction.customId === customId || interaction.customId.startsWith(customId)) {
              return true;
            }
          }
        }
        continue;
      }

      if (session.messageId && interaction.message.id !== session.messageId) {
        continue;
      }

      if (!session.componentCustomIds || session.componentCustomIds.size === 0) {
        return true;
      }

      if (session.componentCustomIds.has(interaction.customId)) {
        return true;
      }
    }

    return false;
  }

  private pruneExpired() {
    const now = Date.now();
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.expiresAt <= now) {
        this.sessions.delete(sessionId);
      }
    }
  }
}