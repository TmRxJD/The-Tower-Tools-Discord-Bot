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
import {
  ABSOLUTE_MAX_MODULE_LEVEL,
  buildModuleCalculatorView,
  type ConfigurableCell,
  type ConfigurableTableDocument,
  createDefaultModuleCalculatorState,
  formatCoin,
  formatModuleMultiplierVisualRounded,
  formatShard,
  normalizeModuleCalculatorState,
  moduleRarityItems,
  moduleTypeItems,
  resolveRarityLabel,
  type ModuleCalculatorState,
  type ModuleType,
} from '@tmrxjd/platform/tools';
import { getBotConfig } from '../config/bot-config';
import { brandCommandEmbed } from '../services/command-embed-branding';
import { appendShareButtonRow, shareCurrentRender } from '../services/command-share';
import { renderConfigurableTablePng } from '../services/table-chart-render';
import { getUserCommandSharedState, reconcileUserCommandSharedState, saveUserCommandSharedState } from '../services/user-command-shared-state';
import { resolveUserStorageState } from '../services/user-storage-resolution';
import { runCloudReconcileUi } from '../services/cloud-reconcile-ui';
import { showModalAndAwaitSubmit } from '../services/modal-submit';

const moduleConfig = getBotConfig().commands.module;
const MODULE_SHARE_BUTTON_ID = 'module_share';
type ModuleCalcViewMode = 'primary' | 'assist';

function moduleTypeLabel(moduleType: ModuleType): string {
  return moduleTypeItems.find(item => item.value === moduleType)?.title ?? moduleType;
}

function buildSummary(view: ReturnType<typeof buildModuleCalculatorView>, activeView: ModuleCalcViewMode): string {
  return moduleConfig.ui.summaryTemplate
    .replace('{moduleType}', moduleTypeLabel(view.state.moduleType))
    .replace('{viewLabel}', activeView === 'primary' ? 'Primary Calc' : 'Assist Calc')
    .replace('{rarity}', view.state.rarity)
    .replace('{from}', view.state.currentLevel.toString())
    .replace('{to}', view.state.targetLevel.toString())
    .replace('{assistEff}', view.state.assistEffPct.toString())
    .replace('{assistRarity}', view.state.assistRarity)
    .replace('{assistFrom}', view.state.assistCurrentLevel.toString())
    .replace('{assistTo}', view.state.assistTargetLevel.toString())
    .replace('{coinDiscount}', view.state.coinDiscount.toString())
    .replace('{shardDiscount}', view.state.shardDiscount.toString());
}

function buildTotals(view: ReturnType<typeof buildModuleCalculatorView>): string {
  return moduleConfig.ui.totalsTemplate
    .replace('{primaryCoinTotal}', formatCoin(view.primaryCoinTotal))
    .replace('{primaryShardTotal}', formatShard(view.primaryShardTotal))
    .replace('{assistCoinTotal}', formatCoin(view.assistCoinTotal))
    .replace('{assistShardTotal}', formatShard(view.assistShardTotal))
    .replace('{assistStoneTotal}', formatShard(view.assistStoneTotal))
    .replace('{rows}', Math.max(view.primaryRows.length, view.assistRows.length).toString());
}

function updatePrimaryState(state: ModuleCalculatorState, values: {
  coinDiscount: number;
  shardDiscount: number;
  rarity: string;
  currentLevel: number;
  targetLevel: number;
}): ModuleCalculatorState {
  const activeType = state.moduleType;
  return normalizeModuleCalculatorState({
    ...state,
    coinDiscount: values.coinDiscount,
    shardDiscount: values.shardDiscount,
    lastRarityByType: {
      ...state.lastRarityByType,
      [activeType]: values.rarity,
    },
    currentLevelByType: {
      ...state.currentLevelByType,
      [activeType]: values.currentLevel,
    },
    targetLevelByType: {
      ...state.targetLevelByType,
      [activeType]: values.targetLevel,
    },
  });
}

function updateAssistState(state: ModuleCalculatorState, values: {
  assistEffPct: number;
  assistRarity: string;
  assistCurrentLevel: number;
  assistTargetLevel: number;
}): ModuleCalculatorState {
  const activeType = state.moduleType;
  return normalizeModuleCalculatorState({
    ...state,
    lastAssistRarityByType: {
      ...state.lastAssistRarityByType,
      [activeType]: values.assistRarity,
    },
    assistEffPctByType: {
      ...state.assistEffPctByType,
      [activeType]: values.assistEffPct,
    },
    assistCurrentLevelByType: {
      ...state.assistCurrentLevelByType,
      [activeType]: values.assistCurrentLevel,
    },
    assistTargetLevelByType: {
      ...state.assistTargetLevelByType,
      [activeType]: values.assistTargetLevel,
    },
  });
}

function getSelectedModalValue(
  submitted: Awaited<ReturnType<typeof showModalAndAwaitSubmit>>,
  fieldId: string,
): string | null {
  if (!submitted) return null;
  try {
    return submitted.fields.getStringSelectValues(fieldId)[0] ?? null;
  } catch {
    return null;
  }
}

async function buildModuleTableAttachment(args: {
  document: ConfigurableTableDocument;
  discordUserId: string;
}): Promise<AttachmentBuilder | null> {
  try {
    const image = await renderConfigurableTablePng(args.document, args.discordUserId);
    return new AttachmentBuilder(image, { name: 'module-costs.png' });
  } catch {
    return null;
  }
}

function buildPreviewRows<T>(rows: T[], previewRows: number): T[] {
  if (rows.length <= previewRows) {
    return rows;
  }
  return rows.slice(0, previewRows);
}

function toHeaderCell(value: string): ConfigurableCell {
  return { value, styleLink: 'allHeaders' };
}

function toWrappedHeaderLabel(value: string): string {
  return value.trim().split(/\s+/).join('\n');
}

function toCenteredTitleCell(value: string): ConfigurableCell {
  return {
    value,
    styleLink: 'allHeaders',
    style: {
      align: 'center',
      bold: true,
      wrap: true,
    },
  };
}

function toBodyCell(value: string): ConfigurableCell {
  return { value };
}

function buildModuleTableDocument(view: ReturnType<typeof buildModuleCalculatorView>, summary: string, activeView: ModuleCalcViewMode): ConfigurableTableDocument {
  const previewRows = Math.max(3, moduleConfig.behavior.previewRows);
  const primaryPreviewRows = buildPreviewRows(view.primaryRows, previewRows);
  const assistPreviewRows = buildPreviewRows(view.assistRows, previewRows);

  const section = activeView === 'primary'
    ? {
      title: undefined,
      merges: [{ row: 0, col: 0, rowSpan: 1, colSpan: 8 }],
      rows: [
        [toCenteredTitleCell(`Primary • Rarity ${view.state.rarity}`)],
        [
          toHeaderCell('Lvl'),
          toHeaderCell('Bonus'),
          toHeaderCell('Assist'),
          toHeaderCell(toWrappedHeaderLabel('Assist Target')),
          toHeaderCell('Shard Cost'),
          toHeaderCell(toWrappedHeaderLabel('Total Shard')),
          toHeaderCell('Coin Cost'),
          toHeaderCell(toWrappedHeaderLabel('Total Coin')),
        ],
        ...primaryPreviewRows.map(row => [
          toBodyCell(row.level.toString()),
          toBodyCell(formatModuleMultiplierVisualRounded(row.bonus, view.state.moduleType)),
          toBodyCell(formatModuleMultiplierVisualRounded(row.bonusAssistCurrent, view.state.moduleType)),
          toBodyCell(formatModuleMultiplierVisualRounded(row.bonusAssistTarget, view.state.moduleType)),
          toBodyCell(formatShard(row.shard)),
          toBodyCell(formatShard(row.cumulativeShard)),
          toBodyCell(formatCoin(row.coin)),
          toBodyCell(formatCoin(row.cumulativeCoin)),
        ]),
      ],
      footerLines: [
        `Rows shown: ${primaryPreviewRows.length}/${view.primaryRows.length}`,
        `Current ${formatModuleMultiplierVisualRounded(view.primaryCurrentBonus, view.state.moduleType)} -> Target ${formatModuleMultiplierVisualRounded(view.primaryTargetBonus, view.state.moduleType)}`,
        `Assist Target ${formatModuleMultiplierVisualRounded(view.primaryCurrentBonusWithAssistTarget, view.state.moduleType)} -> ${formatModuleMultiplierVisualRounded(view.primaryTargetBonusWithAssistTarget, view.state.moduleType)}`,
      ],
    }
    : {
      title: undefined,
      merges: [{ row: 0, col: 0, rowSpan: 1, colSpan: 9 }],
      rows: [
        [toCenteredTitleCell(`Assist • Rarity ${view.state.assistRarity}`)],
        [
          toHeaderCell('Lvl'),
          toHeaderCell(toWrappedHeaderLabel('Base Bonus')),
          toHeaderCell(toWrappedHeaderLabel('Effective Bonus')),
          toHeaderCell('Stones'),
          toHeaderCell(toWrappedHeaderLabel('Total Stone')),
          toHeaderCell('Shard Cost'),
          toHeaderCell(toWrappedHeaderLabel('Total Shard')),
          toHeaderCell('Coin Cost'),
          toHeaderCell(toWrappedHeaderLabel('Total Coin')),
        ],
        ...assistPreviewRows.map(row => [
          toBodyCell(row.level.toString()),
          toBodyCell(formatModuleMultiplierVisualRounded(row.baseBonus, view.state.moduleType)),
          toBodyCell(formatModuleMultiplierVisualRounded(row.effectiveBonus, view.state.moduleType)),
          toBodyCell(formatShard(row.stones)),
          toBodyCell(formatShard(row.cumulativeStones)),
          toBodyCell(formatShard(row.shard)),
          toBodyCell(formatShard(row.cumulativeShard)),
          toBodyCell(formatCoin(row.coin)),
          toBodyCell(formatCoin(row.cumulativeCoin)),
        ]),
      ],
      footerLines: [
        `Rows shown: ${assistPreviewRows.length}/${view.assistRows.length}`,
        `Base ${formatModuleMultiplierVisualRounded(view.assistBaseCurrentBonus, view.state.moduleType)} -> ${formatModuleMultiplierVisualRounded(view.assistBaseTargetBonus, view.state.moduleType)}`,
        `Effective ${formatModuleMultiplierVisualRounded(view.assistEffectiveCurrentBonus, view.state.moduleType)} -> ${formatModuleMultiplierVisualRounded(view.assistEffectiveTargetBonus, view.state.moduleType)}`,
      ],
    };

  return {
    title: `${moduleTypeLabel(view.state.moduleType)} Module Costs`,
    rows: [],
    footerLines: [summary],
    sections: [section],
  };
}

const data = new SlashCommandBuilder()
  .setName(moduleConfig.name)
  .setDescription(moduleConfig.description)
  .addIntegerOption(option =>
    option
      .setName(moduleConfig.options.currentLevel.name)
      .setDescription(moduleConfig.options.currentLevel.description)
      .setMinValue(1)
      .setMaxValue(ABSOLUTE_MAX_MODULE_LEVEL)
      .setRequired(false)
  )
  .addIntegerOption(option =>
    option
      .setName(moduleConfig.options.targetLevel.name)
      .setDescription(moduleConfig.options.targetLevel.description)
      .setMinValue(1)
      .setMaxValue(ABSOLUTE_MAX_MODULE_LEVEL)
      .setRequired(false)
  )
  .addIntegerOption(option =>
    option
      .setName(moduleConfig.options.coinDiscount.name)
      .setDescription(moduleConfig.options.coinDiscount.description)
      .setMinValue(0)
      .setMaxValue(100)
      .setRequired(false)
  )
  .addIntegerOption(option =>
    option
      .setName(moduleConfig.options.shardDiscount.name)
      .setDescription(moduleConfig.options.shardDiscount.description)
      .setMinValue(0)
      .setMaxValue(100)
      .setRequired(false)
  );

export const moduleCommand: CommandModule = {
  data: data.toJSON(),
  async execute(interaction) {
    if (!interaction.isChatInputCommand()) {
      return;
    }

    const defaultState = createDefaultModuleCalculatorState();
    const hasMeaningfulState = (candidate: ModuleCalculatorState): boolean => (
      JSON.stringify(candidate) !== JSON.stringify(defaultState)
    );
    const resolvedStorage = await resolveUserStorageState({
      discordUserId: interaction.user.id,
      load: (storageId) => getUserCommandSharedState(storageId, 'module', normalizeModuleCalculatorState),
      hasMeaningfulState,
    });

    const storageUserId = resolvedStorage.storageUserId;
    let moduleState = resolvedStorage.state;
    let activeView: ModuleCalcViewMode = 'primary';

    const requestedCurrentLevel = interaction.options.getInteger(moduleConfig.options.currentLevel.name);
    const requestedTargetLevel = interaction.options.getInteger(moduleConfig.options.targetLevel.name);
    const requestedCoinDiscount = interaction.options.getInteger(moduleConfig.options.coinDiscount.name);
    const requestedShardDiscount = interaction.options.getInteger(moduleConfig.options.shardDiscount.name);
    const hasCommandOverrides = requestedCurrentLevel !== null
      || requestedTargetLevel !== null
      || requestedCoinDiscount !== null
      || requestedShardDiscount !== null;

    if (hasCommandOverrides) {
      const activeType = moduleState.moduleType;
      moduleState = normalizeModuleCalculatorState({
        ...moduleState,
        coinDiscount: requestedCoinDiscount ?? moduleState.coinDiscount,
        shardDiscount: requestedShardDiscount ?? moduleState.shardDiscount,
        currentLevelByType: {
          ...moduleState.currentLevelByType,
          [activeType]: requestedCurrentLevel ?? moduleState.currentLevelByType[activeType],
        },
        targetLevelByType: {
          ...moduleState.targetLevelByType,
          [activeType]: requestedTargetLevel ?? moduleState.targetLevelByType[activeType],
        },
      });
    }

    const applyState = (next: ModuleCalculatorState) => {
      moduleState = normalizeModuleCalculatorState(next as unknown as Record<string, unknown>);
    };

    const persistState = async () => {
      await saveUserCommandSharedState(storageUserId, 'module', moduleState, normalizeModuleCalculatorState);
    };

    const createRender = async (): Promise<{ embed: EmbedBuilder; files: AttachmentBuilder[] }> => {
      const view = buildModuleCalculatorView(moduleState);
      const summary = buildSummary(view, activeView);
      const embed = brandCommandEmbed(new EmbedBuilder()
        .setTitle(moduleConfig.ui.title)
        .setDescription(`${moduleConfig.ui.description}\n\n${summary}`)
        .addFields(
          { name: moduleConfig.ui.totalsFieldName, value: buildTotals(view), inline: false },
        )
        .setColor(moduleConfig.color), moduleConfig.name);
      const attachment = await buildModuleTableAttachment({
        document: buildModuleTableDocument(view, summary, activeView),
        discordUserId: storageUserId,
      });

      if (!attachment) {
        return { embed, files: [] };
      }

      embed.setImage('attachment://module-costs.png');
      return { embed, files: [attachment] };
    };

    const buildComponents = () => appendShareButtonRow([
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(moduleConfig.ids.moduleTypeSelect)
          .setPlaceholder(moduleConfig.ui.moduleTypePlaceholder)
          .setMinValues(1)
          .setMaxValues(1)
          .addOptions(
            moduleTypeItems.map(item => ({
              label: item.title,
              value: item.value,
              default: moduleState.moduleType === item.value,
            })),
          ),
      ),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(moduleConfig.ids.primaryValues)
          .setLabel(moduleConfig.ui.primaryValuesLabel)
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(moduleConfig.ids.assistValues)
          .setLabel(moduleConfig.ui.assistValuesLabel)
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(moduleConfig.ids.toggleView)
          .setLabel(activeView === 'primary' ? moduleConfig.ui.viewAssistLabel : moduleConfig.ui.viewPrimaryLabel)
          .setStyle(ButtonStyle.Success),
      ),
    ], MODULE_SHARE_BUTTON_ID);

    await interaction.deferReply({ ephemeral: true });
    const initialRender = await createRender();

    await interaction.editReply({
      embeds: [initialRender.embed],
      components: buildComponents(),
      files: initialRender.files,
    });

    if (hasCommandOverrides) {
      void persistState();
    }

    void (async () => {
      const reconcile = await reconcileUserCommandSharedState(storageUserId, 'module', normalizeModuleCalculatorState);
      await runCloudReconcileUi<ModuleCalculatorState>({
        interaction,
        promptKey: 'module-sync',
        userId: interaction.user.id,
        autoCloudEnabled: reconcile.autoCloudEnabled,
        direction: reconcile.direction,
        hasDifference: reconcile.hasDifference,
        cloudState: reconcile.cloudState,
        applyCloudToLocal: reconcile.applyCloudToLocal,
        applyLocalToCloud: reconcile.applyLocalToCloud,
        onCloudApplied: async (next) => {
          applyState(next);
          const updatedRender = await createRender();
          await interaction.editReply({ embeds: [updatedRender.embed], components: buildComponents(), files: updatedRender.files });
        },
      });
    })();

    const reply = await interaction.fetchReply();
    if (!('createMessageComponentCollector' in reply)) {
      return;
    }

    const collector = reply.createMessageComponentCollector({
      time: moduleConfig.behavior.collectorTimeoutMs,
      filter: i => i.user.id === interaction.user.id,
    });

    collector.on('collect', async componentInteraction => {
      if (componentInteraction.isButton() && componentInteraction.customId === MODULE_SHARE_BUTTON_ID) {
        await shareCurrentRender(componentInteraction, {
          commandName: moduleConfig.name,
          render: async () => {
            const rendered = await createRender();
            return { embeds: [rendered.embed], files: rendered.files };
          },
        });
        return;
      }

      if (componentInteraction.isStringSelectMenu() && componentInteraction.customId === moduleConfig.ids.moduleTypeSelect) {
        moduleState = normalizeModuleCalculatorState({
          ...moduleState,
          moduleType: componentInteraction.values[0],
        });
        await persistState();
        await componentInteraction.deferUpdate();
        const updatedRender = await createRender();
        await interaction.editReply({ embeds: [updatedRender.embed], components: buildComponents(), files: updatedRender.files });
        return;
      }

      if (!componentInteraction.isButton()) {
        await componentInteraction.deferUpdate();
        return;
      }

      if (componentInteraction.customId === moduleConfig.ids.toggleView) {
        activeView = activeView === 'primary' ? 'assist' : 'primary';
        await componentInteraction.deferUpdate();
        const updatedRender = await createRender();
        await interaction.editReply({ embeds: [updatedRender.embed], components: buildComponents(), files: updatedRender.files });
        return;
      }

      if (componentInteraction.customId === moduleConfig.ids.primaryValues) {
        const view = buildModuleCalculatorView(moduleState);
        const modal = new ModalBuilder()
          .setCustomId(moduleConfig.ids.primaryModal)
          .setTitle(moduleConfig.ui.primaryModalTitle)
          .addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder()
                .setCustomId(moduleConfig.ids.coinDiscountInput)
                .setLabel(moduleConfig.ui.coinDiscountLabel)
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setValue(String(view.state.coinDiscount)),
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder()
                .setCustomId(moduleConfig.ids.shardDiscountInput)
                .setLabel(moduleConfig.ui.shardDiscountLabel)
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setValue(String(view.state.shardDiscount)),
            ),
            new LabelBuilder()
              .setLabel(moduleConfig.ui.primaryRarityLabel)
              .setStringSelectMenuComponent(
                new StringSelectMenuBuilder()
                  .setCustomId(moduleConfig.ids.primaryRaritySelect)
                  .setPlaceholder(moduleConfig.ui.primaryRarityPlaceholder)
                  .setMinValues(1)
                  .setMaxValues(1)
                  .addOptions(
                    moduleRarityItems.map(item => ({
                      label: item.title,
                      value: item.value,
                      default: view.state.rarity === item.value,
                    })),
                  ),
              ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder()
                .setCustomId(moduleConfig.ids.currentLevelInput)
                .setLabel(moduleConfig.ui.currentLevelLabel)
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setValue(String(view.state.currentLevel)),
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder()
                .setCustomId(moduleConfig.ids.targetLevelInput)
                .setLabel(moduleConfig.ui.targetLevelLabel)
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setValue(String(view.state.targetLevel)),
            ),
          );

        const submitted = await showModalAndAwaitSubmit({
          componentInteraction,
          modal,
          baseCustomId: moduleConfig.ids.primaryModal,
          userId: interaction.user.id,
          timeoutMs: moduleConfig.behavior.modalSubmitTimeoutMs,
        });
        if (!submitted) {
          return;
        }

        const nextCoinDiscount = Number.parseInt(submitted.fields.getTextInputValue(moduleConfig.ids.coinDiscountInput), 10);
        const nextShardDiscount = Number.parseInt(submitted.fields.getTextInputValue(moduleConfig.ids.shardDiscountInput), 10);
        const nextCurrentLevel = Number.parseInt(submitted.fields.getTextInputValue(moduleConfig.ids.currentLevelInput), 10);
        const nextTargetLevel = Number.parseInt(submitted.fields.getTextInputValue(moduleConfig.ids.targetLevelInput), 10);
        const resolvedRarity = resolveRarityLabel(getSelectedModalValue(submitted, moduleConfig.ids.primaryRaritySelect));

        if (
          !Number.isFinite(nextCoinDiscount)
          || !Number.isFinite(nextShardDiscount)
          || !Number.isFinite(nextCurrentLevel)
          || !Number.isFinite(nextTargetLevel)
          || nextCoinDiscount < 0
          || nextCoinDiscount > 100
          || nextShardDiscount < 0
          || nextShardDiscount > 100
          || nextCurrentLevel < 1
          || nextCurrentLevel > ABSOLUTE_MAX_MODULE_LEVEL
          || nextTargetLevel < nextCurrentLevel
          || nextTargetLevel > ABSOLUTE_MAX_MODULE_LEVEL
          || !resolvedRarity
        ) {
          await submitted.reply({ content: moduleConfig.ui.invalidPrimaryInput, ephemeral: true });
          return;
        }

        moduleState = updatePrimaryState(moduleState, {
          coinDiscount: nextCoinDiscount,
          shardDiscount: nextShardDiscount,
          rarity: resolvedRarity,
          currentLevel: nextCurrentLevel,
          targetLevel: nextTargetLevel,
        });
        await submitted.deferUpdate();
        await persistState();
        const updatedRender = await createRender();
        await interaction.editReply({ embeds: [updatedRender.embed], components: buildComponents(), files: updatedRender.files });
        return;
      }

      if (componentInteraction.customId === moduleConfig.ids.assistValues) {
        const view = buildModuleCalculatorView(moduleState);
        const modal = new ModalBuilder()
          .setCustomId(moduleConfig.ids.assistModal)
          .setTitle(moduleConfig.ui.assistModalTitle)
          .addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder()
                .setCustomId(moduleConfig.ids.assistEffInput)
                .setLabel(moduleConfig.ui.assistEffLabel)
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setValue(String(view.state.assistEffPct)),
            ),
            new LabelBuilder()
              .setLabel(moduleConfig.ui.assistRarityLabel)
              .setStringSelectMenuComponent(
                new StringSelectMenuBuilder()
                  .setCustomId(moduleConfig.ids.assistRaritySelect)
                  .setPlaceholder(moduleConfig.ui.assistRarityPlaceholder)
                  .setMinValues(1)
                  .setMaxValues(1)
                  .addOptions(
                    moduleRarityItems.map(item => ({
                      label: item.title,
                      value: item.value,
                      default: view.state.assistRarity === item.value,
                    })),
                  ),
              ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder()
                .setCustomId(moduleConfig.ids.assistCurrentLevelInput)
                .setLabel(moduleConfig.ui.assistCurrentLevelLabel)
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setValue(String(view.state.assistCurrentLevel)),
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder()
                .setCustomId(moduleConfig.ids.assistTargetLevelInput)
                .setLabel(moduleConfig.ui.assistTargetLevelLabel)
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setValue(String(view.state.assistTargetLevel)),
            ),
          );

        const submitted = await showModalAndAwaitSubmit({
          componentInteraction,
          modal,
          baseCustomId: moduleConfig.ids.assistModal,
          userId: interaction.user.id,
          timeoutMs: moduleConfig.behavior.modalSubmitTimeoutMs,
        });
        if (!submitted) {
          return;
        }

        const nextAssistEffPct = Number.parseInt(submitted.fields.getTextInputValue(moduleConfig.ids.assistEffInput), 10);
        const nextAssistCurrentLevel = Number.parseInt(submitted.fields.getTextInputValue(moduleConfig.ids.assistCurrentLevelInput), 10);
        const nextAssistTargetLevel = Number.parseInt(submitted.fields.getTextInputValue(moduleConfig.ids.assistTargetLevelInput), 10);
        const resolvedAssistRarity = resolveRarityLabel(getSelectedModalValue(submitted, moduleConfig.ids.assistRaritySelect));

        if (
          !Number.isFinite(nextAssistEffPct)
          || !Number.isFinite(nextAssistCurrentLevel)
          || !Number.isFinite(nextAssistTargetLevel)
          || nextAssistEffPct < 0
          || nextAssistEffPct > 100
          || nextAssistCurrentLevel < 1
          || nextAssistCurrentLevel > ABSOLUTE_MAX_MODULE_LEVEL
          || nextAssistTargetLevel < nextAssistCurrentLevel
          || nextAssistTargetLevel > ABSOLUTE_MAX_MODULE_LEVEL
          || !resolvedAssistRarity
        ) {
          await submitted.reply({ content: moduleConfig.ui.invalidAssistInput, ephemeral: true });
          return;
        }

        moduleState = updateAssistState(moduleState, {
          assistEffPct: nextAssistEffPct,
          assistRarity: resolvedAssistRarity,
          assistCurrentLevel: nextAssistCurrentLevel,
          assistTargetLevel: nextAssistTargetLevel,
        });
        await submitted.deferUpdate();
        await persistState();
        const updatedRender = await createRender();
        await interaction.editReply({ embeds: [updatedRender.embed], components: buildComponents(), files: updatedRender.files });
        return;
      }

      await componentInteraction.reply({ content: moduleConfig.ui.notYourSession, ephemeral: true });
    });

    collector.on('end', async () => {
      await interaction.editReply({
        content: moduleConfig.ui.sessionTimedOut,
        embeds: [],
        components: [],
      }).catch(() => {});
    });
  },
};
