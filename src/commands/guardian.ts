import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  type APIEmbedField,
  type EmbedBuilder,
} from 'discord.js'
import {
  formatGroupedToolNumber,
  formatOptionalGroupedToolNumber,
  GUARDIAN_STATE_SCHEMA_VERSION,
  getGuardianCostValuesCompat,
  type GuardianDefinitionCompat,
  getGuardianMaxLevelCompat,
  getGuardianStatNamesCompat,
  getGuardianStatValuesCompat,
  getDefaultLevelRange,
  type GuardianSharedState,
  normalizeGuardianSharedState,
  type ConfigurableCell,
  type ConfigurableTableDocument,
  stableEquals,
} from '@tmrxjd/platform/tools'
import { createChatInputCommand } from '../core/command-factory'
import { createCommandEmbed } from '../core/command-ui'
import { getBotConfig } from '../config/bot-config'
import { brandCommandEmbed } from '../services/command-embed-branding'
import { buildGuardianDefinitions } from '../services/guardians-shared-data'
import { appendShareButtonRow, shareCurrentRender } from '../services/command-share'
import { getUserCommandSharedState, reconcileUserCommandSharedState, saveUserCommandSharedState } from '../services/user-command-shared-state'
import { resolveUserStorageState } from '../services/user-storage-resolution'
import { renderConfigurableTablePng, renderTableChartPng } from '../services/table-chart-render'
import { showModalAndAwaitSubmit } from '../services/modal-submit'
import { runCloudReconcileUi } from '../services/cloud-reconcile-ui'
import type { ToolsBotClient } from '../core/tools-bot-client'

const guardianConfig = getBotConfig().commands.guardian
const GUARDIAN_SHARE_BUTTON_ID = 'guardian_share'
const guardianDefinitions = buildGuardianDefinitions() as GuardianDefinitionCompat[]
const guardianByKey = new Map(guardianDefinitions.map(def => [def.key.toLowerCase(), def]))

function getDefaultGuardianRange(maxLevel: number): { startLevel: number; targetLevel: number } {
  return getDefaultLevelRange(0, Math.max(0, maxLevel))
}

function calculateRangeCost(costs: Array<number | null> | undefined, startLevel: number, targetLevel: number): number {
  if (!costs || targetLevel <= startLevel) return 0
  let total = 0
  for (let level = startLevel + 1; level <= targetLevel; level += 1) {
    const cost = costs[level]
    if (typeof cost === 'number' && Number.isFinite(cost)) {
      total += cost
    }
  }
  return total
}

type GuardianLevelRow = {
  level: number
  value: string
  cost: number
  cumulativeCost: number
}

function buildGuardianLevelRows(values: Array<string | number | null | undefined>, costs: Array<number | null> | undefined, startLevel: number, targetLevel: number): GuardianLevelRow[] {
  const rows: GuardianLevelRow[] = []
  let cumulativeCost = 0
  for (let level = startLevel; level <= targetLevel; level += 1) {
    const rawCost = level === startLevel ? 0 : costs?.[level]
    const levelCost = typeof rawCost === 'number' && Number.isFinite(rawCost) ? rawCost : 0
    if (level > startLevel) {
      cumulativeCost += levelCost
    }
    rows.push({
      level,
      value: String(values[level] ?? guardianConfig.ui.noneValue),
      cost: levelCost,
      cumulativeCost,
    })
  }
  return rows
}

async function buildGuardianAttachment(args: {
  typeLabel: string
  statLabel: string
  rows: GuardianLevelRow[]
  summary: string
  discordUserId: string
}): Promise<AttachmentBuilder | null> {
  try {
    const image = await renderTableChartPng({
      title: `${args.typeLabel} - ${args.statLabel} Cost Table`,
      headers: ['Lvl', 'Value', 'Cost', 'Total'],
      rows: args.rows.map(row => [
        row.level.toString(),
        row.value,
        formatOptionalGroupedToolNumber(row.cost, guardianConfig.ui.noneValue),
        formatOptionalGroupedToolNumber(row.cumulativeCost, guardianConfig.ui.noneValue),
      ]),
      descriptionLines: [args.summary],
    }, args.discordUserId)
    return new AttachmentBuilder(image, { name: 'guardian-costs.png' })
  } catch {
    return null
  }
}

async function buildGuardianMultiStatAttachment(args: {
  typeLabel: string
  statRows: Array<{ statName: string; rows: GuardianLevelRow[] }>
  discordUserId: string
}): Promise<AttachmentBuilder | null> {
  try {
    const minLevel = args.statRows.reduce((lowest, entry) => {
      if (entry.rows.length === 0) return lowest
      return Math.min(lowest, entry.rows[0].level)
    }, Number.POSITIVE_INFINITY)
    const maxLevel = args.statRows.reduce((highest, entry) => {
      if (entry.rows.length === 0) return highest
      return Math.max(highest, entry.rows[entry.rows.length - 1]?.level ?? highest)
    }, Number.NEGATIVE_INFINITY)

    if (!Number.isFinite(minLevel) || !Number.isFinite(maxLevel) || minLevel > maxLevel) {
      return null
    }

    const headerRowTop: ConfigurableCell[] = [{ value: 'Level', styleLink: 'allHeaders' }]
    const headerRowBottom: ConfigurableCell[] = [{ value: '', styleLink: 'allHeaders' }]
    const merges: ConfigurableTableDocument['merges'] = [{ row: 0, col: 0, rowSpan: 2, colSpan: 1 }]
    const statGroups: ConfigurableTableDocument['statGroups'] = []

    for (const entry of args.statRows) {
      const groupStartColumn = headerRowTop.length
      headerRowTop.push({ value: entry.statName, styleLink: 'allHeaders' }, { value: '', styleLink: 'allHeaders' }, { value: '', styleLink: 'allHeaders' })
      headerRowBottom.push({ value: 'Value', styleLink: 'allHeaders' }, { value: 'Cost', styleLink: 'allHeaders' }, { value: 'Total', styleLink: 'allHeaders' })
      merges.push({ row: 0, col: headerRowTop.length - 3, rowSpan: 1, colSpan: 3 })
      statGroups.push({
        key: entry.statName,
        label: entry.statName,
        valueColumn: groupStartColumn,
        costColumn: groupStartColumn + 1,
        totalColumn: groupStartColumn + 2,
      })
    }

    const rows: ConfigurableCell[][] = [headerRowTop, headerRowBottom]

    for (let level = minLevel; level <= maxLevel; level += 1) {
      const row: ConfigurableCell[] = [{ value: String(level) }]
      for (const entry of args.statRows) {
        const levelRow = entry.rows.find(candidate => candidate.level === level)
        row.push(
          { value: levelRow?.value ?? '' },
                  { value: levelRow ? formatOptionalGroupedToolNumber(levelRow.cost, guardianConfig.ui.noneValue) : '' },
                  { value: levelRow ? formatOptionalGroupedToolNumber(levelRow.cumulativeCost, guardianConfig.ui.noneValue) : '' },
        )
      }
      rows.push(row)
    }

    const image = await renderConfigurableTablePng({
      title: `${args.typeLabel} Guardian Level Cost Table`,
      rows,
      merges,
      statGroups,
    }, args.discordUserId)

    return new AttachmentBuilder(image, { name: 'guardian-costs.png' })
  } catch {
    return null
  }
}

const data = new SlashCommandBuilder()
  .setName(guardianConfig.name)
  .setDescription(guardianConfig.description)
  .addStringOption(option => {
    const built = option
      .setName(guardianConfig.options.type.name)
      .setDescription(guardianConfig.options.type.description)
      .setRequired(false)

    for (const def of guardianDefinitions) {
      built.addChoices({ name: def.label, value: def.key })
    }

    return built
  })
  .addIntegerOption(option =>
    option
      .setName(guardianConfig.options.startLevel.name)
      .setDescription(guardianConfig.options.startLevel.description)
      .setRequired(false)
      .setMinValue(0),
  )
  .addIntegerOption(option =>
    option
      .setName(guardianConfig.options.targetLevel.name)
      .setDescription(guardianConfig.options.targetLevel.description)
      .setRequired(false)
      .setMinValue(0),
  )
  .addStringOption(option =>
    option
      .setName(guardianConfig.options.stat.name)
      .setDescription(guardianConfig.options.stat.description)
      .setRequired(false),
  )

export const guardianCommand = createChatInputCommand(data, async interaction => {
  // Acknowledge within Discord's 3s window BEFORE any cloud/storage reads.
  await interaction.deferReply({ ephemeral: true })

  const defaultState = normalizeGuardianSharedState(null)
  const hasMeaningfulState = (candidate: GuardianSharedState): boolean => (
    !stableEquals(candidate, defaultState)
  )

  const resolvedStorage = await resolveUserStorageState({
    discordUserId: interaction.user.id,
    load: storageId => getUserCommandSharedState(storageId, 'guardian', normalizeGuardianSharedState),
    hasMeaningfulState,
  })

  const storageUserId = resolvedStorage.storageUserId
  let persisted = resolvedStorage.state

  const optionType = interaction.options.getString(guardianConfig.options.type.name)
  const optionStartLevel = interaction.options.getInteger(guardianConfig.options.startLevel.name)
  const optionTargetLevel = interaction.options.getInteger(guardianConfig.options.targetLevel.name)
  const optionStat = interaction.options.getString(guardianConfig.options.stat.name)
  const hasStartLevelOption = optionStartLevel !== null
  const hasTargetLevelOption = optionTargetLevel !== null

  if (optionType) {
    const found = guardianByKey.get(optionType.toLowerCase())
    if (!found) {
      await interaction.editReply({
        content: guardianConfig.ui.unknownTypeTemplate.replace('{type}', optionType),
      })
      return
    }
    persisted.type = found.key
  }

  const selectedDefinition = guardianByKey.get(persisted.type.toLowerCase())
  const selectedMaxLevel = selectedDefinition ? getGuardianMaxLevelCompat(selectedDefinition) : 0
  const usingLegacyDefaultRange = persisted.startLevel === 1 && persisted.targetLevel === 1
  if (!hasStartLevelOption && !hasTargetLevelOption && usingLegacyDefaultRange) {
    const defaultRange = getDefaultGuardianRange(selectedMaxLevel)
    persisted.startLevel = defaultRange.startLevel
    persisted.targetLevel = defaultRange.targetLevel
  }

  if (optionStartLevel !== null) {
    persisted.startLevel = Math.max(0, Math.min(selectedMaxLevel, Math.floor(optionStartLevel)))
  }
  if (optionTargetLevel !== null) {
    persisted.targetLevel = Math.max(0, Math.min(selectedMaxLevel, Math.floor(optionTargetLevel)))
  }
  if (persisted.targetLevel < persisted.startLevel) {
    persisted.targetLevel = persisted.startLevel
  }

  if (optionStat) {
    const raw = optionStat.trim().toLowerCase()
    if (raw === 'all') {
      persisted.selectedStats = []
    } else {
      const matched = selectedDefinition
        ? getGuardianStatNamesCompat(selectedDefinition).find(stat => stat.toLowerCase() === raw)
        : undefined
      persisted.selectedStats = matched ? [matched] : []
    }
  }

  persisted = normalizeGuardianSharedState(persisted)

  const persistState = async () => {
    await saveUserCommandSharedState(storageUserId, 'guardian', persisted, normalizeGuardianSharedState)
  }
  const shouldPersistInitialState = optionType !== null || optionStat !== null || optionStartLevel !== null || optionTargetLevel !== null

  const createRender = async (): Promise<{ embed: EmbedBuilder; maxLevel: number; files: AttachmentBuilder[] }> => {
    const definition = guardianByKey.get(persisted.type.toLowerCase())
    if (!definition) {
      return {
        embed: createCommandEmbed({
          title: guardianConfig.ui.fallbackTitle,
          description: guardianConfig.ui.fallbackDescription,
          color: guardianConfig.color,
          includeTimestamp: false,
        }).setFooter({ text: '' }),
        maxLevel: 0,
        files: [],
      }
    }

    const statNames = getGuardianStatNamesCompat(definition)
    const statValues = getGuardianStatValuesCompat(definition)
    const statCosts = getGuardianCostValuesCompat(definition)
    const maxLevel = getGuardianMaxLevelCompat(definition)
    const startLevel = Math.max(0, Math.min(maxLevel, persisted.startLevel))
    const targetLevel = Math.max(startLevel, Math.min(maxLevel, persisted.targetLevel))
    persisted.startLevel = startLevel
    persisted.targetLevel = targetLevel

    const availableStats = statNames
    const selectedStats = persisted.selectedStats.filter(stat => availableStats.includes(stat))
    if (selectedStats.length === 0) {
      persisted.selectedStats = [...availableStats]
    } else {
      persisted.selectedStats = selectedStats
    }

    const selectedSet = new Set(persisted.selectedStats)

    const selectedRows = statNames
      .map((statName, statIndex) => ({ statName, statIndex }))
      .filter(entry => selectedSet.has(entry.statName))
      .map(({ statName, statIndex }) => {
        const rows = buildGuardianLevelRows(statValues[statIndex] ?? [], statCosts[statIndex], startLevel, targetLevel)
        const startValue = statValues[statIndex]?.[startLevel] ?? guardianConfig.ui.noneValue
        const targetValue = statValues[statIndex]?.[targetLevel] ?? guardianConfig.ui.noneValue
        const statCost = calculateRangeCost(statCosts[statIndex], startLevel, targetLevel)

        return {
          statName,
          rows,
          startValue,
          targetValue,
          statCost,
        }
      })

    const fields: APIEmbedField[] = selectedRows.map(({ statName, targetValue, statCost }) => {
      return {
        name: statName,
        value: guardianConfig.ui.statLineTemplate
          .replace('{value}', String(targetValue))
          .replace('{cost}', formatOptionalGroupedToolNumber(statCost, guardianConfig.ui.noneValue)),
        inline: true,
      }
    })

    const totalCost = selectedRows.reduce((sum, row) => sum + row.statCost, 0)

    const summary = `${definition.label} • Levels ${startLevel} → ${targetLevel}`
    const totals = `Total Cost: ${formatOptionalGroupedToolNumber(totalCost, guardianConfig.ui.noneValue)} • Stats: ${selectedRows.length}`
    let attachment: AttachmentBuilder | null = null

    if (selectedRows.length === 1) {
      const single = selectedRows[0]
      if (single) {
        attachment = await buildGuardianAttachment({
          typeLabel: definition.label,
          statLabel: single.statName,
          rows: single.rows,
          summary,
          discordUserId: interaction.user.id,
        })
      }
    } else {
      attachment = await buildGuardianMultiStatAttachment({
        typeLabel: definition.label,
        statRows: selectedRows.map(entry => ({ statName: entry.statName, rows: entry.rows })),
        discordUserId: interaction.user.id,
      })
    }

    const embed = brandCommandEmbed(createCommandEmbed({
      title: guardianConfig.ui.titleTemplate
        .replace('{guardian}', definition.label)
        .replace('{start}', String(startLevel))
        .replace('{target}', String(targetLevel))
        .replace('{max}', String(maxLevel)),
      description: guardianConfig.ui.description,
      color: guardianConfig.color,
      fields,
      includeTimestamp: false,
    }), guardianConfig.name)

    if (attachment) {
      embed.setImage('attachment://guardian-costs.png')
    }

    return { embed, maxLevel, files: attachment ? [attachment] : [] }
  }

  const buildComponents = (disabled = false) => {
    const activeDefinition = guardianByKey.get(persisted.type.toLowerCase())
    const availableStats = activeDefinition ? getGuardianStatNamesCompat(activeDefinition) : []
    const selectedSet = new Set(
      persisted.selectedStats.length > 0
        ? persisted.selectedStats.filter(stat => availableStats.includes(stat))
        : availableStats,
    )

    const typeRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(guardianConfig.ids.typeSelect)
        .setPlaceholder(guardianConfig.ui.typePlaceholder)
        .setDisabled(disabled)
        .setOptions(
          guardianDefinitions.map(def => ({
            label: def.label,
            value: def.key,
            default: def.key === persisted.type,
          })),
        ),
    )

    const statOptions = [
      {
        label: guardianConfig.ui.statAllLabel,
        value: 'all',
        description: guardianConfig.ui.statAllDescription,
        default: selectedSet.size === availableStats.length,
      },
      ...availableStats.map(stat => ({
        label: stat,
        value: stat,
        description: guardianConfig.ui.statDescriptionTemplate.replace('{stat}', stat),
        default: selectedSet.has(stat),
      })),
    ]

    const statRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(guardianConfig.ids.statSelect)
        .setPlaceholder(guardianConfig.ui.statPlaceholder)
        .setDisabled(disabled || availableStats.length === 0)
        .setMinValues(1)
        .setMaxValues(Math.max(1, Math.min(25, statOptions.length)))
        .setOptions(statOptions),
    )

    const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(guardianConfig.ids.setLevel)
        .setLabel(guardianConfig.ui.setLevelLabel)
        .setStyle(ButtonStyle.Primary)
        .setDisabled(disabled),
    )

        return appendShareButtonRow([typeRow, statRow, buttonRow], GUARDIAN_SHARE_BUTTON_ID)
  }

  const initial = await createRender()
  await interaction.editReply({
    embeds: [initial.embed],
    components: buildComponents(),
    files: initial.files,
  })

  if (shouldPersistInitialState) {
    void persistState()
  }

  void (async () => {
    const reconcile = await reconcileUserCommandSharedState(storageUserId, 'guardian', normalizeGuardianSharedState)
    await runCloudReconcileUi<GuardianSharedState>({
      interaction,
      promptKey: 'guardian-sync',
      userId: interaction.user.id,
      autoCloudEnabled: reconcile.autoCloudEnabled,
      direction: reconcile.direction,
      hasDifference: reconcile.hasDifference,
      cloudState: reconcile.cloudState,
      applyCloudToLocal: reconcile.applyCloudToLocal,
      applyLocalToCloud: reconcile.applyLocalToCloud,
      onCloudApplied: async next => {
        persisted = normalizeGuardianSharedState(next)
        const updated = await createRender()
        await interaction.editReply({
          embeds: [updated.embed],
          components: buildComponents(),
          files: updated.files,
        })
      },
    })
  })()

  const reply = await interaction.fetchReply()
  if (!('createMessageComponentCollector' in reply)) return

  const collector = reply.createMessageComponentCollector({
    time: guardianConfig.behavior.collectorTimeoutMs,
    filter: i => i.user.id === interaction.user.id,
  })
  const client = interaction.client as ToolsBotClient
  const scopedSessionId = `guardian:${interaction.id}`
  client.scopedInteractionSessions.register({
    sessionId: scopedSessionId,
    ownerUserId: interaction.user.id,
    messageId: reply.id,
    modalCustomIds: [guardianConfig.ids.levelModal],
    ttlMs: guardianConfig.behavior.collectorTimeoutMs,
  })

  collector.on('collect', async componentInteraction => {
    if (componentInteraction.isButton() && componentInteraction.customId === GUARDIAN_SHARE_BUTTON_ID) {
      await shareCurrentRender(componentInteraction, {
        commandName: guardianConfig.name,
        render: async () => {
          const rendered = await createRender()
          return { embeds: [rendered.embed], files: rendered.files }
        },
      })
      return
    }

    if (componentInteraction.isStringSelectMenu() && componentInteraction.customId === guardianConfig.ids.typeSelect) {
      const nextType = componentInteraction.values[0] ?? persisted.type
      const nextDefinition = guardianByKey.get(nextType.toLowerCase())
      if (!nextDefinition) {
        await componentInteraction.reply({
          content: guardianConfig.ui.unknownTypeTemplate.replace('{type}', nextType),
          ephemeral: true,
        })
        return
      }

      persisted.type = nextDefinition.key
      const maxLevel = getGuardianMaxLevelCompat(nextDefinition)
      const nextStatNames = getGuardianStatNamesCompat(nextDefinition)
      persisted.startLevel = Math.max(0, Math.min(maxLevel, persisted.startLevel))
      persisted.targetLevel = Math.max(persisted.startLevel, Math.min(maxLevel, persisted.targetLevel))
      persisted.selectedStats = persisted.selectedStats.filter(stat => nextStatNames.includes(stat))
      if (persisted.selectedStats.length === 0) {
        persisted.selectedStats = [...nextStatNames]
      }

      await persistState()
      await componentInteraction.deferUpdate()
      const updated = await createRender()
      await interaction.editReply({
        embeds: [updated.embed],
        components: buildComponents(),
        files: updated.files,
      })
      return
    }

    if (componentInteraction.isStringSelectMenu() && componentInteraction.customId === guardianConfig.ids.statSelect) {
      const activeDefinition = guardianByKey.get(persisted.type.toLowerCase())
      if (!activeDefinition) {
        await componentInteraction.reply({ content: guardianConfig.ui.fallbackDescription, ephemeral: true })
        return
      }
      const activeStatNames = getGuardianStatNamesCompat(activeDefinition)

      const values = componentInteraction.values
      if (values.includes('all') && values.length === 1) {
        persisted.selectedStats = [...activeStatNames]
      } else {
        const next = values
          .filter(value => value !== 'all')
          .filter(value => activeStatNames.includes(value))
        persisted.selectedStats = next.length > 0 ? next : [...activeStatNames]
      }

      await persistState()
      await componentInteraction.deferUpdate()
      const updated = await createRender()
      await interaction.editReply({
        embeds: [updated.embed],
        components: buildComponents(),
        files: updated.files,
      })
      return
    }

    if (componentInteraction.isButton() && componentInteraction.customId === guardianConfig.ids.setLevel) {
      const activeDefinition = guardianByKey.get(persisted.type.toLowerCase())
      const maxLevel = activeDefinition ? getGuardianMaxLevelCompat(activeDefinition) : 0

      const modal = new ModalBuilder()
        .setCustomId(guardianConfig.ids.levelModal)
        .setTitle(guardianConfig.ui.levelModalTitle)
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId(guardianConfig.ids.startLevelInput)
              .setLabel(guardianConfig.ui.startLevelInputLabel)
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setValue(String(persisted.startLevel)),
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId(guardianConfig.ids.targetLevelInput)
              .setLabel(guardianConfig.ui.targetLevelInputLabel)
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setValue(String(persisted.targetLevel)),
          ),
        )

      const submitted = await showModalAndAwaitSubmit({
        componentInteraction,
        modal,
        baseCustomId: guardianConfig.ids.levelModal,
        userId: interaction.user.id,
        timeoutMs: guardianConfig.behavior.modalSubmitTimeoutMs,
      })
      if (!submitted) {
        return
      }

      const nextStartRaw = Number(submitted.fields.getTextInputValue(guardianConfig.ids.startLevelInput))
      const nextTargetRaw = Number(submitted.fields.getTextInputValue(guardianConfig.ids.targetLevelInput))
      const nextStart = Math.floor(nextStartRaw)
      const nextTarget = Math.floor(nextTargetRaw)
      if (!Number.isFinite(nextStart) || !Number.isFinite(nextTarget) || nextStart < 0 || nextTarget < 0 || nextStart > maxLevel || nextTarget > maxLevel || nextTarget < nextStart) {
        await submitted.reply({
          content: guardianConfig.ui.invalidLevelTemplate
            .replace('{min}', '0')
            .replace('{max}', String(maxLevel)),
          ephemeral: true,
        })
        return
      }

      persisted.startLevel = nextStart
      persisted.targetLevel = nextTarget
      await persistState()
      const updated = await createRender()
      await submitted.deferUpdate()
      await interaction.editReply({
        embeds: [updated.embed],
        components: buildComponents(),
        files: updated.files,
      })
      return
    }

    await componentInteraction.reply({ content: guardianConfig.ui.notYourSession, ephemeral: true })
  })

  collector.on('end', async () => {
    client.scopedInteractionSessions.unregister(scopedSessionId)
    const finalRender = await createRender()
    await interaction.editReply({
      embeds: [finalRender.embed],
      components: buildComponents(true),
      files: finalRender.files,
    })
  })
})