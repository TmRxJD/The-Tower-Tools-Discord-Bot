import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  LabelBuilder,
  ModalBuilder,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  type APIEmbedField,
} from 'discord.js';
import {
  buildDefaultShardSplitterSnapshot,
  computeShardSplitResult,
  type ConfigurableCell,
  type ConfigurableTableDocument,
  formatLargeNumber,
  formatMultiplier,
  getLevelCapForRarity,
  MODULE_RARITIES,
  type ModuleRarity,
  type ModuleType,
} from '@tmrxjd/platform/tools';
import { createChatInputCommand } from '../core/command-factory';
import { createCommandEmbed } from '../core/command-ui';
import { getBotConfig } from '../config/bot-config';
import { brandCommandEmbed } from '../services/command-embed-branding';
import { appendShareButtonRow, shareCurrentRender } from '../services/command-share';
import { renderConfigurableTablePng } from '../services/table-chart-render';
import { getUserShardSplitterState, reconcileUserShardSplitterState, saveUserShardSplitterState } from '../services/user-shard-splitter-db';
import { resolveUserStorageState } from '../services/user-storage-resolution';
import { runCloudReconcileUi } from '../services/cloud-reconcile-ui';
import { showModalAndAwaitSubmit } from '../services/modal-submit';
import type { ToolsBotClient } from '../core/tools-bot-client';

const shardSplitterConfig = getBotConfig().commands.shardSplitter;
const SHARD_SHARE_BUTTON_ID = 'shard_share';

function moduleLabel(moduleType: ModuleType): string {
  return shardSplitterConfig.moduleChoices.find(choice => choice.value === moduleType)?.name ?? moduleType;
}

function isKnownRarity(value: string): value is (typeof MODULE_RARITIES)[number] {
  return (MODULE_RARITIES as readonly string[]).includes(value);
}

function pickNextCandidate(result: ReturnType<typeof computeShardSplitResult>) {
  if (result.nextAltRows.length > 0) {
    const extraShardsNeeded = result.nextSplitInfo?.extraShardsNeeded;
    return {
      row: result.nextAltRows[0],
      tag: shardSplitterConfig.ui.nextBestExtraTemplate.replace(
        '{extra}',
        extraShardsNeeded === undefined ? '?' : formatLargeNumber(extraShardsNeeded),
      ),
    };
  }

  if (result.nextSplitInfo?.row) {
    return {
      row: result.nextSplitInfo.row,
      tag: shardSplitterConfig.ui.nextBestExtraTemplate.replace(
        '{extra}',
        formatLargeNumber(result.nextSplitInfo.extraShardsNeeded),
      ),
    };
  }

  return null;
}

function computeCurrentResult(args: {
  moduleType: ModuleType;
  splitData: {
    primaryLevel: number;
    secondaryLevel: number;
    primaryRarity: string;
    secondaryRarity: string;
    unspentShards: number | null;
  };
  assistEffPct: number;
  shardDiscount: number;
}) {
  const primaryRarity = isKnownRarity(args.splitData.primaryRarity)
    ? args.splitData.primaryRarity
    : MODULE_RARITIES[0];
  const secondaryRarity = isKnownRarity(args.splitData.secondaryRarity)
    ? args.splitData.secondaryRarity
    : MODULE_RARITIES[0];

  return computeShardSplitResult({
    moduleType: args.moduleType,
    primaryLevel: args.splitData.primaryLevel,
    secondaryLevel: args.splitData.secondaryLevel,
    primaryRarity,
    secondaryRarity,
    assistEffPct: args.assistEffPct,
    unspentShards: args.splitData.unspentShards ?? 0,
    shardDiscount: args.shardDiscount,
  });
}

function buildChartDocument(args: {
  moduleType: ModuleType;
  best: ReturnType<typeof computeShardSplitResult>['rows'][number] | undefined;
  next: ReturnType<typeof pickNextCandidate>;
}): ConfigurableTableDocument {
  const best = args.best;
  const next = args.next?.row;

  const headerRow: ConfigurableCell[] = [
    { value: shardSplitterConfig.ui.chartMetricHeader, styleLink: 'allHeaders' },
    { value: shardSplitterConfig.ui.chartBestHeader, styleLink: 'allHeaders' },
    { value: shardSplitterConfig.ui.chartNextHeader, styleLink: 'allHeaders' },
  ];

  const rows: ConfigurableCell[][] = [
    headerRow,
    [
      { value: shardSplitterConfig.ui.metricPrimaryTarget },
      { value: best ? String(best.primaryTarget) : '-' },
      { value: next ? String(next.primaryTarget) : '-' },
    ],
    [
      { value: shardSplitterConfig.ui.metricAssistTarget },
      { value: best ? String(best.secondaryTarget) : '-' },
      { value: next ? String(next.secondaryTarget) : '-' },
    ],
    [
      { value: shardSplitterConfig.ui.metricPrimarySpent },
      { value: best ? formatLargeNumber(best.shardsPrimary) : '-' },
      { value: next ? formatLargeNumber(next.shardsPrimary) : '-' },
    ],
    [
      { value: shardSplitterConfig.ui.metricAssistSpent },
      { value: best ? formatLargeNumber(best.shardsSecondary) : '-' },
      { value: next ? formatLargeNumber(next.shardsSecondary) : '-' },
    ],
    [
      { value: shardSplitterConfig.ui.metricRemaining },
      { value: best ? formatLargeNumber(best.remaining) : '-' },
      { value: next ? formatLargeNumber(next.remaining) : '-' },
    ],
    [
      { value: shardSplitterConfig.ui.metricEffective },
      { value: best ? formatMultiplier((best.totalEffective / 100) + 1, 3, 'x') : '-' },
      { value: next ? formatMultiplier((next.totalEffective / 100) + 1, 3, 'x') : '-' },
    ],
  ];

  return {
    title: shardSplitterConfig.ui.chartTitleTemplate
      .replace('{module}', moduleLabel(args.moduleType)),
    colWidths: [190, 130, 130],
    rows,
  };
}

const data = new SlashCommandBuilder()
  .setName(shardSplitterConfig.name)
  .setDescription(shardSplitterConfig.description)
  .addStringOption(option => {
    const built = option
      .setName(shardSplitterConfig.options.type.name)
      .setDescription(shardSplitterConfig.options.type.description)
      .setRequired(false);

    for (const choice of shardSplitterConfig.moduleChoices) {
      built.addChoices({ name: choice.name, value: choice.value });
    }

    return built;
  })
  .addIntegerOption(option =>
    option
      .setName(shardSplitterConfig.options.assistEff.name)
      .setDescription(shardSplitterConfig.options.assistEff.description)
      .setRequired(false)
      .setMinValue(0)
      .setMaxValue(100),
  )
  .addIntegerOption(option =>
    option
      .setName(shardSplitterConfig.options.unspentShards.name)
      .setDescription(shardSplitterConfig.options.unspentShards.description)
      .setRequired(false)
      .setMinValue(0),
  )
  .addIntegerOption(option =>
    option
      .setName(shardSplitterConfig.options.primaryLevel.name)
      .setDescription(shardSplitterConfig.options.primaryLevel.description)
      .setRequired(false)
      .setMinValue(1),
  )
  .addIntegerOption(option =>
    option
      .setName(shardSplitterConfig.options.assistLevel.name)
      .setDescription(shardSplitterConfig.options.assistLevel.description)
      .setRequired(false)
      .setMinValue(1),
  );

export const shardSplitterCommand = createChatInputCommand(data, async interaction => {
  // Acknowledge within Discord's 3s window BEFORE any cloud/storage reads.
  await interaction.deferReply({ ephemeral: true });

  const discordUserId = interaction.user.id;
  const hasMeaningfulShardState = (candidate: Awaited<ReturnType<typeof getUserShardSplitterState>>): boolean => {
    const defaults = buildDefaultShardSplitterSnapshot();
    return JSON.stringify(candidate.snapshot) !== JSON.stringify(defaults);
  };

  const resolvedStorage = await resolveUserStorageState({
    discordUserId,
    load: getUserShardSplitterState,
    hasMeaningfulState: hasMeaningfulShardState,
  });

  const storageUserId = resolvedStorage.storageUserId;
  let persistedState = resolvedStorage.state;

  const linked = storageUserId !== discordUserId;

  const quickType = interaction.options.getString(shardSplitterConfig.options.type.name) as ModuleType | null;
  const quickAssistEff = interaction.options.getInteger(shardSplitterConfig.options.assistEff.name);
  const quickUnspent = interaction.options.getInteger(shardSplitterConfig.options.unspentShards.name);
  const quickPrimaryLevel = interaction.options.getInteger(shardSplitterConfig.options.primaryLevel.name);
  const quickAssistLevel = interaction.options.getInteger(shardSplitterConfig.options.assistLevel.name);

  if (quickType) {
    persistedState.snapshot.selectedModuleType = quickType;
  }

  const quickActiveModule = persistedState.snapshot.selectedModuleType;
  const quickData = persistedState.snapshot.splitterByType[quickActiveModule];

  if (quickAssistEff !== null) {
    const clampedAssist = Math.max(0, Math.min(100, Math.floor(quickAssistEff)));
    quickData.assistEffPct = clampedAssist;
    persistedState.snapshot.costsAssistEffPctByType[quickActiveModule] = clampedAssist;
  }

  if (quickUnspent !== null) {
    quickData.unspentShards = Math.max(0, Math.floor(quickUnspent));
    quickData.budget = null;
  }

  if (quickPrimaryLevel !== null) {
    const primaryCap = getLevelCapForRarity(quickData.primaryRarity);
    quickData.primaryLevel = Math.max(1, Math.min(primaryCap, Math.floor(quickPrimaryLevel)));
  }

  if (quickAssistLevel !== null) {
    const assistCap = getLevelCapForRarity(quickData.secondaryRarity);
    quickData.secondaryLevel = Math.max(1, Math.min(assistCap, Math.floor(quickAssistLevel)));
  }

  if (quickType || quickAssistEff !== null || quickUnspent !== null || quickPrimaryLevel !== null || quickAssistLevel !== null) {
    await saveUserShardSplitterState(storageUserId, persistedState);
  }

  const getActive = () => {
    const moduleType = persistedState.snapshot.selectedModuleType;
    const splitData = persistedState.snapshot.splitterByType[moduleType];
    const assistByType = persistedState.snapshot.costsAssistEffPctByType[moduleType];
    return {
      moduleType,
      splitData,
      assistByType,
    };
  };

  const createRender = async (): Promise<{ embedFields: APIEmbedField[]; attachment: AttachmentBuilder | null }> => {
    const active = getActive();
    const splitData = active.splitData;

    const result = computeShardSplitResult({
      moduleType: active.moduleType,
      primaryLevel: splitData.primaryLevel,
      secondaryLevel: splitData.secondaryLevel,
      primaryRarity: splitData.primaryRarity,
      secondaryRarity: splitData.secondaryRarity,
      assistEffPct: active.assistByType,
      unspentShards: splitData.unspentShards ?? 0,
      shardDiscount: persistedState.snapshot.shardDiscount,
    });

    const best = result.rows[0];
    const next = pickNextCandidate(result);

    const fields: APIEmbedField[] = [
      {
        name: shardSplitterConfig.ui.currentModuleField,
        value: moduleLabel(active.moduleType),
        inline: true,
      },
      {
        name: shardSplitterConfig.ui.discountField,
        value: `${persistedState.snapshot.shardDiscount}%`,
        inline: true,
      },
      {
        name: shardSplitterConfig.ui.assistField,
        value: `${active.assistByType}%`,
        inline: true,
      },
      {
        name: shardSplitterConfig.ui.currentRarityField,
        value: `${splitData.primaryRarity} / ${splitData.secondaryRarity}`,
        inline: true,
      },
      {
        name: shardSplitterConfig.ui.currentLevelsField,
        value: `${splitData.primaryLevel} / ${splitData.secondaryLevel}`,
        inline: true,
      },
      {
        name: shardSplitterConfig.ui.unspentField,
        value: formatLargeNumber(splitData.unspentShards ?? 0),
        inline: true,
      },
      {
        name: shardSplitterConfig.ui.budgetField,
        value: shardSplitterConfig.ui.budgetValueTemplate
          .replace('{base}', formatLargeNumber(result.baseCostAtCurrentLevels))
          .replace('{total}', formatLargeNumber(result.splitBudget)),
        inline: true,
      },
      {
        name: shardSplitterConfig.ui.bestField,
        value: best
          ? shardSplitterConfig.ui.bestValueTemplate
            .replace('{p}', best.primaryTarget.toString())
            .replace('{s}', best.secondaryTarget.toString())
            .replace('{remain}', formatLargeNumber(best.remaining))
          : shardSplitterConfig.ui.noResult,
        inline: true,
      },
      {
        name: shardSplitterConfig.ui.nextField,
        value: next
          ? shardSplitterConfig.ui.nextValueTemplate
            .replace('{tag}', next.tag)
            .replace('{p}', next.row.primaryTarget.toString())
            .replace('{s}', next.row.secondaryTarget.toString())
            .replace('{remain}', formatLargeNumber(next.row.remaining))
          : shardSplitterConfig.ui.noResult,
        inline: true,
      },
    ];

    let attachment: AttachmentBuilder | null = null;
    try {
      const document = buildChartDocument({
        moduleType: active.moduleType,
        best,
        next,
      });
      const image = await renderConfigurableTablePng(document, interaction.user.id);
      attachment = new AttachmentBuilder(image, { name: shardSplitterConfig.ui.chartFileName });
    } catch {
      attachment = null;
    }

    return {
      embedFields: fields,
      attachment,
    };
  };

  const buildComponents = () => appendShareButtonRow([
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(shardSplitterConfig.ids.moduleSelect)
        .setPlaceholder(shardSplitterConfig.ui.modulePlaceholder)
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(
          shardSplitterConfig.moduleChoices.map(choice => ({
            label: choice.name,
            value: choice.value,
            default: persistedState.snapshot.selectedModuleType === choice.value,
          })),
        ),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(shardSplitterConfig.ids.settingsButton)
        .setLabel(shardSplitterConfig.ui.settingsButtonLabel)
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(shardSplitterConfig.ids.levelsButton)
        .setLabel(shardSplitterConfig.ui.levelsButtonLabel)
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(shardSplitterConfig.ids.setButton)
        .setLabel(shardSplitterConfig.ui.setButtonLabel)
        .setStyle(ButtonStyle.Success),
    ),
  ], SHARD_SHARE_BUTTON_ID);

  const buildRenderPayload = async () => {
    const rendered = await createRender();
    const embed = brandCommandEmbed(createCommandEmbed({
      title: shardSplitterConfig.ui.title,
      description: linked
        ? shardSplitterConfig.ui.description
        : shardSplitterConfig.ui.unlinkedDescription,
      color: shardSplitterConfig.color,
      fields: rendered.embedFields,
    }), shardSplitterConfig.name);

    if (rendered.attachment) {
      embed.setImage(`attachment://${shardSplitterConfig.ui.chartFileName}`);
    }

    return {
      embeds: [embed],
      components: buildComponents(),
      files: rendered.attachment ? [rendered.attachment] : [],
      ephemeral: true,
    };
  };

  const renderAndReply = async () => {
    const payload = await buildRenderPayload();

    // Always an edit: the interaction is deferred up front, so the first render
    // resolves the defer and every refresh edits the same reply.
    await interaction.editReply(payload);
  };

  await renderAndReply();

  void (async () => {
    const reconcile = await reconcileUserShardSplitterState(storageUserId);
    await runCloudReconcileUi<typeof persistedState>({
      interaction,
      promptKey: 'shard-sync',
      userId: interaction.user.id,
      autoCloudEnabled: reconcile.autoCloudEnabled,
      direction: reconcile.direction,
      hasDifference: reconcile.hasDifference,
      cloudState: reconcile.cloudState,
      applyCloudToLocal: reconcile.applyCloudToLocal,
      applyLocalToCloud: reconcile.applyLocalToCloud,
      onCloudApplied: async (next) => {
        persistedState = next;
        await renderAndReply();
      },
    });
  })();

  const reply = await interaction.fetchReply();
  if (!('createMessageComponentCollector' in reply)) {
    return;
  }

  const collector = reply.createMessageComponentCollector({
    time: shardSplitterConfig.behavior.collectorTimeoutMs,
    filter: i => i.user.id === interaction.user.id,
  });
  const client = interaction.client as ToolsBotClient;
  const scopedSessionId = `shard:${interaction.id}`;
  client.scopedInteractionSessions.register({
    sessionId: scopedSessionId,
    ownerUserId: interaction.user.id,
    messageId: reply.id,
    modalCustomIds: [shardSplitterConfig.ids.settingsModal, shardSplitterConfig.ids.levelsModal],
    ttlMs: shardSplitterConfig.behavior.collectorTimeoutMs,
  });

  collector.on('collect', async componentInteraction => {
    if (componentInteraction.user.id !== interaction.user.id) {
      await componentInteraction.reply({ content: shardSplitterConfig.ui.notYourSession, ephemeral: true });
      return;
    }

    if (componentInteraction.isButton() && componentInteraction.customId === SHARD_SHARE_BUTTON_ID) {
      await shareCurrentRender(componentInteraction, {
        commandName: shardSplitterConfig.name,
        render: async () => {
          const payload = await buildRenderPayload();
          return { embeds: payload.embeds, files: payload.files };
        },
      });
      return;
    }

    if (componentInteraction.isStringSelectMenu() && componentInteraction.customId === shardSplitterConfig.ids.moduleSelect) {
      const selected = componentInteraction.values[0] as ModuleType;
      persistedState.snapshot.selectedModuleType = selected;
      await saveUserShardSplitterState(storageUserId, persistedState);
      await componentInteraction.deferUpdate();
      await renderAndReply();
      return;
    }

    if (!componentInteraction.isButton()) {
      await componentInteraction.deferUpdate();
      return;
    }

    if (componentInteraction.customId === shardSplitterConfig.ids.settingsButton) {
      const active = getActive();
      const modal = new ModalBuilder()
        .setCustomId(shardSplitterConfig.ids.settingsModal)
        .setTitle(shardSplitterConfig.ui.settingsModalTitle)
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId(shardSplitterConfig.ids.inputShardDiscount)
              .setLabel(shardSplitterConfig.ui.inputShardDiscountLabel)
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setValue(String(persistedState.snapshot.shardDiscount)),
          ),
          new LabelBuilder()
            .setLabel(shardSplitterConfig.ui.inputPrimaryRarityLabel)
            .setStringSelectMenuComponent(
              new StringSelectMenuBuilder()
                .setCustomId(shardSplitterConfig.ids.inputPrimaryRarity)
                .setPlaceholder(shardSplitterConfig.ui.primaryRarityPlaceholder)
                .setMinValues(1)
                .setMaxValues(1)
                .addOptions(
                  MODULE_RARITIES.map((rarity: ModuleRarity) => ({
                    label: rarity,
                    value: rarity,
                    default: active.splitData.primaryRarity === rarity,
                  })),
                ),
            ),
          new LabelBuilder()
            .setLabel(shardSplitterConfig.ui.inputSecondaryRarityLabel)
            .setStringSelectMenuComponent(
              new StringSelectMenuBuilder()
                .setCustomId(shardSplitterConfig.ids.inputSecondaryRarity)
                .setPlaceholder(shardSplitterConfig.ui.assistRarityPlaceholder)
                .setMinValues(1)
                .setMaxValues(1)
                .addOptions(
                  MODULE_RARITIES.map((rarity: ModuleRarity) => ({
                    label: rarity,
                    value: rarity,
                    default: active.splitData.secondaryRarity === rarity,
                  })),
                ),
            ),
        );

      const submitted = await showModalAndAwaitSubmit({
        componentInteraction,
        modal,
        baseCustomId: shardSplitterConfig.ids.settingsModal,
        userId: interaction.user.id,
        timeoutMs: shardSplitterConfig.behavior.modalSubmitTimeoutMs,
      });
      if (!submitted) {
        return;
      }

      const activeModule = persistedState.snapshot.selectedModuleType;
      const currentModuleState = persistedState.snapshot.splitterByType[activeModule];
      const nextDiscount = Number.parseInt(submitted.fields.getTextInputValue(shardSplitterConfig.ids.inputShardDiscount), 10);
      let nextPrimaryRarity = currentModuleState.primaryRarity;
      let nextSecondaryRarity = currentModuleState.secondaryRarity;

      try {
        const selectedPrimary = submitted.fields.getStringSelectValues(shardSplitterConfig.ids.inputPrimaryRarity)[0];
        if (selectedPrimary) {
          nextPrimaryRarity = selectedPrimary;
        }
      } catch {
        nextPrimaryRarity = currentModuleState.primaryRarity;
      }

      try {
        const selectedSecondary = submitted.fields.getStringSelectValues(shardSplitterConfig.ids.inputSecondaryRarity)[0];
        if (selectedSecondary) {
          nextSecondaryRarity = selectedSecondary;
        }
      } catch {
        nextSecondaryRarity = currentModuleState.secondaryRarity;
      }

      if (
        !Number.isFinite(nextDiscount)
        || nextDiscount < 0
        || nextDiscount > 30
      ) {
        await submitted.reply({ content: shardSplitterConfig.ui.invalidSettingsInput, ephemeral: true });
        return;
      }

      if (!isKnownRarity(nextPrimaryRarity) || !isKnownRarity(nextSecondaryRarity)) {
        await submitted.reply({
          content: shardSplitterConfig.ui.invalidRarityTemplate.replace('{rarities}', MODULE_RARITIES.join(', ')),
          ephemeral: true,
        });
        return;
      }

      persistedState.snapshot.splitterByType[activeModule] = {
        ...persistedState.snapshot.splitterByType[activeModule],
        primaryRarity: nextPrimaryRarity,
        secondaryRarity: nextSecondaryRarity,
        budget: null,
      };
      persistedState.snapshot.shardDiscount = nextDiscount;

      await saveUserShardSplitterState(storageUserId, persistedState);
      await submitted.deferUpdate();
      await renderAndReply();
      return;
    }

    if (componentInteraction.customId === shardSplitterConfig.ids.levelsButton) {
      const active = getActive();
      const modal = new ModalBuilder()
        .setCustomId(shardSplitterConfig.ids.levelsModal)
        .setTitle(shardSplitterConfig.ui.levelsModalTitle)
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId(shardSplitterConfig.ids.inputAssistEff)
              .setLabel(shardSplitterConfig.ui.inputAssistEffLabel)
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setValue(String(active.assistByType)),
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId(shardSplitterConfig.ids.inputUnspentShards)
              .setLabel(shardSplitterConfig.ui.inputUnspentShardsLabel)
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setValue(String(active.splitData.unspentShards ?? 0)),
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId(shardSplitterConfig.ids.inputPrimaryLevel)
              .setLabel(shardSplitterConfig.ui.inputPrimaryLevelLabel)
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setValue(String(active.splitData.primaryLevel)),
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId(shardSplitterConfig.ids.inputSecondaryLevel)
              .setLabel(shardSplitterConfig.ui.inputSecondaryLevelLabel)
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setValue(String(active.splitData.secondaryLevel)),
          ),
        );

      const submitted = await showModalAndAwaitSubmit({
        componentInteraction,
        modal,
        baseCustomId: shardSplitterConfig.ids.levelsModal,
        userId: interaction.user.id,
        timeoutMs: shardSplitterConfig.behavior.modalSubmitTimeoutMs,
      });
      if (!submitted) {
        return;
      }

      const nextAssist = Number.parseInt(submitted.fields.getTextInputValue(shardSplitterConfig.ids.inputAssistEff), 10);
      const nextUnspent = Number.parseInt(submitted.fields.getTextInputValue(shardSplitterConfig.ids.inputUnspentShards), 10);
      const nextPrimaryLevel = Number.parseInt(submitted.fields.getTextInputValue(shardSplitterConfig.ids.inputPrimaryLevel), 10);
      const nextSecondaryLevel = Number.parseInt(submitted.fields.getTextInputValue(shardSplitterConfig.ids.inputSecondaryLevel), 10);
      const activeModule = persistedState.snapshot.selectedModuleType;
      const currentData = persistedState.snapshot.splitterByType[activeModule];
      const primaryCap = getLevelCapForRarity(currentData.primaryRarity);
      const secondaryCap = getLevelCapForRarity(currentData.secondaryRarity);

      if (
        !Number.isFinite(nextUnspent)
        || !Number.isFinite(nextAssist)
        || !Number.isFinite(nextPrimaryLevel)
        || !Number.isFinite(nextSecondaryLevel)
        || nextAssist < 0
        || nextAssist > 100
        || nextUnspent < 0
        || nextPrimaryLevel < 1
        || nextSecondaryLevel < 1
          || nextPrimaryLevel > primaryCap
          || nextSecondaryLevel > secondaryCap
        ) {
          await submitted.reply({ content: shardSplitterConfig.ui.invalidLevelsInput, ephemeral: true });
          return;
        }

      persistedState.snapshot.splitterByType[activeModule] = {
        ...persistedState.snapshot.splitterByType[activeModule],
        assistEffPct: nextAssist,
        unspentShards: nextUnspent,
        primaryLevel: nextPrimaryLevel,
        secondaryLevel: nextSecondaryLevel,
        budget: null,
      };
      persistedState.snapshot.costsAssistEffPctByType[activeModule] = nextAssist;

      await saveUserShardSplitterState(storageUserId, persistedState);
      await submitted.deferUpdate();
      await renderAndReply();
      return;
    }

    if (componentInteraction.customId === shardSplitterConfig.ids.setButton) {
      const activeModule = persistedState.snapshot.selectedModuleType;
      const currentData = persistedState.snapshot.splitterByType[activeModule];
      const assistEff = persistedState.snapshot.costsAssistEffPctByType[activeModule];
      const result = computeCurrentResult({
        moduleType: activeModule,
        splitData: currentData,
        assistEffPct: assistEff,
        shardDiscount: persistedState.snapshot.shardDiscount,
      });

      const suggested = result.rows[0];
      if (!suggested) {
        await componentInteraction.reply({ content: shardSplitterConfig.ui.noResult, ephemeral: true });
        return;
      }

      await componentInteraction.deferUpdate();

      persistedState.snapshot.splitterByType[activeModule] = {
        ...currentData,
        primaryLevel: suggested.primaryTarget,
        secondaryLevel: suggested.secondaryTarget,
        unspentShards: Math.max(0, Math.floor(suggested.remaining)),
        budget: null,
      };

      await saveUserShardSplitterState(storageUserId, persistedState);
      await renderAndReply();
      return;
    }
  });

  collector.on('end', async () => {
    client.scopedInteractionSessions.unregister(scopedSessionId);
    await interaction.editReply({ components: [] }).catch(() => {});
  });
});
