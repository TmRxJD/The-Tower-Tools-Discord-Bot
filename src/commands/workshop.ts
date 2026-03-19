import {
  AttachmentBuilder,
  EmbedBuilder,
  SlashCommandBuilder,
} from 'discord.js';
import type { CommandModule } from '../core/command-types';
import { buildWorkshopLevelCostRows, getDefaultLevelRange, getWorkshopCostLevelsByKey, resolveWorkshopTotalDiscountPercent } from '@tmrxjd/platform/tools';
import { getBotConfig } from '../config/bot-config';
import { brandCommandEmbed } from '../services/command-embed-branding';
import { appendShareButtonRow, shareCurrentRender } from '../services/command-share';
import { renderTableChartPng } from '../services/table-chart-render';
import { getUserCommandSharedState, reconcileUserCommandSharedState, saveUserCommandSharedState } from '../services/user-command-shared-state';
import { resolveUserStorageState } from '../services/user-storage-resolution';
import { runCloudReconcileUi } from '../services/cloud-reconcile-ui';
import { showModalAndAwaitSubmit } from '../services/modal-submit';
import {
  buildNormalRows,
  buildWorkshopComponents,
  createWorkshopValuesModal,
  formatCost,
  formatStatValue,
  getWorkshopStatOption,
  normalizeWorkshopLevels,
  normalizeWorkshopSelection,
  normalizeWorkshopSharedState,
  resolveWorkshopMaxLevel,
  toModeLabel,
  toSectionLabel,
  toStatLabel,
  type WorkshopNormalData,
  type WorkshopSharedState,
} from './workshop-command-helpers';

const workshopConfig = getBotConfig().commands.workshop;
const WORKSHOP_SHARE_BUTTON_ID = 'workshop_share';

const WORKSHOP_NORMAL_DATA = require('@tmrxjd/platform/tools/workshop.json') as WorkshopNormalData;

async function buildWorkshopAttachment(args: {
  title: string;
  headers: string[];
  rows: string[][];
  summary: string;
  totals: string;
  discordUserId: string;
}): Promise<AttachmentBuilder | null> {
  try {
    const image = await renderTableChartPng({
      title: args.title,
      headers: args.headers,
      rows: args.rows,
      descriptionLines: [args.summary],
    }, args.discordUserId);
    return new AttachmentBuilder(image, { name: 'workshop-costs.png' });
  } catch {
    return null;
  }
}

const data = new SlashCommandBuilder()
  .setName(workshopConfig.name)
  .setDescription(workshopConfig.description)
  .addStringOption(option => {
    const builtOption = option
      .setName(workshopConfig.options.mode.name)
      .setDescription(workshopConfig.options.mode.description)
      .setRequired(false);

    for (const choice of workshopConfig.modeChoices) {
      builtOption.addChoices({ name: choice.name, value: choice.value });
    }

    return builtOption;
  })
  .addStringOption(option => {
    const builtOption = option
      .setName(workshopConfig.options.section.name)
      .setDescription(workshopConfig.options.section.description)
      .setRequired(false);

    for (const choice of workshopConfig.sectionChoices) {
      builtOption.addChoices({ name: choice.name, value: choice.value });
    }

    return builtOption;
  })
  .addStringOption(option => {
    const builtOption = option
      .setName(workshopConfig.options.stat.name)
      .setDescription(workshopConfig.options.stat.description)
      .setRequired(false);

    for (const choice of workshopConfig.statChoices) {
      builtOption.addChoices({ name: choice.name, value: choice.value });
    }

    return builtOption;
  })
  .addIntegerOption(option =>
    option
      .setName(workshopConfig.options.currentLevel.name)
      .setDescription(workshopConfig.options.currentLevel.description)
      .setMinValue(0)
      .setRequired(false)
  )
  .addIntegerOption(option =>
    option
      .setName(workshopConfig.options.targetLevel.name)
      .setDescription(workshopConfig.options.targetLevel.description)
      .setMinValue(1)
      .setRequired(false)
  )
  .addIntegerOption(option =>
    option
      .setName(workshopConfig.options.discount.name)
      .setDescription(workshopConfig.options.discount.description)
      .setMinValue(0)
      .setMaxValue(100)
      .setRequired(false)
  )
  .addIntegerOption(option =>
    option
      .setName(workshopConfig.options.vaultDiscount.name)
      .setDescription(workshopConfig.options.vaultDiscount.description)
      .setMinValue(0)
      .setMaxValue(100)
      .setRequired(false)
  );

export const workshopCommand: CommandModule = {
  data: data.toJSON(),
  async execute(interaction) {
    if (!interaction.isChatInputCommand()) {
      return;
    }

    const defaultState = normalizeWorkshopSharedState(null);
    const hasMeaningfulState = (candidate: WorkshopSharedState): boolean => (
      JSON.stringify(candidate) !== JSON.stringify(defaultState)
    );
    const resolvedStorage = await resolveUserStorageState({
      discordUserId: interaction.user.id,
      load: (storageId) => getUserCommandSharedState(storageId, 'workshop', normalizeWorkshopSharedState),
      hasMeaningfulState,
    });

    const storageUserId = resolvedStorage.storageUserId;
    const persisted = resolvedStorage.state;

    const hasCurrentLevelOption = interaction.options.getInteger(workshopConfig.options.currentLevel.name) !== null;
    const hasTargetLevelOption = interaction.options.getInteger(workshopConfig.options.targetLevel.name) !== null;
    const hasOtherOptions = interaction.options.getString(workshopConfig.options.mode.name) !== null
      || interaction.options.getString(workshopConfig.options.section.name) !== null
      || interaction.options.getString(workshopConfig.options.stat.name) !== null
      || interaction.options.getInteger(workshopConfig.options.discount.name) !== null
      || interaction.options.getInteger(workshopConfig.options.vaultDiscount.name) !== null;
    const usingLegacyDefaultRange = persisted.mode === workshopConfig.defaults.mode
      && persisted.section === workshopConfig.defaults.section
      && persisted.stat === workshopConfig.defaults.stat
      && persisted.currentLevel === workshopConfig.defaults.currentLevel
      && persisted.targetLevel === workshopConfig.defaults.targetLevel
      && persisted.discount === workshopConfig.defaults.discount
      && persisted.vaultDiscount === workshopConfig.defaults.vaultDiscount
      && persisted.hideBaseCosts === workshopConfig.defaults.hideBaseCosts;

    let mode = interaction.options.getString(workshopConfig.options.mode.name) ?? persisted.mode;
    let section = interaction.options.getString(workshopConfig.options.section.name) ?? persisted.section;
    let stat = interaction.options.getString(workshopConfig.options.stat.name) ?? persisted.stat;
    let currentLevel = interaction.options.getInteger(workshopConfig.options.currentLevel.name) ?? persisted.currentLevel;
    let targetLevelRaw = interaction.options.getInteger(workshopConfig.options.targetLevel.name) ?? persisted.targetLevel;
    let discount = interaction.options.getInteger(workshopConfig.options.discount.name) ?? persisted.discount;
    let vaultDiscount = interaction.options.getInteger(workshopConfig.options.vaultDiscount.name) ?? persisted.vaultDiscount;
    let hideBaseCosts = persisted.hideBaseCosts;

    {
      const normalizedSelection = normalizeWorkshopSelection(mode, section, stat);
      mode = normalizedSelection.mode;
      section = normalizedSelection.section;
      stat = normalizedSelection.stat;
    }

    if (!hasCurrentLevelOption && !hasTargetLevelOption && !hasOtherOptions && usingLegacyDefaultRange) {
      const defaultRange = getDefaultLevelRange(0, resolveWorkshopMaxLevel(mode, section, stat, WORKSHOP_NORMAL_DATA));
      currentLevel = defaultRange.startLevel;
      targetLevelRaw = defaultRange.targetLevel;
    }

    {
      const normalizedLevels = normalizeWorkshopLevels(currentLevel, targetLevelRaw, resolveWorkshopMaxLevel(mode, section, stat, WORKSHOP_NORMAL_DATA));
      currentLevel = normalizedLevels.currentLevel;
      targetLevelRaw = normalizedLevels.targetLevel;
    }

    const persistState = async () => {
      await saveUserCommandSharedState(storageUserId, 'workshop', {
        mode,
        section,
        stat,
        currentLevel,
        targetLevel: targetLevelRaw,
        discount,
        vaultDiscount,
        hideBaseCosts,
      }, normalizeWorkshopSharedState);
    };
    const shouldPersistInitialState = hasCurrentLevelOption || hasTargetLevelOption || hasOtherOptions;

    const createRender = async (): Promise<{ embed: EmbedBuilder; files: AttachmentBuilder[] }> => {
      const maxLevel = resolveWorkshopMaxLevel(mode, section, stat, WORKSHOP_NORMAL_DATA);
      const targetLevel = Math.max(currentLevel + 1, Math.min(maxLevel, targetLevelRaw));
      const selectedStatOption = getWorkshopStatOption(mode, section, stat);
      if (!selectedStatOption) {
        return {
          embed: new EmbedBuilder().setTitle(workshopConfig.ui.title).setDescription(workshopConfig.ui.invalidStat).setColor(workshopConfig.color),
          files: [],
        };
      }

      if (mode === 'normal') {
        const statData = WORKSHOP_NORMAL_DATA[selectedStatOption.dataKey];
        if (!statData) {
          return {
            embed: brandCommandEmbed(new EmbedBuilder().setTitle(workshopConfig.ui.title).setDescription(workshopConfig.ui.invalidStat).setColor(workshopConfig.color), workshopConfig.name),
            files: [],
          };
        }

        const rows = buildNormalRows(statData, currentLevel, targetLevel, discount);
        const coinTotal = rows.length > 0 ? rows[rows.length - 1].cumulativeCoin : 0;
        const cashTotal = rows.length > 0 ? rows[rows.length - 1].cumulativeCash : 0;

        const summary = workshopConfig.ui.normalSummaryTemplate
          .replace('{section}', toSectionLabel(section))
          .replace('{stat}', toStatLabel(mode, section, stat))
          .replace('{from}', currentLevel.toString())
          .replace('{to}', targetLevel.toString())
          .replace('{discount}', discount.toString());

        const totals = workshopConfig.ui.normalTotalsTemplate
          .replace('{coinTotal}', formatCost(coinTotal))
          .replace('{cashTotal}', formatCost(cashTotal))
          .replace('{rows}', rows.length.toString());

        const fullSummary = `${summary}\nMode: ${toModeLabel(mode)}`;
        const embed = brandCommandEmbed(new EmbedBuilder()
          .setTitle(workshopConfig.ui.title)
          .setDescription(`${workshopConfig.ui.description}\n\n${fullSummary}`)
          .addFields({ name: workshopConfig.ui.totalsFieldName, value: totals, inline: false })
          .setColor(workshopConfig.color), workshopConfig.name);

        const attachment = await buildWorkshopAttachment({
          title: `Workshop ${toModeLabel(mode)} Cost Table`,
          headers: ['Lvl', 'Value', 'Coin', 'Cash', 'Coin Total', 'Cash Total'],
          rows: rows.map(row => [
            row.level.toString(),
            formatStatValue(row.value),
            formatCost(row.coinCost),
            formatCost(row.cashCost),
            formatCost(row.cumulativeCoin),
            formatCost(row.cumulativeCash),
          ]),
          summary: fullSummary,
          totals,
          discordUserId: storageUserId,
        });

        if (!attachment) {
          return { embed, files: [] };
        }

        embed.setImage('attachment://workshop-costs.png');
        return { embed, files: [attachment] };
      }

      const costLevels = getWorkshopCostLevelsByKey(selectedStatOption.dataKey);
      if (!costLevels) {
        return {
          embed: brandCommandEmbed(new EmbedBuilder().setTitle(workshopConfig.ui.title).setDescription(workshopConfig.ui.invalidStat).setColor(workshopConfig.color), workshopConfig.name),
          files: [],
        };
      }

      const totalDiscount = resolveWorkshopTotalDiscountPercent(discount, vaultDiscount);
      const rows = buildWorkshopLevelCostRows(costLevels, currentLevel, targetLevel, totalDiscount);
      const total = rows.length > 0 ? rows[rows.length - 1].cumulativeCost : 0;

      const summary = workshopConfig.ui.summaryTemplate
        .replace('{section}', toSectionLabel(section))
        .replace('{stat}', toStatLabel(mode, section, stat))
        .replace('{from}', currentLevel.toString())
        .replace('{to}', targetLevel.toString())
        .replace('{discount}', discount.toString());

      const enhancementDiscountDetails = workshopConfig.ui.enhancementDiscountDetailsTemplate
        .replace('{sectionDiscount}', discount.toString())
        .replace('{vaultDiscount}', vaultDiscount.toString())
        .replace('{totalDiscount}', totalDiscount.toString());

      const totals = workshopConfig.ui.totalsTemplate
        .replace('{total}', formatCost(total))
        .replace('{rows}', rows.length.toString());

      const fullSummary = `${summary}\n${enhancementDiscountDetails}\nMode: ${toModeLabel(mode)}`;
      const embed = brandCommandEmbed(new EmbedBuilder()
        .setTitle(workshopConfig.ui.title)
        .setDescription(`${workshopConfig.ui.description}\n\n${fullSummary}`)
        .addFields({ name: workshopConfig.ui.totalsFieldName, value: totals, inline: false })
        .setColor(workshopConfig.color), workshopConfig.name);

      const attachment = await buildWorkshopAttachment({
        title: `Workshop ${toModeLabel(mode)} Cost Table`,
        headers: hideBaseCosts ? ['Lvl', 'Cost', 'Total'] : ['Lvl', 'Base', 'Cost', 'Total'],
        rows: rows.map(row => (
          hideBaseCosts
            ? [
                row.level.toString(),
                formatCost(row.discountedCost),
                formatCost(row.cumulativeCost),
              ]
            : [
                row.level.toString(),
                formatCost(row.baseCost),
                formatCost(row.discountedCost),
                formatCost(row.cumulativeCost),
              ]
        )),
        summary: fullSummary,
        totals,
        discordUserId: storageUserId,
      });

      if (!attachment) {
        return { embed, files: [] };
      }

      embed.setImage('attachment://workshop-costs.png');
      return { embed, files: [attachment] };
    };

    const buildComponents = () => appendShareButtonRow(buildWorkshopComponents(mode, section, stat, hideBaseCosts), WORKSHOP_SHARE_BUTTON_ID);

  await interaction.deferReply({ ephemeral: true });
    const initialRender = await createRender();
  await interaction.editReply({ embeds: [initialRender.embed], components: buildComponents(), files: initialRender.files });

    if (shouldPersistInitialState) {
      void persistState();
    }

    void (async () => {
      const reconcile = await reconcileUserCommandSharedState(storageUserId, 'workshop', normalizeWorkshopSharedState);
      await runCloudReconcileUi<WorkshopSharedState>({
        interaction,
        promptKey: 'workshop-sync',
        userId: interaction.user.id,
        autoCloudEnabled: reconcile.autoCloudEnabled,
        direction: reconcile.direction,
        hasDifference: reconcile.hasDifference,
        cloudState: reconcile.cloudState,
        applyCloudToLocal: reconcile.applyCloudToLocal,
        applyLocalToCloud: reconcile.applyLocalToCloud,
        onCloudApplied: async (next) => {
          mode = next.mode;
          section = next.section;
          stat = next.stat;
          currentLevel = next.currentLevel;
          targetLevelRaw = next.targetLevel;
          discount = next.discount;
          vaultDiscount = next.vaultDiscount;
          hideBaseCosts = next.hideBaseCosts;
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
      time: workshopConfig.behavior.collectorTimeoutMs,
      filter: i => i.user.id === interaction.user.id,
    });

    collector.on('collect', async componentInteraction => {
      if (componentInteraction.isButton() && componentInteraction.customId === WORKSHOP_SHARE_BUTTON_ID) {
        await shareCurrentRender(componentInteraction, {
          commandName: workshopConfig.name,
          render: async () => {
            const rendered = await createRender();
            return { embeds: [rendered.embed], files: rendered.files };
          },
        });
        return;
      }

      if (componentInteraction.isStringSelectMenu()) {
        if (componentInteraction.customId === workshopConfig.ids.modeSelect) {
          mode = componentInteraction.values[0] ?? mode;
        } else if (componentInteraction.customId === workshopConfig.ids.sectionSelect) {
          section = componentInteraction.values[0] ?? section;
        } else if (componentInteraction.customId === workshopConfig.ids.statSelect) {
          stat = componentInteraction.values[0] ?? stat;
        } else {
          await componentInteraction.reply({ content: workshopConfig.ui.notYourSession, ephemeral: true });
          return;
        }

        {
          const normalizedSelection = normalizeWorkshopSelection(mode, section, stat);
          mode = normalizedSelection.mode;
          section = normalizedSelection.section;
          stat = normalizedSelection.stat;
        }

        {
          const normalizedLevels = normalizeWorkshopLevels(currentLevel, targetLevelRaw, resolveWorkshopMaxLevel(mode, section, stat, WORKSHOP_NORMAL_DATA));
          currentLevel = normalizedLevels.currentLevel;
          targetLevelRaw = normalizedLevels.targetLevel;
        }

        await persistState();
        await componentInteraction.deferUpdate();
        const updatedRender = await createRender();
        await interaction.editReply({ embeds: [updatedRender.embed], components: buildComponents(), files: updatedRender.files });
        return;
      }

      if (componentInteraction.isButton() && componentInteraction.customId === workshopConfig.ids.setValues) {
        const modal = createWorkshopValuesModal(mode, currentLevel, targetLevelRaw, discount, vaultDiscount);

        const submitted = await showModalAndAwaitSubmit({
          componentInteraction,
          modal,
          baseCustomId: workshopConfig.ids.valuesModal,
          userId: interaction.user.id,
          timeoutMs: workshopConfig.behavior.modalSubmitTimeoutMs,
        });
        if (!submitted) {
          return;
        }

        const nextCurrent = Number.parseInt(submitted.fields.getTextInputValue(workshopConfig.ids.currentLevelInput), 10);
        const nextTarget = Number.parseInt(submitted.fields.getTextInputValue(workshopConfig.ids.targetLevelInput), 10);
        const nextDiscount = Number.parseInt(submitted.fields.getTextInputValue(workshopConfig.ids.discountInput), 10);
        const nextVaultDiscount = mode === 'enhancements'
          ? (() => {
              const nextVaultDiscountRaw = submitted.fields.getTextInputValue(workshopConfig.ids.vaultDiscountInput);
              if (nextVaultDiscountRaw.trim().length === 0) return 0;
              return Number.parseInt(nextVaultDiscountRaw, 10);
            })()
          : vaultDiscount;

        if (!Number.isFinite(nextCurrent) || nextCurrent < 0 || !Number.isFinite(nextTarget) || nextTarget <= nextCurrent || !Number.isFinite(nextDiscount) || nextDiscount < 0 || nextDiscount > 100 || !Number.isFinite(nextVaultDiscount) || nextVaultDiscount < 0 || nextVaultDiscount > 100) {
          await submitted.reply({ content: workshopConfig.ui.invalidInput, ephemeral: true });
          return;
        }

        currentLevel = nextCurrent;
        targetLevelRaw = nextTarget;
        {
          const normalizedLevels = normalizeWorkshopLevels(currentLevel, targetLevelRaw, resolveWorkshopMaxLevel(mode, section, stat, WORKSHOP_NORMAL_DATA));
          currentLevel = normalizedLevels.currentLevel;
          targetLevelRaw = normalizedLevels.targetLevel;
        }
        discount = nextDiscount;
        vaultDiscount = nextVaultDiscount;

        await persistState();
        await submitted.deferUpdate();
        const updatedRender = await createRender();
        await interaction.editReply({ embeds: [updatedRender.embed], components: buildComponents(), files: updatedRender.files });

        return;
      }

      if (componentInteraction.isButton() && componentInteraction.customId === workshopConfig.ids.toggleBaseCosts) {
        if (mode !== 'enhancements') {
          await componentInteraction.reply({ content: workshopConfig.ui.notYourSession, ephemeral: true });
          return;
        }

        hideBaseCosts = !hideBaseCosts;
        await persistState();
        await componentInteraction.deferUpdate();
        const updatedRender = await createRender();
        await interaction.editReply({ embeds: [updatedRender.embed], components: buildComponents(), files: updatedRender.files });
        return;
      }

      await componentInteraction.reply({ content: workshopConfig.ui.notYourSession, ephemeral: true });
    });

    collector.on('end', async () => {
      await interaction.editReply({ content: workshopConfig.ui.sessionTimedOut, embeds: [], components: [] }).catch(() => {});
    });
  },
};
