import { SlashCommandBuilder } from 'discord.js';
import type { CommandModule } from '../core/command-types';
import { getAppConfig } from '../config';
import { getBotConfig } from '../config/bot-config';
import { logger } from '../core/logger';
import { getEightBallAiResponse } from '../services/eight-ball-ai';

const eightBallConfig = getBotConfig().commands.eightBall;

function pickLocalEightBallFallback(): string {
  const responses = Array.isArray(eightBallConfig.responses) ? eightBallConfig.responses : [];
  if (responses.length === 0) {
    return eightBallConfig.aiErrorResponse;
  }

  const index = Math.floor(Math.random() * responses.length);
  return responses[index] ?? eightBallConfig.aiErrorResponse;
}

const data = new SlashCommandBuilder()
  .setName(eightBallConfig.name)
  .setDescription(eightBallConfig.description)
  .addStringOption(option =>
    option
      .setName(eightBallConfig.options.message.name)
      .setDescription(eightBallConfig.options.message.description)
      .setRequired(true)
  );

export const eightBallCommand: CommandModule = {
  data: data.toJSON(),
  async execute(interaction) {
    if (!interaction.isChatInputCommand()) {
      return;
    }

    const message = interaction.options.getString(eightBallConfig.options.message.name, true).trim();
    if (eightBallConfig.behavior.deferReply) {
      await interaction.deferReply({ ephemeral: eightBallConfig.behavior.ephemeral });
    }

    try {
      const apiKey = String(getAppConfig().ai.cloudApiKey || '').trim();
      if (!apiKey) {
        throw new Error('cloud reasoning API key is not configured');
      }

      const answer = await getEightBallAiResponse(message, apiKey);
      const content = eightBallConfig.responseTemplate
        .replace('{question}', message)
        .replace('{answer}', answer);

      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content });
        return;
      }

      await interaction.reply({
        content,
        ephemeral: eightBallConfig.behavior.ephemeral,
      });
      return;
    } catch (error) {
      logger.warn('8ball cloud reasoning failed; falling back to local answers', error);
      const fallbackContent = eightBallConfig.responseTemplate
        .replace('{question}', message)
        .replace('{answer}', pickLocalEightBallFallback());
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: fallbackContent });
        return;
      }
      await interaction.reply({
        content: fallbackContent,
        ephemeral: eightBallConfig.behavior.ephemeral,
      });
    }
  },
};
