import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageComponentInteraction,
  ModalBuilder,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  AttachmentBuilder,
} from 'discord.js';
import type { CommandModule } from '../core/command-types';
import {
  buildLabProgressRows,
  clampLabRange,
  formatHoursDuration,
  formatLabDisplayName,
  formatLargeNumber,
  getLabCategories,
  getLabMaxLevel,
  getLabsByCategory,
  getSharedToolLabs,
  type ToolLabRecord,
} from '@tmrxjd/platform/tools';
import { getBotConfig } from '../config/bot-config';
import { brandCommandEmbed } from '../services/command-embed-branding';
import { appendShareButtonRow, shareCurrentRender } from '../services/command-share';
import { getUserLabSettings, reconcileUserLabSettings, saveUserLabSettings, type UserLabSettings } from '../services/user-lab-db';
import { renderTableChartPng } from '../services/table-chart-render';
import { showModalAndAwaitSubmit } from '../services/modal-submit';
import { resolveUserStorageState } from '../services/user-storage-resolution';
import { runCloudReconcileUi } from '../services/cloud-reconcile-ui';

interface LabChartRow {
  level: number;
  value: number;
  timeHours: number;
  gems: number;
  coins: number;
  cumulativeTimeHours: number;
  cumulativeGems: number;
  cumulativeCoins: number;
}

interface CategoryOption {
  label: string;
  value: string;
}

interface LabMenuItem {
  key: string;
  name: string;
}

type ComponentInteraction = MessageComponentInteraction;

const labConfig = getBotConfig().commands.lab;
const ids = labConfig.ids;
const LAB_CHART_FILENAME = 'lab-chart.png';
const LAB_SHARE_BUTTON_ID = 'lab_share';
const sharedLabsCatalog = getSharedToolLabs();

function buildLabSettingsSummary(settings: UserLabSettings, template: string): string {
  return template
    .replace('{labSpeed}', String(settings.labSpeed))
    .replace('{labRelic}', String(settings.labRelic))
    .replace('{coinDiscount}', String(settings.labDiscount))
    .replace('{speedUp}', String(settings.speedUp));
}

const UW_TYPE_LIST = [
  { value: 'sm', label: 'Smart Missiles' },
  { value: 'bh', label: 'Black Hole' },
  { value: 'ps', label: 'Poison Swamp' },
  { value: 'cl', label: 'Chain Lightning' },
  { value: 'cf', label: 'Chrono Field' },
  { value: 'gt', label: 'Golden Tower' },
  { value: 'dw', label: 'Death Wave' },
  { value: 'ilm', label: 'Inner Land Mines' },
  { value: 'sl', label: 'Spotlight' },
] as const;

const UW_TYPE_PREFIX: Record<string, string> = {
  sm: 'missile_',
  bh: 'black_hole_',
  ps: 'swamp_',
  cl: 'chain_lightning_',
  cf: 'chrono_field_',
  gt: 'golden_tower_',
  dw: 'death_wave_',
  ilm: 'inner_mine_',
  sl: 'spotlight_',
};

const data = new SlashCommandBuilder()
  .setName(labConfig.name)
  .setDescription(labConfig.description);

function getLabByKey(labKey: string | null): ToolLabRecord | null {
  if (!labKey) return null;
  return sharedLabsCatalog.find(entry => entry.name === labKey) ?? null;
}

function isTypeFullyMaxed(typeValue: string, settings: UserLabSettings, uwLabs: LabMenuItem[]): boolean {
  const prefix = UW_TYPE_PREFIX[typeValue];
  if (!prefix) return false;

  const labsForType = uwLabs
    .filter(lab => lab.key.startsWith(prefix))
    .map(lab => getLabByKey(lab.key))
    .filter((lab): lab is ToolLabRecord => lab !== null)
    .filter(lab => (lab.type ?? '') === 'Ultimate Weapon');

  if (labsForType.length === 0) return false;

  return labsForType.every(lab => {
    const maxLevel = getLabMaxLevel(lab);
    const currentLevel = settings.labLevels[lab.name]?.startLevel ?? 0;
    return currentLevel >= maxLevel;
  });
}

function filterLabsByHiddenState(labs: LabMenuItem[], settings: UserLabSettings): LabMenuItem[] {
  if (!settings.hideMaxedLabs) {
    return labs;
  }

  return labs.filter(item => {
    const lab = getLabByKey(item.key);
    if (!lab) return false;
    const maxLevel = getLabMaxLevel(lab);
    const currentLevel = settings.labLevels[item.key]?.startLevel ?? 0;
    return currentLevel < maxLevel;
  });
}

export const labCommand: CommandModule = {
  data: data.toJSON(),
  async execute(interaction) {
    if (!interaction.isChatInputCommand()) {
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const categories = getLabCategories(sharedLabsCatalog) as CategoryOption[];
    const categoryOptions = categories.slice(0, 25).map(cat => ({ label: cat.label, value: cat.value }));

    const discordUserId = interaction.user.id;
    const cloudContext = {
      username: interaction.user.username,
      usernameCandidates: Array.from(new Set([
        interaction.user.username,
        interaction.user.globalName ?? undefined,
        interaction.member && 'displayName' in interaction.member
          ? String((interaction.member as { displayName?: string }).displayName ?? '')
          : undefined,
      ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0).map(value => value.trim()))),
    };

    const hasMeaningfulSettings = (candidate: UserLabSettings): boolean => {
      if (Object.keys(candidate.labLevels ?? {}).length > 0) {
        return true;
      }

      return candidate.labSpeed > 0
        || candidate.labRelic > 0
        || candidate.labDiscount > 0
        || candidate.speedUp > 1
        || candidate.hideMaxedLabs === false;
    };

    const resolvedStorage = await resolveUserStorageState({
      discordUserId,
      load: async (userId) => await getUserLabSettings(userId, cloudContext),
      hasMeaningfulState: hasMeaningfulSettings,
    });

    const storageUserId = resolvedStorage.storageUserId;
    let settings = resolvedStorage.state;

    let selectedCategory: string | null = null;
    let selectedLab: string | null = null;
    let selectedUWType: string | null = null;

    const buildAttachment = async (): Promise<AttachmentBuilder | null> => {
      if (!selectedLab) return null;
      const lab = getLabByKey(selectedLab);
      if (!lab) return null;
      const savedLevels = settings.labLevels[selectedLab] ?? { startLevel: 0, targetLevel: Math.min(30, getLabMaxLevel(lab)) };
      const range = clampLabRange(lab, savedLevels.startLevel, savedLevels.targetLevel);
      const rows = buildLabProgressRows(lab, range.startLevel, range.targetLevel, settings) as LabChartRow[];
      if (rows.length === 0) return null;

      try {
        const image = await renderTableChartPng({
          title: `${formatLabDisplayName(lab.name)} (${range.startLevel} -> ${range.targetLevel})`,
          headers: ['Lvl', 'Value', 'Time', 'Gems', 'Coins', 'Total Time', 'Total Gems', 'Total Coins'],
          rows: rows.map(row => [
            row.level.toString(),
            row.value.toFixed(2),
            formatHoursDuration(row.timeHours),
            formatLargeNumber(row.gems),
            formatLargeNumber(row.coins),
            formatHoursDuration(row.cumulativeTimeHours),
            formatLargeNumber(row.cumulativeGems),
            formatLargeNumber(row.cumulativeCoins),
          ]),
          footerLines: [buildLabSettingsSummary(settings, labConfig.ui.chartFooterSettingsTemplate)],
        }, storageUserId);
        return new AttachmentBuilder(image, { name: LAB_CHART_FILENAME });
      } catch {
        return null;
      }
    };

    const buildEmbed = (hasChartImage = false) => {
      const embed = new EmbedBuilder()
        .setTitle(labConfig.ui.title)
        .setColor(labConfig.color);

      embed.setDescription(labConfig.ui.settingsIntro);
      embed.addFields(
        { name: labConfig.ui.labSpeedField, value: settings.labSpeed.toString(), inline: true },
        { name: labConfig.ui.labRelicField, value: `${settings.labRelic}%`, inline: true },
        { name: labConfig.ui.coinDiscountField, value: `${settings.labDiscount}%`, inline: true },
      );

      if (!selectedLab) {
        return brandCommandEmbed(embed, labConfig.name);
      }

      const lab = getLabByKey(selectedLab);
      if (!lab) {
        return brandCommandEmbed(embed, labConfig.name);
      }

      const savedLevels = settings.labLevels[selectedLab] ?? { startLevel: 0, targetLevel: Math.min(30, getLabMaxLevel(lab)) };
      const range = clampLabRange(lab, savedLevels.startLevel, savedLevels.targetLevel);
      settings.labLevels[selectedLab] = range;

      const maxLevel = getLabMaxLevel(lab);
      embed.addFields(
        { name: labConfig.ui.currentLevelField, value: range.startLevel.toString(), inline: true },
        { name: labConfig.ui.targetLevelField, value: range.targetLevel.toString(), inline: true },
        { name: labConfig.ui.maxLevelField, value: maxLevel.toString(), inline: true },
      );

      const rows = buildLabProgressRows(lab, range.startLevel, range.targetLevel, settings) as LabChartRow[];
      if (rows.length === 0) {
        embed.addFields({ name: labConfig.ui.totalsFieldName, value: labConfig.ui.noRows, inline: false });
        return brandCommandEmbed(embed, labConfig.name);
      }

      const totals = rows[rows.length - 1];
      const totalsValue = labConfig.ui.totalsTemplate
        .replace('{time}', formatHoursDuration(totals.cumulativeTimeHours))
        .replace('{gems}', formatLargeNumber(totals.cumulativeGems))
        .replace('{coins}', formatLargeNumber(totals.cumulativeCoins))
        .replace('{speedUp}', `${settings.speedUp}x`);

      embed.addFields(
        { name: labConfig.ui.totalsFieldName, value: totalsValue, inline: false },
      );

      if (hasChartImage) {
        embed.setImage(`attachment://${LAB_CHART_FILENAME}`);
      }

      return brandCommandEmbed(embed, labConfig.name);
    };

    const buildCategoryMenu = () => {
      if (categoryOptions.length === 0) {
        return new StringSelectMenuBuilder()
          .setCustomId(ids.category)
          .setPlaceholder(labConfig.ui.noCategories)
          .setDisabled(true)
          .addOptions([{ label: labConfig.ui.noCategories, value: 'none', default: true }]);
      }

      const options = categoryOptions.map(option => ({
        ...option,
        default: selectedCategory === option.value,
      }));

      const selectedCat = categories.find(cat => cat.value === selectedCategory);
      return new StringSelectMenuBuilder()
        .setCustomId(ids.category)
        .setPlaceholder(selectedCat?.label ?? labConfig.ui.categoryPlaceholder)
        .addOptions(options);
    };

    const buildLabMenu = (labs: LabMenuItem[]) => {
      if (labs.length === 0) {
        return new StringSelectMenuBuilder()
          .setCustomId(ids.lab)
          .setPlaceholder(labConfig.ui.noLabs)
          .addOptions([{ label: labConfig.ui.noLabs, value: 'none', default: true }]);
      }

      return new StringSelectMenuBuilder()
        .setCustomId(ids.lab)
        .setPlaceholder(labConfig.ui.labPlaceholder)
        .addOptions(
          labs.slice(0, 25).map(item => ({
            label: item.name,
            value: item.key,
            default: selectedLab === item.key,
          }))
        );
    };

    const buildSpeedupMenu = () => new StringSelectMenuBuilder()
      .setCustomId(ids.speedup)
      .setPlaceholder(labConfig.ui.speedupPlaceholder)
      .addOptions(
        labConfig.speedUpChoices.map(speed => ({
          label: `${speed}x`,
          value: String(speed),
          default: speed === settings.speedUp,
        }))
      );

    const buildComponents = () => {
      const rows: Array<ActionRowBuilder<StringSelectMenuBuilder | ButtonBuilder>> = [];

      rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(buildCategoryMenu()));

      if (selectedCategory) {
        const categoryLabs = getLabsByCategory(sharedLabsCatalog, selectedCategory) as LabMenuItem[];

        if (selectedCategory.toLowerCase().includes('ultimate')) {
          let availableTypes = UW_TYPE_LIST as ReadonlyArray<{ value: string; label: string }>;
          if (settings.hideMaxedLabs) {
            availableTypes = availableTypes.filter(type => !isTypeFullyMaxed(type.value, settings, categoryLabs));
          }

          const uwTypeMenu = new StringSelectMenuBuilder()
            .setCustomId(ids.uwType)
            .setPlaceholder(labConfig.ui.uwTypePlaceholder)
            .addOptions(
              availableTypes.length > 0
                ? availableTypes.map(type => ({
                  label: type.label,
                  value: type.value,
                  default: selectedUWType === type.value,
                }))
                : [{ label: labConfig.ui.allUwMaxed, value: 'none', default: true }]
            );
          rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(uwTypeMenu));

          if (selectedUWType) {
            const prefix = UW_TYPE_PREFIX[selectedUWType];
            const filteredByType = categoryLabs.filter(item => prefix && item.key.startsWith(prefix));
            const filteredLabs = filterLabsByHiddenState(filteredByType, settings);
            rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(buildLabMenu(filteredLabs)));
          }
        } else {
          const filteredLabs = filterLabsByHiddenState(categoryLabs, settings);
          rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(buildLabMenu(filteredLabs)));
        }
      }

      if (selectedCategory && selectedLab) {
        rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(buildSpeedupMenu()));
      }

      const buttons = [
        new ButtonBuilder().setCustomId(ids.settings).setLabel(labConfig.ui.settingsButton).setStyle(ButtonStyle.Secondary),
        ...(selectedCategory && selectedLab
          ? [new ButtonBuilder().setCustomId(ids.range).setLabel(labConfig.ui.rangeButton).setStyle(ButtonStyle.Primary)]
          : []),
        new ButtonBuilder()
          .setCustomId(ids.toggleHideMaxed)
          .setLabel(settings.hideMaxedLabs ? labConfig.ui.showMaxedButton : labConfig.ui.hideMaxedButton)
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(ids.close).setLabel(labConfig.ui.closeButton).setStyle(ButtonStyle.Danger),
      ];

      rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons));

      return appendShareButtonRow(rows, LAB_SHARE_BUTTON_ID, !(selectedCategory && selectedLab));
    };

    const initialAttachment = await buildAttachment();
    const hasInitialAttachment = initialAttachment !== null;
    await interaction.editReply({
      embeds: [buildEmbed(hasInitialAttachment)],
      components: buildComponents(),
      files: initialAttachment ? [initialAttachment] : [],
    });

    const reply = await interaction.fetchReply();

    if (!('createMessageComponentCollector' in reply)) {
      await interaction.editReply({
        embeds: [buildEmbed().setFooter({ text: labConfig.ui.sessionEnded })],
        components: [],
      }).catch(() => {});
      return;
    }

    const collector = reply.createMessageComponentCollector({ time: labConfig.behavior.collectorTimeoutMs });

    const refreshReply = async (componentInteraction?: MessageComponentInteraction) => {
      if (componentInteraction && !componentInteraction.deferred && !componentInteraction.replied) {
        await componentInteraction.deferUpdate();
      }

      const nextAttachment = await buildAttachment();
      const hasChartImage = nextAttachment !== null;
      const payload = {
        embeds: [buildEmbed(hasChartImage)],
        components: buildComponents(),
        files: nextAttachment ? [nextAttachment] : [],
      };

      await interaction.editReply(payload);
    };

    void (async () => {
      const reconcile = await reconcileUserLabSettings(storageUserId, cloudContext);
      await runCloudReconcileUi<UserLabSettings>({
        interaction,
        promptKey: 'lab-sync',
        userId: interaction.user.id,
        autoCloudEnabled: reconcile.autoCloudEnabled,
        direction: reconcile.direction,
        hasDifference: reconcile.hasDifference,
        cloudState: reconcile.cloudState,
        applyCloudToLocal: reconcile.applyCloudToLocal,
        applyLocalToCloud: reconcile.applyLocalToCloud,
        onCloudApplied: async (next) => {
          settings = next;
          await refreshReply();
        },
      });
    })();

    collector.on('collect', async componentInteraction => {
      if (componentInteraction.user.id !== interaction.user.id) {
        await componentInteraction.reply({ content: labConfig.ui.notYourSession, ephemeral: true });
        return;
      }

      if (componentInteraction.isButton() && componentInteraction.customId === LAB_SHARE_BUTTON_ID) {
        await shareCurrentRender(componentInteraction, {
          commandName: labConfig.name,
          render: async () => {
            const attachment = await buildAttachment();
            return {
              embeds: [buildEmbed(attachment !== null)],
              files: attachment ? [attachment] : [],
            };
          },
        });
        return;
      }

      if (componentInteraction.customId === ids.close) {
        await componentInteraction.update({ content: labConfig.ui.closed, embeds: [], components: [] });
        collector.stop();
        return;
      }

      if (componentInteraction.customId === ids.toggleHideMaxed) {
        settings.hideMaxedLabs = !settings.hideMaxedLabs;

        if (selectedLab) {
          const lab = getLabByKey(selectedLab);
          if (!lab) {
            selectedLab = null;
            await saveUserLabSettings(storageUserId, settings, cloudContext);
            await refreshReply(componentInteraction);
            return;
          }
          const maxLevel = getLabMaxLevel(lab);
          const currentLevel = settings.labLevels[selectedLab]?.startLevel ?? 0;
          if (settings.hideMaxedLabs && currentLevel >= maxLevel) {
            selectedLab = null;
          }
        }

        await saveUserLabSettings(storageUserId, settings, cloudContext);
        await refreshReply(componentInteraction);
        return;
      }

      if (componentInteraction.customId === ids.settings) {
        const modal = new ModalBuilder()
          .setCustomId(ids.settingsModal)
          .setTitle(labConfig.ui.settingsModalTitle)
          .addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder()
                .setCustomId(ids.settingsLabSpeed)
                .setLabel(labConfig.ui.settingsLabSpeedLabel)
                .setStyle(TextInputStyle.Short)
                .setValue(String(settings.labSpeed))
                .setRequired(true)
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder()
                .setCustomId(ids.settingsLabRelic)
                .setLabel(labConfig.ui.settingsLabRelicLabel)
                .setStyle(TextInputStyle.Short)
                .setValue(String(settings.labRelic))
                .setRequired(true)
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder()
                .setCustomId(ids.settingsLabDiscount)
                .setLabel(labConfig.ui.settingsLabDiscountLabel)
                .setStyle(TextInputStyle.Short)
                .setValue(String(settings.labDiscount))
                .setRequired(true)
            ),
          );

        const submitted = await showModalAndAwaitSubmit({
          componentInteraction,
          modal,
          baseCustomId: ids.settingsModal,
          userId: componentInteraction.user.id,
          timeoutMs: labConfig.behavior.modalSubmitTimeoutMs,
        });
        if (!submitted) {
          return;
        }

        settings.labSpeed = Math.max(0, Math.floor(Number(submitted.fields.getTextInputValue(ids.settingsLabSpeed)) || 0));
        settings.labRelic = Math.max(0, Number(submitted.fields.getTextInputValue(ids.settingsLabRelic)) || 0);
        settings.labDiscount = Math.max(0, Math.floor(Number(submitted.fields.getTextInputValue(ids.settingsLabDiscount)) || 0));

        await saveUserLabSettings(storageUserId, settings, cloudContext);
        await submitted.deferUpdate();
        await refreshReply();
        return;
      }

      if (componentInteraction.customId === ids.range && selectedLab) {
        const lab = getLabByKey(selectedLab);
        if (!lab) {
          selectedLab = null;
          await componentInteraction.deferUpdate();
          await refreshReply();
          return;
        }
        const maxLevel = getLabMaxLevel(lab);
        const currentSaved = settings.labLevels[selectedLab] ?? { startLevel: 0, targetLevel: Math.min(30, maxLevel) };

        const modal = new ModalBuilder()
          .setCustomId(ids.rangeModal)
          .setTitle(labConfig.ui.rangeModalTitle)
          .addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder()
                .setCustomId(ids.rangeStartLevel)
                .setLabel(labConfig.ui.rangeStartLabel.replace('{max}', String(maxLevel)))
                .setStyle(TextInputStyle.Short)
                .setValue(String(currentSaved.startLevel))
                .setRequired(true)
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder()
                .setCustomId(ids.rangeTargetLevel)
                .setLabel(labConfig.ui.rangeTargetLabel.replace('{max}', String(maxLevel)))
                .setStyle(TextInputStyle.Short)
                .setValue(String(currentSaved.targetLevel))
                .setRequired(true)
            ),
          );

        const submitted = await showModalAndAwaitSubmit({
          componentInteraction,
          modal,
          baseCustomId: ids.rangeModal,
          userId: componentInteraction.user.id,
          timeoutMs: labConfig.behavior.modalSubmitTimeoutMs,
        });
        if (!submitted) {
          return;
        }

        const startValue = Number(submitted.fields.getTextInputValue(ids.rangeStartLevel)) || 0;
        const targetValue = Number(submitted.fields.getTextInputValue(ids.rangeTargetLevel)) || 0;
        settings.labLevels[selectedLab] = clampLabRange(lab, startValue, targetValue);

        if (settings.hideMaxedLabs && settings.labLevels[selectedLab].startLevel >= maxLevel) {
          selectedLab = null;
        }

        await saveUserLabSettings(storageUserId, settings, cloudContext);
        await submitted.deferUpdate();
        await refreshReply();
        return;
      }

      if (componentInteraction.customId === ids.category && componentInteraction.isStringSelectMenu()) {
        selectedCategory = componentInteraction.values[0] === 'none' ? null : componentInteraction.values[0];
        selectedLab = null;
        selectedUWType = null;
        await refreshReply(componentInteraction);
        return;
      }

      if (componentInteraction.customId === ids.uwType && componentInteraction.isStringSelectMenu()) {
        selectedUWType = componentInteraction.values[0] === 'none' ? null : componentInteraction.values[0];
        selectedLab = null;
        await refreshReply(componentInteraction);
        return;
      }

      if (componentInteraction.customId === ids.lab && componentInteraction.isStringSelectMenu()) {
        const nextLab = componentInteraction.values[0];
        selectedLab = nextLab === 'none' ? null : nextLab;

        if (selectedLab) {
          const lab = getLabByKey(selectedLab);
          const maxLevel = getLabMaxLevel(lab);
          const existing = settings.labLevels[selectedLab] ?? { startLevel: 0, targetLevel: Math.min(30, maxLevel) };
          settings.labLevels[selectedLab] = clampLabRange(lab, existing.startLevel, existing.targetLevel);
          await saveUserLabSettings(storageUserId, settings, cloudContext);
        }

        await refreshReply(componentInteraction);
        return;
      }

      if (componentInteraction.customId === ids.speedup && componentInteraction.isStringSelectMenu()) {
        settings.speedUp = Math.max(1, Math.min(8, Number(componentInteraction.values[0]) || 1));
        await saveUserLabSettings(storageUserId, settings, cloudContext);
        await refreshReply(componentInteraction);
        return;
      }

      await componentInteraction.deferUpdate();
    });

    collector.on('end', async () => {
      const disabledRows = buildComponents().map(row => {
        row.components.forEach(component => component.setDisabled(true));
        return row;
      });

      await interaction.editReply({
        embeds: [buildEmbed().setFooter({ text: labConfig.ui.sessionEnded })],
        components: disabledRows,
      }).catch(() => {});
    });
  },
};
