import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import type { CommandModule } from '../core/command-types';
import type { ToolsBotClient } from '../core/tools-bot-client';
import { getBotConfig } from '../config/bot-config';
import { brandCommandEmbed } from '../services/command-embed-branding';
import { appendShareButtonRow, shareCurrentRender } from '../services/command-share';
import { showModalAndAwaitSubmit } from '../services/modal-submit';
import { renderTableChartPng } from '../services/table-chart-render';
import { getUserCommandSharedState, saveUserCommandSharedState } from '../services/user-command-shared-state';
import { resolveUserStorageState } from '../services/user-storage-resolution';
import {
  buildEnemyStatsChartRows,
  ENEMY_WAVE_TYPE_OPTIONS,
  isEnemyWaveType,
  normalizeEnemyStatsSharedState,
  resolveEnemyType,
  type EnemyStatsSharedState,
} from './enemy-stats-command-helpers';

const enemyStatsConfig = getBotConfig().commands.enemyStats;
const ENEMY_STATS_SHARE_BUTTON_ID = 'enemy_stats_share';
const ENEMY_STATS_TYPE_SELECT_ID = 'enemy_stats_type';
const TYPE_OPTION_NAME = 'type';

async function buildEnemyStatsAttachment(state: EnemyStatsSharedState, discordUserId: string): Promise<AttachmentBuilder | null> {
  try {
    const chart = buildEnemyStatsChartRows(state);
    const image = await renderTableChartPng({
      title: chart.chartTitle,
      headers: chart.headers,
      rows: chart.rows,
      descriptionLines: chart.descriptionLines,
    }, discordUserId);
    return new AttachmentBuilder(image, { name: 'enemy-stats.png' });
  } catch {
    return null;
  }
}

function buildInputsModal(state: EnemyStatsSharedState): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(enemyStatsConfig.ids.inputsModal)
    .setTitle('Enemy Stats Inputs')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId(enemyStatsConfig.ids.tierInput)
          .setLabel('Tier (1-24)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setValue(String(state.tier)),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId(enemyStatsConfig.ids.waveInput)
          .setLabel('Wave')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setValue(String(state.wave)),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId(enemyStatsConfig.ids.healthSkipInput)
          .setLabel('Health Skips — number, or % (e.g. 40%)')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setValue(state.healthSkipInput),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId(enemyStatsConfig.ids.attackSkipInput)
          .setLabel('Attack Skips — number, or % (e.g. 40%)')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setValue(state.attackSkipInput),
      ),
    );
}

const data = new SlashCommandBuilder()
  .setName(enemyStatsConfig.name)
  .setDescription('Enemy HP/damage/speed/mass for a wave — pick a type, set tier/wave/skips')
  .addStringOption(option => {
    option
      .setName(TYPE_OPTION_NAME)
      .setDescription('Enemy type to show')
      .setRequired(false);
    for (const enemyType of ENEMY_WAVE_TYPE_OPTIONS) {
      option.addChoices({ name: enemyType, value: enemyType });
    }
    return option;
  });

export const enemyStatsCommand: CommandModule = {
  data: data.toJSON(),
  async execute(interaction) {
    if (!interaction.isChatInputCommand()) {
      return;
    }

    // Acknowledge within Discord's 3s window BEFORE any cloud/storage reads.
    await interaction.deferReply({ ephemeral: true });

    const defaultState = normalizeEnemyStatsSharedState(null);
    const resolvedStorage = await resolveUserStorageState({
      discordUserId: interaction.user.id,
      load: storageId => getUserCommandSharedState(storageId, 'enemyStats', normalizeEnemyStatsSharedState),
      hasMeaningfulState: candidate => JSON.stringify(candidate) !== JSON.stringify(defaultState),
    });

    const storageUserId = resolvedStorage.storageUserId;
    let state: EnemyStatsSharedState = resolvedStorage.state;

    // A `type` option on the slash command selects the enemy up front.
    const requestedType = interaction.options.getString(TYPE_OPTION_NAME);
    if (requestedType && isEnemyWaveType(requestedType)) {
      state = normalizeEnemyStatsSharedState({ ...state, enemyType: requestedType });
    }

    const persistState = async () => {
      await saveUserCommandSharedState(storageUserId, 'enemyStats', state, normalizeEnemyStatsSharedState);
    };

    const createRender = async (): Promise<{ embed: EmbedBuilder; files: AttachmentBuilder[] }> => {
      const embed = brandCommandEmbed(new EmbedBuilder()
        .setTitle(enemyStatsConfig.ui.title)
        .setColor(enemyStatsConfig.color), enemyStatsConfig.name);
      const attachment = await buildEnemyStatsAttachment(state, storageUserId);
      if (!attachment) {
        embed.setDescription('Could not render enemy stats for these inputs.');
        return { embed, files: [] };
      }
      embed.setImage('attachment://enemy-stats.png');
      return { embed, files: [attachment] };
    };

    const buildComponents = () => {
      const typeRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(ENEMY_STATS_TYPE_SELECT_ID)
          .setPlaceholder('Switch enemy type')
          .addOptions(ENEMY_WAVE_TYPE_OPTIONS.map(enemyType => ({
            label: enemyType,
            value: enemyType,
            default: enemyType === resolveEnemyType(state),
          }))),
      );
      const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(enemyStatsConfig.ids.setInputs)
          .setLabel('Set Tier / Wave / Skips')
          .setStyle(ButtonStyle.Primary),
      );
      return appendShareButtonRow([typeRow, buttonRow], ENEMY_STATS_SHARE_BUTTON_ID);
    };

    const initialRender = await createRender();
    await interaction.editReply({ embeds: [initialRender.embed], components: buildComponents(), files: initialRender.files });
    void persistState();

    const reply = await interaction.fetchReply();
    if (!('createMessageComponentCollector' in reply)) {
      return;
    }

    const collector = reply.createMessageComponentCollector({
      time: enemyStatsConfig.behavior.collectorTimeoutMs,
      filter: i => i.user.id === interaction.user.id,
    });
    const client = interaction.client as ToolsBotClient;
    client.scopedInteractionSessions.register({
      sessionId: `enemy-stats:${interaction.id}`,
      ownerUserId: interaction.user.id,
      messageId: reply.id,
      modalCustomIds: [enemyStatsConfig.ids.inputsModal],
      ttlMs: enemyStatsConfig.behavior.collectorTimeoutMs,
    });

    const refreshRender = async () => {
      const updatedRender = await createRender();
      await interaction.editReply({ embeds: [updatedRender.embed], components: buildComponents(), files: updatedRender.files });
    };

    collector.on('collect', async componentInteraction => {
      if (componentInteraction.isButton() && componentInteraction.customId === ENEMY_STATS_SHARE_BUTTON_ID) {
        await shareCurrentRender(componentInteraction, {
          commandName: enemyStatsConfig.name,
          render: async () => {
            const rendered = await createRender();
            return { embeds: [rendered.embed], files: rendered.files };
          },
        });
        return;
      }

      if (componentInteraction.isStringSelectMenu() && componentInteraction.customId === ENEMY_STATS_TYPE_SELECT_ID) {
        const nextType = componentInteraction.values[0];
        if (!isEnemyWaveType(nextType)) {
          await componentInteraction.reply({ content: enemyStatsConfig.ui.notYourSession, ephemeral: true });
          return;
        }
        state = normalizeEnemyStatsSharedState({ ...state, enemyType: nextType });
        // Ack before the cloud write, or a slow persistState() expires the component.
        await componentInteraction.deferUpdate();
        await persistState();
        await refreshRender();
        return;
      }

      if (componentInteraction.isButton() && componentInteraction.customId === enemyStatsConfig.ids.setInputs) {
        const submitted = await showModalAndAwaitSubmit({
          componentInteraction,
          modal: buildInputsModal(state),
          baseCustomId: enemyStatsConfig.ids.inputsModal,
          userId: interaction.user.id,
          timeoutMs: enemyStatsConfig.behavior.modalSubmitTimeoutMs,
        });
        if (!submitted) {
          return;
        }

        const tier = Number.parseInt(submitted.fields.getTextInputValue(enemyStatsConfig.ids.tierInput), 10);
        const wave = Number.parseInt(submitted.fields.getTextInputValue(enemyStatsConfig.ids.waveInput), 10);
        const healthSkipInput = submitted.fields.getTextInputValue(enemyStatsConfig.ids.healthSkipInput);
        const attackSkipInput = submitted.fields.getTextInputValue(enemyStatsConfig.ids.attackSkipInput);

        state = normalizeEnemyStatsSharedState({
          ...state,
          tier: Number.isFinite(tier) ? tier : state.tier,
          wave: Number.isFinite(wave) ? wave : state.wave,
          healthSkipInput,
          attackSkipInput,
        });

        // Ack the modal submit before the cloud write.
        await submitted.deferUpdate();
        await persistState();
        await refreshRender();
        return;
      }

      await componentInteraction.reply({ content: enemyStatsConfig.ui.notYourSession, ephemeral: true });
    });

    collector.on('end', async () => {
      client.scopedInteractionSessions.unregister(`enemy-stats:${interaction.id}`);
      await interaction.editReply({ content: enemyStatsConfig.ui.sessionTimedOut, embeds: [], components: [], files: [] }).catch(() => {});
    });
  },
};
