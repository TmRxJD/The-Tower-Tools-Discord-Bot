import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type InteractionEditReplyOptions,
  type InteractionReplyOptions,
  type MessageCreateOptions,
  SlashCommandBuilder,
} from 'discord.js';
import type { CommandModule } from '../core/command-types';
import { getBotConfig } from '../config/bot-config';
import { logger } from '../core/logger';
import {
  toDiscordCommandEditPayload,
  toDiscordCommandReplyPayload,
} from '../services/discord-command-ui-renderer';
import { runTrackerAiAskCommand } from '../services/trackerai-ask';

const askConfig = getBotConfig().commands.ask;
const toolsHubConfig = getBotConfig().common.toolsHub;
const ASK_SHARE_BUTTON_ID = 'ask_share';
const ASK_EMBED_FOOTER = 'Powered by CatGPT';
const ASK_SHARED_EMBED_FOOTER = `${ASK_EMBED_FOOTER}\nUse /ask to learn more about The Tower`;

function withAskEmbedBranding(
  payload: InteractionReplyOptions | InteractionEditReplyOptions,
  { shared = false }: { shared?: boolean } = {},
): InteractionReplyOptions | InteractionEditReplyOptions {
  const embeds = Array.isArray(payload.embeds)
    ? payload.embeds.map(embed => {
        const nextEmbed = EmbedBuilder.from(embed);
        if (nextEmbed.data.title) {
          nextEmbed.setURL(toolsHubConfig.siteUrl);
        }
        nextEmbed.setFooter({
          text: shared ? ASK_SHARED_EMBED_FOOTER : ASK_EMBED_FOOTER,
        });
        return nextEmbed;
      })
    : [];

  return {
    ...payload,
    embeds,
  };
}

function withShareButton(payload: InteractionReplyOptions | InteractionEditReplyOptions): InteractionReplyOptions | InteractionEditReplyOptions {
  const shareButton = new ButtonBuilder()
    .setCustomId(ASK_SHARE_BUTTON_ID)
    .setLabel('Share')
    .setStyle(ButtonStyle.Secondary);

  const nextComponents = Array.isArray(payload.components)
    ? [...payload.components]
    : [];

  if (nextComponents.length < 5) {
    nextComponents.push(new ActionRowBuilder<ButtonBuilder>().addComponents(shareButton));
  }

  return {
    ...payload,
    components: nextComponents,
  };
}

function toPublicSharePayload(payload: InteractionReplyOptions | InteractionEditReplyOptions): MessageCreateOptions {
  const brandedPayload = withAskEmbedBranding(payload, { shared: true });
  return {
    content: typeof brandedPayload.content === 'string' ? brandedPayload.content : '',
    embeds: Array.isArray(brandedPayload.embeds) ? brandedPayload.embeds : [],
    files: Array.isArray(brandedPayload.files) ? brandedPayload.files : [],
  };
}

async function attachAskShareCollector(
  interaction: Parameters<CommandModule['execute']>[0],
  payload: InteractionReplyOptions | InteractionEditReplyOptions,
): Promise<void> {
  const replyMessage = await interaction.fetchReply();
  if (!('createMessageComponentCollector' in replyMessage)) {
    return;
  }

  const collector = replyMessage.createMessageComponentCollector({
    time: 15 * 60 * 1000,
    filter: componentInteraction => componentInteraction.user.id === interaction.user.id && componentInteraction.customId === ASK_SHARE_BUTTON_ID,
  });

  collector.on('collect', async componentInteraction => {
    if (!componentInteraction.isButton()) {
      return;
    }

    const channel = componentInteraction.channel;
    if (!channel?.isTextBased() || !('send' in channel)) {
      await componentInteraction.reply({
        content: 'Unable to share this response in the current channel.',
        ephemeral: true,
      });
      return;
    }

    try {
      await componentInteraction.deferUpdate();
      await channel.send(toPublicSharePayload(payload));
    } catch (error) {
      logger.warn('ask share failed', error);
      if (componentInteraction.deferred || componentInteraction.replied) {
        await componentInteraction.followUp({
          content: 'Unable to share this response right now.',
          ephemeral: true,
        });
        return;
      }

      if (!componentInteraction.replied && !componentInteraction.deferred) {
        await componentInteraction.reply({
          content: 'Unable to share this response right now.',
          ephemeral: true,
        });
      }
    }
  });
}

const data = new SlashCommandBuilder()
  .setName(askConfig.name)
  .setDescription(askConfig.description)
  .addStringOption(option =>
    option
      .setName(askConfig.options.message.name)
      .setDescription(askConfig.options.message.description)
      .setRequired(true)
  )
  .addBooleanOption(option =>
    option
      .setName(askConfig.options.deepReasoning.name)
      .setDescription(askConfig.options.deepReasoning.description)
      .setRequired(false)
  );

export const askCommand: CommandModule = {
  data: data.toJSON(),
  async execute(interaction) {
    if (!interaction.isChatInputCommand()) {
      return;
    }

    const message = interaction.options.getString(askConfig.options.message.name, true).trim();
    const deepReasoning = interaction.options.getBoolean(askConfig.options.deepReasoning.name) === true;
    if (askConfig.behavior.deferReply) {
      await interaction.deferReply({ ephemeral: askConfig.behavior.ephemeral });
    }

    try {
      const daemonResponse = await runTrackerAiAskCommand({
        message,
        deepReasoning,
        userId: interaction.user.id,
        username: interaction.user.username,
      });

      const replyPayload = withShareButton(
        withAskEmbedBranding(
          interaction.deferred || interaction.replied
            ? toDiscordCommandEditPayload(daemonResponse)
            : toDiscordCommandReplyPayload(daemonResponse),
        ),
      );

      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(replyPayload as InteractionEditReplyOptions);
        await attachAskShareCollector(interaction, replyPayload);
        return;
      }

      await interaction.reply(replyPayload as InteractionReplyOptions);
      await attachAskShareCollector(interaction, replyPayload);
    } catch (error) {
      logger.warn('ask daemon command failed', error);
      const fallback = askConfig.aiErrorResponse;
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: fallback });
        return;
      }
      await interaction.reply({
        content: fallback,
        ephemeral: askConfig.behavior.ephemeral,
      });
    }
  },
};
