import { Interaction, MessageFlagsBitField } from 'discord.js';
import { logger } from './logger';
import { ToolsBotClient } from './tools-bot-client';
import { getBotConfig } from '../config/bot-config';
import { ANALYTICS_EVENT_COMMAND_INVOKED, ANALYTICS_EVENT_CONTEXT_INVOKED } from '@tmrxjd/platform/tools';
import { resolveAppwriteUserIdForDiscord } from '../services/discord-identity-resolver';

const commonResponses = getBotConfig().common.responses;

export function registerInteractionRouter(client: ToolsBotClient) {
  client.on('interactionCreate', async (interaction: Interaction) => {
    try {
      if (interaction.isAutocomplete()) {
        const command = client.commands.get(interaction.commandName);
        if (!command?.autocomplete) {
          return;
        }

        await command.autocomplete(interaction);
        return;
      }

      if (interaction.isChatInputCommand() || interaction.isMessageContextMenuCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) {
          logger.warn(`No command registered for ${interaction.commandName}`);
          if (interaction.isRepliable()) {
            await interaction.reply({ content: commonResponses.commandNotFound, flags: MessageFlagsBitField.Flags.Ephemeral }).catch(() => {});
          }
          return;
        }
        await resolveAppwriteUserIdForDiscord(interaction.user.id).catch(() => null);
        await command.execute(interaction);
        client.persistence?.analytics.log({
          commandName: interaction.commandName,
          userId: interaction.user.id,
          guildId: interaction.guildId ?? undefined,
          event: interaction.isMessageContextMenuCommand()
            ? ANALYTICS_EVENT_CONTEXT_INVOKED
            : ANALYTICS_EVENT_COMMAND_INVOKED,
        }).catch(error => {
          logger.warn('Failed to record analytics event', error);
        });
        return;
      }

      if (
        interaction.isButton()
        || interaction.isStringSelectMenu()
        || interaction.isUserSelectMenu()
        || interaction.isRoleSelectMenu()
        || interaction.isMentionableSelectMenu()
        || interaction.isChannelSelectMenu()
        || interaction.isModalSubmit()
      ) {
        if (client.scopedInteractionSessions.owns(interaction)) {
          return;
        }

        const handled = await client.components.dispatch(interaction);
        if (!handled) {
          return;
        }
      }
    } catch (error) {
      logger.error('Interaction handling error', error);
      if (interaction.isRepliable()) {
        const alreadyAcked = interaction.replied || interaction.deferred;
        const payload = {
          content: commonResponses.interactionError,
          flags: MessageFlagsBitField.Flags.Ephemeral,
        } as const;
        if (alreadyAcked) {
          await interaction.editReply({ content: payload.content }).catch(() => {});
        } else {
          await interaction.reply(payload).catch(() => {});
        }
      }
    }
  });
}
