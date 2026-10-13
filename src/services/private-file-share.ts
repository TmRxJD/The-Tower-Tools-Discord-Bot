import { MessageFlags, type ChatInputCommandInteraction, type ButtonInteraction, type InteractionEditReplyOptions, type MessageCreateOptions } from 'discord.js';
import { createShareButtonRow } from './command-share';

export const PRIVATE_FILE_SHARE_PREFIX = 'private-file-share:';
export const PRIVATE_FILE_SHARE_TTL = 10 * 60 * 1000;
type Status = 'available' | 'sending' | 'shared' | 'uncertain' | 'failed';
interface Session {
  ownerId: string;
  channelId: string | null;
  messageId?: string;
  expiresAt: number;
  status: Status;
  payload: MessageCreateOptions;
  edit: (payload: InteractionEditReplyOptions) => Promise<unknown>;
}

/** Short-lived, owner-bound shares routed by the persistent component registry. */
export class PrivateFileShares {
  private readonly sessions = new Map<string, Session>();

  async offer(interaction: ChatInputCommandInteraction, payload: MessageCreateOptions): Promise<void> {
    const customId = PRIVATE_FILE_SHARE_PREFIX + interaction.id;
    const session: Session = {
      ownerId: interaction.user.id, channelId: interaction.channelId,
      expiresAt: Date.now() + PRIVATE_FILE_SHARE_TTL, status: 'available', payload,
      edit: update => interaction.editReply(update),
    };
    this.sessions.set(customId, session);
    try {
      const row = createShareButtonRow(customId);
      row.components[0].setLabel('Share');
      const message = await interaction.editReply({
        content: payload.content, files: payload.files, allowedMentions: { parse: [] }, components: [row],
      });
      session.messageId = message.id;
    } catch (error) {
      this.sessions.delete(customId);
      throw error;
    }
    const timer = setTimeout(() => {
      this.sessions.delete(customId);
      if (session.status === 'available') {
        void session.edit({ content: 'Share expired. Run /acronyms all again to share.', components: [] }).catch(() => {});
      }
    }, PRIVATE_FILE_SHARE_TTL);
    timer.unref();
  }

  async handle(interaction: ButtonInteraction): Promise<void> {
    const session = this.sessions.get(interaction.customId);
    const privateReply = (content: string) => interaction.reply({ content, flags: MessageFlags.Ephemeral }).catch(() => {});
    if (!session || session.expiresAt <= Date.now()) {
      await privateReply('This share has expired. Run /acronyms all again.');
      return;
    }
    if (interaction.user.id !== session.ownerId || interaction.channelId !== session.channelId || interaction.message.id !== session.messageId) {
      await privateReply('Only the person who requested this file can share it from the original reply.');
      return;
    }
    if (session.status !== 'available') {
      await privateReply(session.status === 'shared' ? 'Already shared in this channel.' : 'This share was already attempted. Check the channel before requesting another copy.');
      return;
    }
    // Claim synchronously before acknowledging, so racing/repeated clicks cannot send twice.
    session.status = 'sending';
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    } catch {
      session.status = 'failed';
      await session.edit({ content: 'Share could not be acknowledged. Run /acronyms all again.', components: [] }).catch(() => {});
      return; // Expired/uncertain acknowledgements must never lead to a public send.
    }
    const finish = async (content: string) => {
      await Promise.allSettled([
        session.edit({ content, components: [] }),
        interaction.editReply({ content }),
      ]);
    };
    const channel = interaction.channel;
    if (!channel || !('send' in channel)) {
      session.status = 'failed';
      await finish('Unable to share a file in this channel.');
      return;
    }
    try {
      await channel.send({
        ...session.payload, allowedMentions: { parse: [] },
        nonce: interaction.customId.slice(PRIVATE_FILE_SHARE_PREFIX.length), enforceNonce: true,
      });
    } catch {
      // Transport errors can happen after Discord accepted the message: never retry blindly.
      session.status = 'uncertain';
      await finish('Share could not be confirmed. Check this channel before requesting another copy; this button will not retry.');
      return;
    }
    session.status = 'shared';
    await finish('Shared in this channel.');
  }
}

export const privateFileShares = new PrivateFileShares();
