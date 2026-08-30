import type { ChatInputCommandInteraction, MessageContextMenuCommandInteraction } from 'discord.js';
import { MessageFlagsBitField } from 'discord.js';
import { TrackerIdentityNotFoundError } from '@tmrxjd/platform/tools';
import { logger } from './logger';
import { resolveAppwriteUserIdForDiscord } from '../services/discord-identity-resolver';

export type CommandPipelineContext = {
  discordUserId: string;
  appwriteUserId: string | null;
};

export type CloudAwareCommandHandler = (
  interaction: ChatInputCommandInteraction | MessageContextMenuCommandInteraction,
  context: CommandPipelineContext,
) => Promise<void>;

const IDENTITY_LINK_MESSAGE = 'Link your Discord account on the Tower Run Tracker website before using cloud-backed commands.';

export async function runCloudAwareCommandPipeline(
  interaction: ChatInputCommandInteraction | MessageContextMenuCommandInteraction,
  handler: CloudAwareCommandHandler,
  options: { requireLinkedAccount?: boolean } = {},
): Promise<void> {
  const discordUserId = interaction.user.id;

  try {
    const appwriteUserId = await resolveAppwriteUserIdForDiscord(discordUserId, {
      requireLinked: options.requireLinkedAccount ?? false,
    });

    await handler(interaction, {
      discordUserId,
      appwriteUserId,
    });
  } catch (error) {
    if (error instanceof TrackerIdentityNotFoundError) {
      if (interaction.isRepliable()) {
        const payload = {
          content: IDENTITY_LINK_MESSAGE,
          flags: MessageFlagsBitField.Flags.Ephemeral,
        } as const;
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply({ content: payload.content }).catch(() => {});
        } else {
          await interaction.reply(payload).catch(() => {});
        }
      }
      return;
    }

    logger.error('Cloud-aware command pipeline failed', error);
    throw error;
  }
}
