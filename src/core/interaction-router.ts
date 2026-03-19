import { Interaction, MessageFlagsBitField } from 'discord.js';
import { logger } from './logger';
import { ToolsBotClient } from './tools-bot-client';
import { getBotConfig } from '../config/bot-config';
import { ANALYTICS_EVENT_COMMAND_INVOKED, ANALYTICS_EVENT_CONTEXT_INVOKED } from '@tmrxjd/platform/tools';

const commonResponses = getBotConfig().common.responses;

export function registerInteractionRouter(client: ToolsBotClient) {
  client.on('interactionCreate', async (interaction: Interaction) => {
    try {
      if (interaction.isChatInputCommand() || interaction.isMessageContextMenuCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) {
          logger.warn(`No command registered for ${interaction.commandName}`);
          if (interaction.isRepliable()) {
            await interaction.reply({ content: commonResponses.commandNotFound, flags: MessageFlagsBitField.Flags.Ephemeral }).catch(() => {});
          }
          return;
        }
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

      if (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit()) {
        if (client.scopedInteractionSessions.owns(interaction)) {
          return;
        }

        const handler = client.components.find(interaction);
        if (!handler) {
          logger.warn(`No global component handler registered for customId: ${interaction.customId}`);
          return;
        }
        await handler(interaction);
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
