import {

  ActionRowBuilder,

  AttachmentBuilder,

  ButtonBuilder,

  ButtonStyle,

  EmbedBuilder,

  LabelBuilder,

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

import { loadWorkshopTrackerElsLead } from '../services/workshop-tracker-lead';

import {

  applyWorkshopTrackerLead,

  battleConditionsFromSelectedValues,

  buildEnemyStatsChartRows,

  getEnemyStatsModeLabel,

  listEnemyStatsBattleConditionSelectOptions,

  listEnemyStatsPerkSelectOptions,

  normalizeEnemyStatsSharedState,

  perksFromSelectedValues,

  selectedBattleConditionValues,

  validateEnemyStatsInputs,

  type EnemyStatsSharedState,

  type SimplifiedEnemyStatsMode,

} from './enemy-stats-command-helpers';



const enemyStatsConfig = getBotConfig().commands.enemyStats;

const ENEMY_STATS_SHARE_BUTTON_ID = 'enemy_stats_share';



function isEnemyStatsMode(value: string | null): value is SimplifiedEnemyStatsMode {

  return value === 'wave' || value === 'hp' || value === 'damage' || value === 'els';

}



function getSelectedModalValue(

  submitted: NonNullable<Awaited<ReturnType<typeof showModalAndAwaitSubmit>>>,

  fieldId: string,

): string | null {

  try {

    return submitted.fields.getStringSelectValues(fieldId)[0] ?? null;

  } catch {

    return null;

  }

}



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



function buildLookupInputsModal(state: EnemyStatsSharedState): ModalBuilder {

  const rows = [

    new ActionRowBuilder<TextInputBuilder>().addComponents(

      new TextInputBuilder()

        .setCustomId(enemyStatsConfig.ids.tierInput)

        .setLabel(enemyStatsConfig.ui.tierLabel)

        .setStyle(TextInputStyle.Short)

        .setRequired(true)

        .setValue(String(state.tier)),

    ),

    new ActionRowBuilder<TextInputBuilder>().addComponents(

      new TextInputBuilder()

        .setCustomId(enemyStatsConfig.ids.healthSkipInput)

        .setLabel(enemyStatsConfig.ui.healthSkipLabel)

        .setStyle(TextInputStyle.Short)

        .setRequired(true)

        .setValue(String(state.healthSkipPct)),

    ),

    new ActionRowBuilder<TextInputBuilder>().addComponents(

      new TextInputBuilder()

        .setCustomId(enemyStatsConfig.ids.attackSkipInput)

        .setLabel(enemyStatsConfig.ui.attackSkipLabel)

        .setStyle(TextInputStyle.Short)

        .setRequired(true)

        .setValue(String(state.attackSkipPct)),

    ),

  ];



  if (state.mode === 'wave') {

    rows.unshift(new ActionRowBuilder<TextInputBuilder>().addComponents(

      new TextInputBuilder()

        .setCustomId(enemyStatsConfig.ids.waveInput)

        .setLabel(enemyStatsConfig.ui.waveLabel)

        .setStyle(TextInputStyle.Short)

        .setRequired(true)

        .setValue(String(state.wave)),

    ));

  } else if (state.mode === 'hp') {

    rows.unshift(new ActionRowBuilder<TextInputBuilder>().addComponents(

      new TextInputBuilder()

        .setCustomId(enemyStatsConfig.ids.targetHpInput)

        .setLabel(enemyStatsConfig.ui.targetHpLabel)

        .setStyle(TextInputStyle.Short)

        .setRequired(true)

        .setValue(state.targetHpVal),

    ));

  } else if (state.mode === 'damage') {

    rows.unshift(new ActionRowBuilder<TextInputBuilder>().addComponents(

      new TextInputBuilder()

        .setCustomId(enemyStatsConfig.ids.targetDamageInput)

        .setLabel(enemyStatsConfig.ui.targetDamageLabel)

        .setStyle(TextInputStyle.Short)

        .setRequired(true)

        .setValue(state.targetDamageVal),

    ));

  }



  return new ModalBuilder()

    .setCustomId(enemyStatsConfig.ids.inputsModal)

    .setTitle(enemyStatsConfig.ui.inputsModalTitle)

    .addComponents(...rows);

}



const data = new SlashCommandBuilder()

  .setName(enemyStatsConfig.name)

  .setDescription(enemyStatsConfig.description);



export const enemyStatsCommand: CommandModule = {

  data: data.toJSON(),

  async execute(interaction) {

    if (!interaction.isChatInputCommand()) {

      return;

    }



    // Acknowledge within Discord's 3s window BEFORE any cloud/storage reads, or a
    // slow round-trip expires the interaction ("Unknown interaction"). Defer first,
    // then do the work and editReply.
    await interaction.deferReply({ ephemeral: true });

    const defaultState = normalizeEnemyStatsSharedState(null);

    const resolvedStorage = await resolveUserStorageState({

      discordUserId: interaction.user.id,

      load: storageId => getUserCommandSharedState(storageId, 'enemyStats', normalizeEnemyStatsSharedState),

      hasMeaningfulState: candidate => JSON.stringify(candidate) !== JSON.stringify(defaultState),

    });



    const storageUserId = resolvedStorage.storageUserId;

    let state: EnemyStatsSharedState = resolvedStorage.state;

    const workshopLead = await loadWorkshopTrackerElsLead(storageUserId);

    const appliedLead = applyWorkshopTrackerLead(state, workshopLead);

    state = appliedLead.state;

    let loadedFromTracker = appliedLead.loadedFromTracker;



    const persistState = async () => {

      await saveUserCommandSharedState(storageUserId, 'enemyStats', state, normalizeEnemyStatsSharedState);

    };



    const createRender = async (): Promise<{ embed: EmbedBuilder; files: AttachmentBuilder[] }> => {

      const modeLabel = getEnemyStatsModeLabel(state.mode);

      const description = [

        enemyStatsConfig.ui.description,

        `Mode: ${modeLabel}`,

        loadedFromTracker && state.mode === 'els' ? enemyStatsConfig.ui.workshopLeadNote : null,

      ].filter(Boolean).join('\n\n');



      const embed = brandCommandEmbed(new EmbedBuilder()

        .setTitle(enemyStatsConfig.ui.title)

        .setDescription(description)

        .setColor(enemyStatsConfig.color), enemyStatsConfig.name);



      const attachment = await buildEnemyStatsAttachment(state, storageUserId);

      if (!attachment) {

        return { embed, files: [] };

      }



      embed.setImage('attachment://enemy-stats.png');

      return { embed, files: [attachment] };

    };



    const buildComponents = () => {

      const perkOptions = listEnemyStatsPerkSelectOptions().map(option => ({

        label: option.label.slice(0, 100),

        value: option.value,

        default: state[option.value],

      }));

      const bcOptions = listEnemyStatsBattleConditionSelectOptions().map(option => ({

        label: option.label.slice(0, 100),

        value: option.value,

        default: selectedBattleConditionValues(state).includes(option.value),

      }));



      const buttonRow = state.mode === 'els'

        ? new ActionRowBuilder<ButtonBuilder>().addComponents(

          new ButtonBuilder()

            .setCustomId(enemyStatsConfig.ids.setElsCore)

            .setLabel(enemyStatsConfig.ui.setElsCoreLabel)

            .setStyle(ButtonStyle.Primary),

          new ButtonBuilder()

            .setCustomId(enemyStatsConfig.ids.setElsBudget)

            .setLabel(enemyStatsConfig.ui.setElsBudgetLabel)

            .setStyle(ButtonStyle.Secondary),

        )

        : new ActionRowBuilder<ButtonBuilder>().addComponents(

          new ButtonBuilder()

            .setCustomId(enemyStatsConfig.ids.setInputs)

            .setLabel(enemyStatsConfig.ui.setInputsLabel)

            .setStyle(ButtonStyle.Primary),

        );



      return appendShareButtonRow([

        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(

          new StringSelectMenuBuilder()

            .setCustomId(enemyStatsConfig.ids.modeSelect)

            .setPlaceholder(enemyStatsConfig.ui.modePlaceholder)

            .addOptions(

              enemyStatsConfig.modeChoices.map(choice => ({

                label: choice.name,

                value: choice.value,

                default: state.mode === choice.value,

              })),

            ),

        ),

        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(

          new StringSelectMenuBuilder()

            .setCustomId(enemyStatsConfig.ids.perkSelect)

            .setPlaceholder(enemyStatsConfig.ui.perkPlaceholder)

            .setMinValues(0)

            .setMaxValues(perkOptions.length)

            .addOptions(perkOptions),

        ),

        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(

          new StringSelectMenuBuilder()

            .setCustomId(enemyStatsConfig.ids.battleConditionSelect)

            .setPlaceholder(enemyStatsConfig.ui.battleConditionPlaceholder)

            .setMinValues(0)

            .setMaxValues(bcOptions.length)

            .addOptions(bcOptions),

        ),

        buttonRow,

      ], ENEMY_STATS_SHARE_BUTTON_ID);

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

      modalCustomIds: [

        enemyStatsConfig.ids.inputsModal,

        enemyStatsConfig.ids.elsCoreModal,

        enemyStatsConfig.ids.elsBudgetModal,

      ],

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



      if (componentInteraction.isStringSelectMenu() && componentInteraction.customId === enemyStatsConfig.ids.modeSelect) {

        const nextMode = componentInteraction.values[0];

        if (!isEnemyStatsMode(nextMode)) {

          await componentInteraction.reply({ content: enemyStatsConfig.ui.notYourSession, ephemeral: true });

          return;

        }



        state = normalizeEnemyStatsSharedState({ ...state, mode: nextMode });

        // Acknowledge within Discord's 3s window BEFORE the cloud write; a slow
        // persistState() must never gate the ack or the component expires.
        await componentInteraction.deferUpdate();

        await persistState();

        await refreshRender();

        return;

      }



      if (componentInteraction.isStringSelectMenu() && componentInteraction.customId === enemyStatsConfig.ids.perkSelect) {

        const perks = perksFromSelectedValues(componentInteraction.values);

        state = normalizeEnemyStatsSharedState({ ...state, ...perks });

        // Acknowledge within Discord's 3s window BEFORE the cloud write; a slow
        // persistState() must never gate the ack or the component expires.
        await componentInteraction.deferUpdate();

        await persistState();

        await refreshRender();

        return;

      }



      if (componentInteraction.isStringSelectMenu() && componentInteraction.customId === enemyStatsConfig.ids.battleConditionSelect) {

        state = normalizeEnemyStatsSharedState({

          ...state,

          enabledBattleConditions: battleConditionsFromSelectedValues(componentInteraction.values),

        });

        // Acknowledge within Discord's 3s window BEFORE the cloud write; a slow
        // persistState() must never gate the ack or the component expires.
        await componentInteraction.deferUpdate();

        await persistState();

        await refreshRender();

        return;

      }



      if (!componentInteraction.isButton()) {

        await componentInteraction.reply({ content: enemyStatsConfig.ui.notYourSession, ephemeral: true });

        return;

      }



      if (componentInteraction.customId === enemyStatsConfig.ids.setInputs) {

        const submitted = await showModalAndAwaitSubmit({

          componentInteraction,

          modal: buildLookupInputsModal(state),

          baseCustomId: enemyStatsConfig.ids.inputsModal,

          userId: interaction.user.id,

          timeoutMs: enemyStatsConfig.behavior.modalSubmitTimeoutMs,

        });

        if (!submitted) {

          return;

        }



        const tier = Number.parseInt(submitted.fields.getTextInputValue(enemyStatsConfig.ids.tierInput), 10);

        const healthSkipPct = Number.parseInt(submitted.fields.getTextInputValue(enemyStatsConfig.ids.healthSkipInput), 10);

        const attackSkipPct = Number.parseInt(submitted.fields.getTextInputValue(enemyStatsConfig.ids.attackSkipInput), 10);

        const nextState: EnemyStatsSharedState = {

          ...state,

          tier,

          healthSkipPct,

          attackSkipPct,

        };



        if (state.mode === 'wave') {

          nextState.wave = Number.parseInt(submitted.fields.getTextInputValue(enemyStatsConfig.ids.waveInput), 10);

        } else if (state.mode === 'hp') {

          nextState.targetHpVal = submitted.fields.getTextInputValue(enemyStatsConfig.ids.targetHpInput);

        } else {

          nextState.targetDamageVal = submitted.fields.getTextInputValue(enemyStatsConfig.ids.targetDamageInput);

        }



        state = normalizeEnemyStatsSharedState(nextState);

        if (!validateEnemyStatsInputs(state)) {

          await submitted.reply({ content: enemyStatsConfig.ui.invalidInput, ephemeral: true });

          return;

        }



        // Acknowledge the modal submit BEFORE the cloud write, or a slow
        // persistState() blows its 3s window and the submit fails live.
        await submitted.deferUpdate();

        await persistState();

        await refreshRender();

        return;

      }



      if (componentInteraction.customId === enemyStatsConfig.ids.setElsCore) {

        const modal = new ModalBuilder()

          .setCustomId(enemyStatsConfig.ids.elsCoreModal)

          .setTitle(enemyStatsConfig.ui.elsCoreModalTitle)

          .addComponents(

            new ActionRowBuilder<TextInputBuilder>().addComponents(

              new TextInputBuilder()

                .setCustomId(enemyStatsConfig.ids.attackLevelInput)

                .setLabel(enemyStatsConfig.ui.attackLevelLabel)

                .setStyle(TextInputStyle.Short)

                .setRequired(true)

                .setValue(String(state.attackLevel)),

            ),

            new ActionRowBuilder<TextInputBuilder>().addComponents(

              new TextInputBuilder()

                .setCustomId(enemyStatsConfig.ids.healthLevelInput)

                .setLabel(enemyStatsConfig.ui.healthLevelLabel)

                .setStyle(TextInputStyle.Short)

                .setRequired(true)

                .setValue(String(state.healthLevel)),

            ),

            new ActionRowBuilder<TextInputBuilder>().addComponents(

              new TextInputBuilder()

                .setCustomId(enemyStatsConfig.ids.enhancementLevelInput)

                .setLabel(enemyStatsConfig.ui.enhancementLevelLabel)

                .setStyle(TextInputStyle.Short)

                .setRequired(true)

                .setValue(String(state.enhancementLevel)),

            ),

            new ActionRowBuilder<TextInputBuilder>().addComponents(

              new TextInputBuilder()

                .setCustomId(enemyStatsConfig.ids.referenceWaveInput)

                .setLabel(enemyStatsConfig.ui.referenceWaveLabel)

                .setStyle(TextInputStyle.Short)

                .setRequired(true)

                .setValue(String(state.referenceWave)),

            ),

            new LabelBuilder()

              .setLabel(enemyStatsConfig.ui.focusLabel)

              .setStringSelectMenuComponent(

                new StringSelectMenuBuilder()

                  .setCustomId(enemyStatsConfig.ids.focusSelect)

                  .setPlaceholder(enemyStatsConfig.ui.focusPlaceholder)

                  .setMinValues(1)

                  .setMaxValues(1)

                  .addOptions(

                    enemyStatsConfig.focusChoices.map(choice => ({

                      label: choice.name,

                      value: choice.value,

                      default: state.focus === choice.value,

                    })),

                  ),

              ),

          );



        const submitted = await showModalAndAwaitSubmit({

          componentInteraction,

          modal,

          baseCustomId: enemyStatsConfig.ids.elsCoreModal,

          userId: interaction.user.id,

          timeoutMs: enemyStatsConfig.behavior.modalSubmitTimeoutMs,

        });

        if (!submitted) {

          return;

        }



        const attackLevel = Number.parseInt(submitted.fields.getTextInputValue(enemyStatsConfig.ids.attackLevelInput), 10);

        const healthLevel = Number.parseInt(submitted.fields.getTextInputValue(enemyStatsConfig.ids.healthLevelInput), 10);

        const enhancementLevel = Number.parseInt(submitted.fields.getTextInputValue(enemyStatsConfig.ids.enhancementLevelInput), 10);

        const referenceWave = Number.parseInt(submitted.fields.getTextInputValue(enemyStatsConfig.ids.referenceWaveInput), 10);

        const focus = getSelectedModalValue(submitted, enemyStatsConfig.ids.focusSelect);



        if (

          !Number.isFinite(attackLevel) || attackLevel < 0

          || !Number.isFinite(healthLevel) || healthLevel < 0

          || !Number.isFinite(enhancementLevel) || enhancementLevel < 0

          || !Number.isFinite(referenceWave) || referenceWave < 1

          || (focus !== 'combined' && focus !== 'attack' && focus !== 'health')

        ) {

          await submitted.reply({ content: enemyStatsConfig.ui.invalidElsCoreInput, ephemeral: true });

          return;

        }



        state = normalizeEnemyStatsSharedState({

          ...state,

          attackLevel,

          healthLevel,

          enhancementLevel,

          referenceWave,

          focus,

        });

        loadedFromTracker = false;

        // Acknowledge the modal submit BEFORE the cloud write, or a slow
        // persistState() blows its 3s window and the submit fails live.
        await submitted.deferUpdate();

        await persistState();

        await refreshRender();

        return;

      }



      if (componentInteraction.customId === enemyStatsConfig.ids.setElsBudget) {

        const modal = new ModalBuilder()

          .setCustomId(enemyStatsConfig.ids.elsBudgetModal)

          .setTitle(enemyStatsConfig.ui.elsBudgetModalTitle)

          .addComponents(

            new ActionRowBuilder<TextInputBuilder>().addComponents(

              new TextInputBuilder()

                .setCustomId(enemyStatsConfig.ids.utilityDiscountInput)

                .setLabel(enemyStatsConfig.ui.utilityDiscountLabel)

                .setStyle(TextInputStyle.Short)

                .setRequired(true)

                .setValue(String(state.utilityDiscountPct)),

            ),

            new ActionRowBuilder<TextInputBuilder>().addComponents(

              new TextInputBuilder()

                .setCustomId(enemyStatsConfig.ids.enhancementDiscountInput)

                .setLabel(enemyStatsConfig.ui.enhancementDiscountLabel)

                .setStyle(TextInputStyle.Short)

                .setRequired(true)

                .setValue(String(state.enhancementDiscountPct)),

            ),

            new ActionRowBuilder<TextInputBuilder>().addComponents(

              new TextInputBuilder()

                .setCustomId(enemyStatsConfig.ids.vaultDiscountInput)

                .setLabel(enemyStatsConfig.ui.vaultDiscountLabel)

                .setStyle(TextInputStyle.Short)

                .setRequired(true)

                .setValue(String(state.enhancementVaultDiscountPct)),

            ),

            new ActionRowBuilder<TextInputBuilder>().addComponents(

              new TextInputBuilder()

                .setCustomId(enemyStatsConfig.ids.coinBudgetInput)

                .setLabel(enemyStatsConfig.ui.coinBudgetLabel)

                .setStyle(TextInputStyle.Short)

                .setRequired(false)

                .setValue(state.coinBudgetVal),

            ),

          );



        const submitted = await showModalAndAwaitSubmit({

          componentInteraction,

          modal,

          baseCustomId: enemyStatsConfig.ids.elsBudgetModal,

          userId: interaction.user.id,

          timeoutMs: enemyStatsConfig.behavior.modalSubmitTimeoutMs,

        });

        if (!submitted) {

          return;

        }



        const utilityDiscountPct = Number.parseInt(submitted.fields.getTextInputValue(enemyStatsConfig.ids.utilityDiscountInput), 10);

        const enhancementDiscountPct = Number.parseInt(submitted.fields.getTextInputValue(enemyStatsConfig.ids.enhancementDiscountInput), 10);

        const enhancementVaultDiscountPct = Number.parseInt(submitted.fields.getTextInputValue(enemyStatsConfig.ids.vaultDiscountInput), 10);

        const coinBudgetVal = submitted.fields.getTextInputValue(enemyStatsConfig.ids.coinBudgetInput);



        if (

          !Number.isFinite(utilityDiscountPct) || utilityDiscountPct < 0 || utilityDiscountPct > 100

          || !Number.isFinite(enhancementDiscountPct) || enhancementDiscountPct < 0 || enhancementDiscountPct > 100

          || !Number.isFinite(enhancementVaultDiscountPct) || enhancementVaultDiscountPct < 0 || enhancementVaultDiscountPct > 100

        ) {

          await submitted.reply({ content: enemyStatsConfig.ui.invalidElsBudgetInput, ephemeral: true });

          return;

        }



        state = normalizeEnemyStatsSharedState({

          ...state,

          utilityDiscountPct,

          enhancementDiscountPct,

          enhancementVaultDiscountPct,

          coinBudgetVal,

        });

        // Acknowledge the modal submit BEFORE the cloud write, or a slow
        // persistState() blows its 3s window and the submit fails live.
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


