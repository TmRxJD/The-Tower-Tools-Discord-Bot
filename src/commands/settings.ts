import { ActionRowBuilder, EmbedBuilder, SlashCommandBuilder, StringSelectMenuBuilder } from 'discord.js'
import type { CommandModule } from '../core/command-types'
import {
  chartDataAlignmentIds,
  chartPalettePresets,
  defaultSharedUserToolSettings,
  governedDateFormatOptions,
  governedDateFormatPreferenceIds,
  governedDecimalSeparatorOptions,
  governedDecimalSeparatorPreferenceIds,
  governedLanguageOptions,
  governedLanguagePreferenceIds,
  isChartDataAlignmentId,
  isChartPalettePresetId,
} from '@tmrxjd/platform/tools'
import { getBotConfig } from '../config/bot-config'
import {
  getEffectiveUserSharedSettings,
  getUserSharedSettings,
  type LocalSharedUserToolSettings,
  reconcileUserSharedSettings,
  saveUserSharedSettings,
} from '../services/user-shared-settings-db'
import { runCloudReconcileUi } from '../services/cloud-reconcile-ui'
import { resolveCanonicalAppwriteUserId } from '../services/identity'
import type { ToolsBotClient } from '../core/tools-bot-client'

const settingsConfig = getBotConfig().commands.settings

function isLanguagePreference(value: string): value is LocalSharedUserToolSettings['languagePreference'] {
  return governedLanguagePreferenceIds.includes(value as LocalSharedUserToolSettings['languagePreference'])
}

function isDateFormatPreference(value: string): value is LocalSharedUserToolSettings['dateFormatPreference'] {
  return governedDateFormatPreferenceIds.includes(value as LocalSharedUserToolSettings['dateFormatPreference'])
}

function isDecimalSeparatorPreference(value: string): value is LocalSharedUserToolSettings['decimalSeparatorPreference'] {
  return governedDecimalSeparatorPreferenceIds.includes(value as LocalSharedUserToolSettings['decimalSeparatorPreference'])
}

const data = new SlashCommandBuilder()
  .setName(settingsConfig.name)
  .setDescription(settingsConfig.description)
  .addStringOption(option => {
    const built = option
      .setName(settingsConfig.options.cloudSync.name)
      .setDescription(settingsConfig.options.cloudSync.description)
      .setRequired(false)
      .addChoices(
        { name: settingsConfig.options.cloudChoices.enabled, value: 'enabled' },
        { name: settingsConfig.options.cloudChoices.disabled, value: 'disabled' },
      )

    return built
  })
  .addStringOption(option => {
    const built = option
      .setName(settingsConfig.options.chartPalette.name)
      .setDescription(settingsConfig.options.chartPalette.description)
      .setRequired(false)

    for (const preset of chartPalettePresets) {
      built.addChoices({ name: preset.label, value: preset.id })
    }

    return built
  })
  .addStringOption(option => option
    .setName(settingsConfig.options.chartAlignment.name)
    .setDescription(settingsConfig.options.chartAlignment.description)
    .setRequired(false)
    .addChoices(
      { name: settingsConfig.options.alignmentChoices.left, value: 'left' },
      { name: settingsConfig.options.alignmentChoices.center, value: 'center' },
      { name: settingsConfig.options.alignmentChoices.right, value: 'right' },
    ))
  .addStringOption(option => {
    const built = option
      .setName(settingsConfig.options.language.name)
      .setDescription(settingsConfig.options.language.description)
      .setRequired(false)

    for (const language of governedLanguagePreferenceIds) {
      built.addChoices({
        name: language === 'auto'
          ? settingsConfig.ui.autoOptionLabel
          : (governedLanguageOptions.find(entry => entry.id === language)?.label ?? language),
        value: language,
      })
    }

    return built
  })
  .addStringOption(option => {
    const built = option
      .setName(settingsConfig.options.dateFormat.name)
      .setDescription(settingsConfig.options.dateFormat.description)
      .setRequired(false)

    for (const dateFormat of governedDateFormatPreferenceIds) {
      built.addChoices({
        name: dateFormat === 'auto'
          ? settingsConfig.ui.autoOptionLabel
          : (governedDateFormatOptions.find(entry => entry.id === dateFormat)?.label ?? dateFormat),
        value: dateFormat,
      })
    }

    return built
  })
  .addStringOption(option => {
    const built = option
      .setName(settingsConfig.options.decimalSeparator.name)
      .setDescription(settingsConfig.options.decimalSeparator.description)
      .setRequired(false)

    for (const decimalSeparator of governedDecimalSeparatorPreferenceIds) {
      built.addChoices({
        name: decimalSeparator === 'auto'
          ? settingsConfig.ui.autoOptionLabel
          : (governedDecimalSeparatorOptions.find(entry => entry.id === decimalSeparator)?.label ?? decimalSeparator),
        value: decimalSeparator,
      })
    }

    return built
  })

function formatCloudSync(value: boolean): string {
  return value ? settingsConfig.ui.enabled : settingsConfig.ui.disabled
}

function formatPaletteLabel(presetId: string): string {
  const match = chartPalettePresets.find(entry => entry.id === presetId)
  return match?.label ?? presetId
}

function formatAlignmentLabel(alignment: LocalSharedUserToolSettings['chartDataAlignment']): string {
  return settingsConfig.options.alignmentChoices[alignment] ?? alignment
}

function formatLanguageLabel(language: LocalSharedUserToolSettings['languagePreference']): string {
  if (language === 'auto') {
    return settingsConfig.ui.autoOptionLabel
  }

  return governedLanguageOptions.find(entry => entry.id === language)?.label ?? language
}

function formatDateFormatLabel(dateFormat: LocalSharedUserToolSettings['dateFormatPreference']): string {
  if (dateFormat === 'auto') {
    return settingsConfig.ui.autoOptionLabel
  }

  return governedDateFormatOptions.find(entry => entry.id === dateFormat)?.label ?? dateFormat
}

function formatDecimalSeparatorLabel(decimalSeparator: LocalSharedUserToolSettings['decimalSeparatorPreference']): string {
  if (decimalSeparator === 'auto') {
    return settingsConfig.ui.autoOptionLabel
  }

  return governedDecimalSeparatorOptions.find(entry => entry.id === decimalSeparator)?.label ?? decimalSeparator
}

function buildSettingsComponents(candidate: LocalSharedUserToolSettings) {
  const cloudRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(settingsConfig.ids.cloudSyncSelect)
      .setPlaceholder(settingsConfig.ui.cloudPlaceholder)
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions([
        {
          label: settingsConfig.options.cloudChoices.enabled,
          value: 'enabled',
          default: candidate.cloudSyncEnabled,
        },
        {
          label: settingsConfig.options.cloudChoices.disabled,
          value: 'disabled',
          default: !candidate.cloudSyncEnabled,
        },
      ]),
  )

  const paletteRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(settingsConfig.ids.chartPaletteSelect)
      .setPlaceholder(settingsConfig.ui.palettePlaceholder)
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(chartPalettePresets.map(preset => ({
        label: preset.label,
        value: preset.id,
        description: preset.description,
        default: candidate.chartPalettePreset === preset.id,
      }))),
  )

  const alignmentRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(settingsConfig.ids.chartAlignmentSelect)
      .setPlaceholder(settingsConfig.ui.alignmentPlaceholder)
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(chartDataAlignmentIds.map(alignment => ({
        label: formatAlignmentLabel(alignment),
        value: alignment,
        default: candidate.chartDataAlignment === alignment,
      }))),
  )

  const languageRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(settingsConfig.ids.languageSelect)
      .setPlaceholder(settingsConfig.ui.languagePlaceholder)
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(governedLanguagePreferenceIds.map((language: string) => ({
        label: language === 'auto'
          ? settingsConfig.ui.autoOptionLabel
          : (governedLanguageOptions.find(entry => entry.id === language)?.label ?? language),
        value: language,
        default: candidate.languagePreference === language,
      }))),
  )

  const dateFormatRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(settingsConfig.ids.dateFormatSelect)
      .setPlaceholder(settingsConfig.ui.dateFormatPlaceholder)
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(governedDateFormatPreferenceIds.map((dateFormat: string) => ({
        label: dateFormat === 'auto'
          ? settingsConfig.ui.autoOptionLabel
          : (governedDateFormatOptions.find(entry => entry.id === dateFormat)?.label ?? dateFormat),
        value: dateFormat,
        default: candidate.dateFormatPreference === dateFormat,
      }))),
  )

  const decimalSeparatorRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(settingsConfig.ids.decimalSeparatorSelect)
      .setPlaceholder(settingsConfig.ui.decimalSeparatorPlaceholder)
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(governedDecimalSeparatorPreferenceIds.map((decimalSeparator: string) => ({
        label: decimalSeparator === 'auto'
          ? settingsConfig.ui.autoOptionLabel
          : (governedDecimalSeparatorOptions.find(entry => entry.id === decimalSeparator)?.label ?? decimalSeparator),
        value: decimalSeparator,
        default: candidate.decimalSeparatorPreference === decimalSeparator,
      }))),
  )

  return [cloudRow, paletteRow, alignmentRow, languageRow, dateFormatRow, decimalSeparatorRow]
}

export const settingsCommand: CommandModule = {
  data: data.toJSON(),
  async execute(interaction) {
    if (!interaction.isChatInputCommand()) {
      return
    }

    const cloudSyncValue = interaction.options.getString(settingsConfig.options.cloudSync.name)
    const paletteValue = interaction.options.getString(settingsConfig.options.chartPalette.name)
    const alignmentValue = interaction.options.getString(settingsConfig.options.chartAlignment.name)
    const languageValue = interaction.options.getString(settingsConfig.options.language.name)
    const dateFormatValue = interaction.options.getString(settingsConfig.options.dateFormat.name)
    const decimalSeparatorValue = interaction.options.getString(settingsConfig.options.decimalSeparator.name)

    const discordUserId = interaction.user.id

    const canonicalUserId = resolveCanonicalAppwriteUserId(discordUserId)
    const storageUserId = canonicalUserId && canonicalUserId !== discordUserId
      ? canonicalUserId
      : discordUserId
    const current = await getEffectiveUserSharedSettings(discordUserId)

    const next = {
      ...current,
      ...(cloudSyncValue
        ? { cloudSyncEnabled: cloudSyncValue === 'enabled' }
        : {}),
      ...(paletteValue && isChartPalettePresetId(paletteValue)
        ? { chartPalettePreset: paletteValue }
        : {}),
      ...(alignmentValue && isChartDataAlignmentId(alignmentValue)
        ? { chartDataAlignment: alignmentValue }
        : {}),
      ...(languageValue && isLanguagePreference(languageValue)
        ? { languagePreference: languageValue }
        : {}),
      ...(dateFormatValue && isDateFormatPreference(dateFormatValue)
        ? { dateFormatPreference: dateFormatValue }
        : {}),
      ...(decimalSeparatorValue && isDecimalSeparatorPreference(decimalSeparatorValue)
        ? { decimalSeparatorPreference: decimalSeparatorValue }
        : {}),
    }

    await saveUserSharedSettings(storageUserId, next)

    const updated = await getUserSharedSettings(storageUserId)
    const changed = cloudSyncValue !== null
      || paletteValue !== null
      || alignmentValue !== null
      || languageValue !== null
      || dateFormatValue !== null
      || decimalSeparatorValue !== null

    const status = changed
      ? settingsConfig.ui.savedMessage
      : settingsConfig.ui.currentMessage

    const buildEmbed = (candidate: typeof updated, description: string) => {
      const selectedPreset = chartPalettePresets.find(entry => entry.id === candidate.chartPalettePreset) ?? chartPalettePresets[0]
      const embed = new EmbedBuilder()
        .setTitle(settingsConfig.ui.title)
        .setDescription(description)
        .addFields(
          {
            name: settingsConfig.ui.cloudField,
            value: formatCloudSync(candidate.cloudSyncEnabled),
            inline: true,
          },
          {
            name: settingsConfig.ui.paletteField,
            value: `${formatPaletteLabel(candidate.chartPalettePreset)} (${selectedPreset.id})`,
            inline: true,
          },
          {
            name: settingsConfig.ui.alignmentField,
            value: formatAlignmentLabel(candidate.chartDataAlignment),
            inline: true,
          },
          {
            name: settingsConfig.ui.languageField,
            value: formatLanguageLabel(candidate.languagePreference),
            inline: true,
          },
          {
            name: settingsConfig.ui.dateFormatField,
            value: formatDateFormatLabel(candidate.dateFormatPreference),
            inline: true,
          },
          {
            name: settingsConfig.ui.decimalSeparatorField,
            value: formatDecimalSeparatorLabel(candidate.decimalSeparatorPreference),
            inline: true,
          },
          {
            name: settingsConfig.ui.scopeField,
            value: settingsConfig.ui.scopeNote,
            inline: false,
          },
        )
        .setColor(settingsConfig.color)

      if (
        candidate.cloudSyncEnabled !== defaultSharedUserToolSettings.cloudSyncEnabled
        || candidate.chartPalettePreset !== defaultSharedUserToolSettings.chartPalettePreset
        || candidate.chartDataAlignment !== defaultSharedUserToolSettings.chartDataAlignment
        || candidate.languagePreference !== defaultSharedUserToolSettings.languagePreference
        || candidate.dateFormatPreference !== defaultSharedUserToolSettings.dateFormatPreference
        || candidate.decimalSeparatorPreference !== defaultSharedUserToolSettings.decimalSeparatorPreference
      ) {
        embed.setFooter({ text: settingsConfig.ui.nonDefaultFooter })
      }

      return embed
    }

    await interaction.reply({ embeds: [buildEmbed(updated, status)], components: buildSettingsComponents(updated), ephemeral: true })

    const reply = await interaction.fetchReply()
    if ('createMessageComponentCollector' in reply) {
      const client = interaction.client as ToolsBotClient
      const scopedSessionId = `settings:${interaction.id}`
      client.scopedInteractionSessions.register({
        sessionId: scopedSessionId,
        ownerUserId: interaction.user.id,
        messageId: reply.id,
        ttlMs: 10 * 60 * 1000,
      })
      const collector = reply.createMessageComponentCollector({
        time: 10 * 60 * 1000,
        filter: componentInteraction => componentInteraction.user.id === interaction.user.id,
      })

      collector.on('collect', async componentInteraction => {
        if (!componentInteraction.isStringSelectMenu()) {
          return
        }

        const nextSettings: LocalSharedUserToolSettings = { ...updated }
        const selectedValue = componentInteraction.values[0] ?? ''

        if (componentInteraction.customId === settingsConfig.ids.cloudSyncSelect) {
          nextSettings.cloudSyncEnabled = selectedValue === 'enabled'
        } else if (componentInteraction.customId === settingsConfig.ids.chartPaletteSelect && isChartPalettePresetId(selectedValue)) {
          nextSettings.chartPalettePreset = selectedValue
        } else if (componentInteraction.customId === settingsConfig.ids.chartAlignmentSelect && isChartDataAlignmentId(selectedValue)) {
          nextSettings.chartDataAlignment = selectedValue
        } else if (componentInteraction.customId === settingsConfig.ids.languageSelect && isLanguagePreference(selectedValue)) {
          nextSettings.languagePreference = selectedValue
        } else if (componentInteraction.customId === settingsConfig.ids.dateFormatSelect && isDateFormatPreference(selectedValue)) {
          nextSettings.dateFormatPreference = selectedValue
        } else if (componentInteraction.customId === settingsConfig.ids.decimalSeparatorSelect && isDecimalSeparatorPreference(selectedValue)) {
          nextSettings.decimalSeparatorPreference = selectedValue
        } else {
          return
        }

        await saveUserSharedSettings(storageUserId, nextSettings)
        const refreshed = await getUserSharedSettings(storageUserId)
        updated.cloudSyncEnabled = refreshed.cloudSyncEnabled
        updated.chartPalettePreset = refreshed.chartPalettePreset
        updated.chartDataAlignment = refreshed.chartDataAlignment
        updated.languagePreference = refreshed.languagePreference
        updated.dateFormatPreference = refreshed.dateFormatPreference
        updated.decimalSeparatorPreference = refreshed.decimalSeparatorPreference
        await componentInteraction.deferUpdate()
        await interaction.editReply({
          embeds: [buildEmbed(updated, settingsConfig.ui.savedMessage)],
          components: buildSettingsComponents(updated),
        })
      })

      collector.on('end', async () => {
        client.scopedInteractionSessions.unregister(scopedSessionId)
        await interaction.editReply({ components: [] }).catch(() => {})
      })
    }

    void (async () => {
      const reconcile = await reconcileUserSharedSettings(storageUserId)
      await runCloudReconcileUi({
        interaction,
        promptKey: 'settings-sync',
        userId: interaction.user.id,
        autoCloudEnabled: reconcile.autoCloudEnabled,
        direction: reconcile.direction,
        hasDifference: reconcile.hasDifference,
        cloudState: reconcile.cloudState,
        applyCloudToLocal: reconcile.applyCloudToLocal,
        applyLocalToCloud: reconcile.applyLocalToCloud,
        onCloudApplied: async (next) => {
          updated.cloudSyncEnabled = next.cloudSyncEnabled
          updated.chartPalettePreset = next.chartPalettePreset
          updated.chartDataAlignment = next.chartDataAlignment
          updated.languagePreference = next.languagePreference
          updated.dateFormatPreference = next.dateFormatPreference
          updated.decimalSeparatorPreference = next.decimalSeparatorPreference
          await interaction.editReply({ embeds: [buildEmbed(next, settingsConfig.ui.currentMessage)], components: buildSettingsComponents(next) })
        },
      })
    })()
  },
}
