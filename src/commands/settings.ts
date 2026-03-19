import { ActionRowBuilder, EmbedBuilder, SlashCommandBuilder, StringSelectMenuBuilder } from 'discord.js'
import type { CommandModule } from '../core/command-types'
import {
  chartDataAlignmentIds,
  chartPalettePresets,
  defaultSharedUserToolSettings,
  isChartDataAlignmentId,
  isChartPalettePresetId,
  type SharedUserToolSettings,
} from '@tmrxjd/platform/tools'
import { getBotConfig } from '../config/bot-config'
import { getEffectiveUserSharedSettings, getUserSharedSettings, reconcileUserSharedSettings, saveUserSharedSettings } from '../services/user-shared-settings-db'
import { runCloudReconcileUi } from '../services/cloud-reconcile-ui'
import { resolveCanonicalAppwriteUserId } from '../services/identity'

const settingsConfig = getBotConfig().commands.settings

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

function formatCloudSync(value: boolean): string {
  return value ? settingsConfig.ui.enabled : settingsConfig.ui.disabled
}

function formatPaletteLabel(presetId: string): string {
  const match = chartPalettePresets.find(entry => entry.id === presetId)
  return match?.label ?? presetId
}

function formatAlignmentLabel(alignment: SharedUserToolSettings['chartDataAlignment']): string {
  return settingsConfig.options.alignmentChoices[alignment] ?? alignment
}

function buildSettingsComponents(candidate: SharedUserToolSettings) {
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

  return [cloudRow, paletteRow, alignmentRow]
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
    }

    await saveUserSharedSettings(storageUserId, next)

    const updated = await getUserSharedSettings(storageUserId)
    const changed = cloudSyncValue !== null || paletteValue !== null || alignmentValue !== null

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
      ) {
        embed.setFooter({ text: settingsConfig.ui.nonDefaultFooter })
      }

      return embed
    }

    await interaction.reply({ embeds: [buildEmbed(updated, status)], components: buildSettingsComponents(updated), ephemeral: true })

    const reply = await interaction.fetchReply()
    if ('createMessageComponentCollector' in reply) {
      const collector = reply.createMessageComponentCollector({
        time: 10 * 60 * 1000,
        filter: componentInteraction => componentInteraction.user.id === interaction.user.id,
      })

      collector.on('collect', async componentInteraction => {
        if (!componentInteraction.isStringSelectMenu()) {
          return
        }

        const nextSettings: SharedUserToolSettings = { ...updated }
        const selectedValue = componentInteraction.values[0] ?? ''

        if (componentInteraction.customId === settingsConfig.ids.cloudSyncSelect) {
          nextSettings.cloudSyncEnabled = selectedValue === 'enabled'
        } else if (componentInteraction.customId === settingsConfig.ids.chartPaletteSelect && isChartPalettePresetId(selectedValue)) {
          nextSettings.chartPalettePreset = selectedValue
        } else if (componentInteraction.customId === settingsConfig.ids.chartAlignmentSelect && isChartDataAlignmentId(selectedValue)) {
          nextSettings.chartDataAlignment = selectedValue
        } else {
          return
        }

        await saveUserSharedSettings(storageUserId, nextSettings)
        const refreshed = await getUserSharedSettings(storageUserId)
        updated.cloudSyncEnabled = refreshed.cloudSyncEnabled
        updated.chartPalettePreset = refreshed.chartPalettePreset
        updated.chartDataAlignment = refreshed.chartDataAlignment
        await componentInteraction.deferUpdate()
        await interaction.editReply({
          embeds: [buildEmbed(updated, settingsConfig.ui.savedMessage)],
          components: buildSettingsComponents(updated),
        })
      })

      collector.on('end', async () => {
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
          await interaction.editReply({ embeds: [buildEmbed(next, settingsConfig.ui.currentMessage)], components: buildSettingsComponents(next) })
        },
      })
    })()
  },
}
