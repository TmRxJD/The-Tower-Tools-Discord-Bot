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
} from 'discord.js'
import type { CommandModule } from '../core/command-types'
import {
  buildUwStatCostRows,
  type ConfigurableCell,
  type ConfigurableTableDocument,
  findUwStatByName,
  findUwWeaponByName,
  formatGroupedToolNumber,
  getDefaultLevelRange,
  getUwStatMaxLevel,
  sumUwStatCostsBetween,
  uwStoneChartData,
} from '@tmrxjd/platform/tools'
import { getBotConfig } from '../config/bot-config'
import { brandCommandEmbed } from '../services/command-embed-branding'
import { appendShareButtonRow, shareCurrentRender } from '../services/command-share'
import { renderConfigurableTablePng, renderTableChartPng } from '../services/table-chart-render'
import { getUserCommandSharedState, reconcileUserCommandSharedState, saveUserCommandSharedState } from '../services/user-command-shared-state'
import { resolveUserStorageState } from '../services/user-storage-resolution'
import { runCloudReconcileUi } from '../services/cloud-reconcile-ui'
import { showModalAndAwaitSubmit } from '../services/modal-submit'

const stoneConfig = getBotConfig().commands.stone
const STONE_SHARE_BUTTON_ID = 'stone_share'

type StoneSharedState = {
  weaponName: string
  selectedStats: string[]
  startLevel: number
  targetLevel: number | null
}

function normalizeStoneSharedState(input: Record<string, unknown> | null): StoneSharedState {
  const parsedTarget = Number(input?.targetLevel)
  const selectedStats = Array.isArray(input?.selectedStats)
    ? input.selectedStats.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    : []
  const legacyStatName = typeof input?.statName === 'string' && input.statName.trim().length > 0 && input.statName.trim().toLowerCase() !== 'all'
    ? [input.statName]
    : []
  return {
    weaponName: typeof input?.weaponName === 'string' ? input.weaponName : '',
    selectedStats: selectedStats.length > 0 ? selectedStats : legacyStatName,
    startLevel: Number.isFinite(Number(input?.startLevel)) ? Math.max(0, Math.floor(Number(input?.startLevel))) : stoneConfig.defaults.startLevel,
    targetLevel: Number.isFinite(parsedTarget) ? Math.max(0, Math.floor(parsedTarget)) : null,
  }
}

const UW_DATA = uwStoneChartData

type StoneDisplayPreviewRow = {
  level: number
  value: string
  costLabel: string
  cumulativeLabel: string
}


function resolveAvailableStoneStats(weaponName: string): Array<NonNullable<ReturnType<typeof findUwWeaponByName>>['stats'][number]> {
  const weapon = findUwWeaponByName(UW_DATA, weaponName)
  return weapon?.stats ?? []
}

function resolveActiveStoneStats(weaponName: string, selectedStats: string[]): Array<NonNullable<ReturnType<typeof findUwWeaponByName>>['stats'][number]> {
  const availableStats = resolveAvailableStoneStats(weaponName)
  if (availableStats.length === 0) return []

  const selectedSet = new Set(selectedStats.filter(name => availableStats.some(stat => stat.name === name)))
  return selectedSet.size > 0
    ? availableStats.filter(stat => selectedSet.has(stat.name))
    : availableStats
}

function resolveStoneMaxLevel(weaponName: string, selectedStats: string[]): number | null {
  const activeStats = resolveActiveStoneStats(weaponName, selectedStats)
  const maxLevels = activeStats.map(stat => getUwStatMaxLevel(stat))
  return maxLevels.length > 0 ? Math.max(...maxLevels) : null
}

function resolveDefaultStoneTargetLevel(weaponName: string, selectedStats: string[], startLevel: number): number | null {
  const maxLevel = resolveStoneMaxLevel(weaponName, selectedStats)
  if (maxLevel == null) return null
  const boundedStart = Math.max(0, Math.min(maxLevel, Math.floor(startLevel)))
  return getDefaultLevelRange(boundedStart, maxLevel).targetLevel
}

async function buildStoneAttachment(args: {
  title: string
  headers: string[]
  rows: string[][]
  summary: string
  totals: string
  discordUserId: string
}): Promise<AttachmentBuilder | null> {
  try {
    const image = await renderTableChartPng({
      title: args.title,
      headers: args.headers,
      rows: args.rows,
      descriptionLines: [args.summary],
    }, args.discordUserId)
    return new AttachmentBuilder(image, { name: 'stone-costs.png' })
  } catch {
    return null
  }
}

function buildStoneDisplayPreviewRows(stat: NonNullable<ReturnType<typeof findUwStatByName>>, startLevel: number, targetLevel: number): StoneDisplayPreviewRow[] {
  const rows: StoneDisplayPreviewRow[] = []
  const currentLevelRow = stat.levels.find(level => level.level === startLevel && String(level.value ?? '').trim().length > 0)

  if (currentLevelRow) {
    rows.push({
      level: currentLevelRow.level,
      value: String(currentLevelRow.value),
      costLabel: startLevel === 0 ? 'Unlock' : '',
      cumulativeLabel: '0',
    })
  }

  for (const row of buildUwStatCostRows(stat, startLevel, targetLevel)) {
    rows.push({
      level: row.level,
      value: String(row.value),
      costLabel: formatGroupedToolNumber(row.cost),
      cumulativeLabel: formatGroupedToolNumber(row.cumulativeCost),
    })
  }

  return rows
}

const data = new SlashCommandBuilder()
  .setName(stoneConfig.name)
  .setDescription(stoneConfig.description)
  .addStringOption(option =>
    option
      .setName(stoneConfig.options.weapon.name)
      .setDescription(stoneConfig.options.weapon.description)
      .setRequired(false),
  )
  .addStringOption(option =>
    option
      .setName(stoneConfig.options.stat.name)
      .setDescription(stoneConfig.options.stat.description)
      .setRequired(false),
  )
  .addIntegerOption(option =>
    option
      .setName(stoneConfig.options.startLevel.name)
      .setDescription(stoneConfig.options.startLevel.description)
      .setMinValue(0)
      .setRequired(false),
  )
  .addIntegerOption(option =>
    option
      .setName(stoneConfig.options.targetLevel.name)
      .setDescription(stoneConfig.options.targetLevel.description)
      .setMinValue(0)
      .setRequired(false),
  )

export const stoneCommand: CommandModule = {
  data: data.toJSON(),
  async execute(interaction) {
    if (!interaction.isChatInputCommand()) return

    const defaultState = normalizeStoneSharedState(null)
    const hasMeaningfulState = (candidate: StoneSharedState): boolean => (
      JSON.stringify(candidate) !== JSON.stringify(defaultState)
    )
    const resolvedStorage = await resolveUserStorageState({
      discordUserId: interaction.user.id,
      load: (storageId) => getUserCommandSharedState(storageId, 'stone', normalizeStoneSharedState),
      hasMeaningfulState,
    })

    const storageUserId = resolvedStorage.storageUserId
    const persisted = resolvedStorage.state

    const hasStartLevelOption = interaction.options.getInteger(stoneConfig.options.startLevel.name) !== null
    const hasTargetLevelOption = interaction.options.getInteger(stoneConfig.options.targetLevel.name) !== null
    const shouldPersistInitialState = interaction.options.getString(stoneConfig.options.weapon.name) !== null
      || interaction.options.getString(stoneConfig.options.stat.name) !== null
      || hasStartLevelOption
      || hasTargetLevelOption

    let selectedWeaponName = interaction.options.getString(stoneConfig.options.weapon.name) ?? persisted.weaponName
    let selectedStats = interaction.options.getString(stoneConfig.options.stat.name)
      ? (() => {
        const requestedStat = String(interaction.options.getString(stoneConfig.options.stat.name) ?? '').trim()
        return requestedStat.toLowerCase() === 'all' || requestedStat.length === 0 ? [] : [requestedStat]
      })()
      : [...persisted.selectedStats]
    let startLevel = interaction.options.getInteger(stoneConfig.options.startLevel.name) ?? persisted.startLevel
    let requestedTargetLevel: number | null = interaction.options.getInteger(stoneConfig.options.targetLevel.name) ?? persisted.targetLevel

    if (!hasStartLevelOption && !hasTargetLevelOption && requestedTargetLevel === null) {
      requestedTargetLevel = resolveDefaultStoneTargetLevel(selectedWeaponName, selectedStats, startLevel)
    }

    const persistState = async () => {
      await saveUserCommandSharedState(storageUserId, 'stone', {
        weaponName: selectedWeaponName,
        selectedStats,
        startLevel,
        targetLevel: requestedTargetLevel,
      }, normalizeStoneSharedState)
    }

    const getWeapon = () => findUwWeaponByName(UW_DATA, selectedWeaponName)

    const buildStatOptions = () => {
      const weapon = getWeapon()
      if (!weapon) {
        return [{ label: stoneConfig.ui.statAllLabel, value: 'all', description: stoneConfig.ui.statAllDescription }]
      }

      return [
        { label: stoneConfig.ui.statAllLabel, value: 'all', description: stoneConfig.ui.statAllDescription },
        ...weapon.stats.slice(0, 24).map(stat => ({
          label: stat.name,
          value: stat.name,
          description: stoneConfig.ui.statDescriptionTemplate.replace('{stat}', stat.name),
        })),
      ]
    }

    const getSelectedStatNames = () => {
      const availableStats = resolveAvailableStoneStats(selectedWeaponName)
      if (availableStats.length === 0) return [] as string[]
      const availableNames = availableStats.map(stat => stat.name)
      const filtered = selectedStats.filter(statName => availableNames.includes(statName))
      return filtered.length > 0 ? filtered : availableNames
    }

    const createRender = async (): Promise<{ embed: EmbedBuilder; files: AttachmentBuilder[] }> => {
      const weapon = getWeapon()
      if (!weapon) {
        return {
          embed: brandCommandEmbed(new EmbedBuilder()
            .setTitle(stoneConfig.ui.title)
            .setDescription(stoneConfig.ui.description)
            .setColor(stoneConfig.color), stoneConfig.name),
          files: [],
        }
      }

      const availableStats = weapon.stats
      const selectedStatNames = getSelectedStatNames()
      const selectedSet = new Set(selectedStatNames)
      const activeStats = availableStats.filter(stat => selectedSet.has(stat.name))
      const usingAllStats = activeStats.length === availableStats.length
      const effectiveTargetLevel = requestedTargetLevel ?? resolveDefaultStoneTargetLevel(selectedWeaponName, selectedStats, startLevel)

      if (activeStats.length > 1) {
        const statRows = activeStats.map(stat => {
          const maxLevel = getUwStatMaxLevel(stat)
          const targetLevel = Math.max(startLevel, Math.min(effectiveTargetLevel ?? maxLevel, maxLevel))
          const cost = sumUwStatCostsBetween(stat, startLevel, targetLevel)
          const rows = buildStoneDisplayPreviewRows(stat, startLevel, targetLevel)
          return {
            stat,
            targetLevel,
            cost,
            rows,
          }
        })

        const stonesRequired = statRows.reduce((sum, entry) => sum + entry.cost, 0)
        const summary = (usingAllStats ? stoneConfig.ui.allStatsSummaryTemplate : stoneConfig.ui.selectedStatsSummaryTemplate)
          .replace('{weapon}', weapon.name)
          .replace('{start}', startLevel.toString())
          .replace('{target}', String(effectiveTargetLevel ?? 'max'))
          .replace('{count}', String(activeStats.length))
        const details = stoneConfig.ui.allStatsDetailsTemplate.replace('{stones}', formatGroupedToolNumber(stonesRequired))

        const embed = brandCommandEmbed(new EmbedBuilder()
          .setTitle(stoneConfig.ui.title)
          .setDescription(summary)
          .addFields({ name: stoneConfig.ui.totalsFieldName, value: details, inline: false })
          .setColor(stoneConfig.color), stoneConfig.name)

        let attachment: AttachmentBuilder | null = null
        const minLevel = statRows.reduce((lowest, entry) => {
          if (entry.rows.length === 0) return lowest
          return Math.min(lowest, entry.rows[0].level)
        }, Number.POSITIVE_INFINITY)
        const maxLevel = statRows.reduce((highest, entry) => {
          if (entry.rows.length === 0) return highest
          return Math.max(highest, entry.rows[entry.rows.length - 1]?.level ?? highest)
        }, Number.NEGATIVE_INFINITY)

        if (Number.isFinite(minLevel) && Number.isFinite(maxLevel) && minLevel <= maxLevel) {
          try {
            const headerStyle = { bold: true, wrap: true, align: 'center' as const, verticalAlign: 'middle' as const }
            const headerRowTop: ConfigurableCell[] = [{ value: 'Level', style: headerStyle }]
            const headerRowBottom: ConfigurableCell[] = [{ value: '', style: headerStyle }]
            const merges: ConfigurableTableDocument['merges'] = [{ row: 0, col: 0, rowSpan: 2, colSpan: 1 }]
            const statGroups: ConfigurableTableDocument['statGroups'] = []

            for (const entry of statRows) {
              const groupStartColumn = headerRowTop.length
              headerRowTop.push({ value: entry.stat.name, style: headerStyle }, { value: '', style: headerStyle }, { value: '', style: headerStyle })
              headerRowBottom.push({ value: 'Value', style: headerStyle }, { value: 'Cost', style: headerStyle }, { value: 'Total', style: headerStyle })
              merges.push({ row: 0, col: groupStartColumn, rowSpan: 1, colSpan: 3 })
              statGroups.push({
                key: entry.stat.name,
                label: entry.stat.name,
                valueColumn: groupStartColumn,
                costColumn: groupStartColumn + 1,
                totalColumn: groupStartColumn + 2,
              })
            }

            const rows: ConfigurableCell[][] = [headerRowTop, headerRowBottom]
            for (let level = minLevel; level <= maxLevel; level += 1) {
              const row: ConfigurableCell[] = [{ value: String(level) }]
              for (const entry of statRows) {
                const levelRow = entry.rows.find(candidate => candidate.level === level)
                row.push(
                  { value: levelRow?.value ?? '' },
                  { value: levelRow?.costLabel ?? '' },
                  { value: levelRow?.cumulativeLabel ?? '' },
                )
              }
              rows.push(row)
            }

            const image = await renderConfigurableTablePng({
              title: `${weapon.name} - All Stat Cost Table`,
              rows,
              rowHeights: [48, 48],
              merges,
              statGroups,
              footerLines: [details],
            }, storageUserId)
            attachment = new AttachmentBuilder(image, { name: 'stone-costs.png' })
          } catch {
            attachment = null
          }
        }

        if (!attachment) {
          return { embed, files: [] }
        }

        embed.setImage('attachment://stone-costs.png')
        return { embed, files: [attachment] }
      }

      const stat = activeStats[0] ?? null
      if (!stat) {
        return {
          embed: brandCommandEmbed(new EmbedBuilder()
            .setTitle(stoneConfig.ui.title)
            .setDescription(stoneConfig.ui.unknownStatTemplate.replace('{stat}', selectedStats[0] ?? stoneConfig.defaults.stat).replace('{weapon}', weapon.name))
            .setColor(stoneConfig.color), stoneConfig.name),
          files: [],
        }
      }

      const maxLevel = getUwStatMaxLevel(stat)
      const targetLevel = Math.max(startLevel, Math.min(effectiveTargetLevel ?? maxLevel, maxLevel))
      const rows = buildUwStatCostRows(stat, startLevel, targetLevel)
      const stonesRequired = sumUwStatCostsBetween(stat, startLevel, targetLevel)

      const summary = stoneConfig.ui.summaryTemplate
        .replace('{weapon}', weapon.name)
        .replace('{stat}', stat.name)
        .replace('{start}', startLevel.toString())
        .replace('{target}', targetLevel.toString())

      const totals = stoneConfig.ui.totalsTemplate
        .replace('{stones}', formatGroupedToolNumber(stonesRequired))
        .replace('{rows}', rows.length.toString())

      const embed = brandCommandEmbed(new EmbedBuilder()
        .setTitle(stoneConfig.ui.title)
        .setDescription(summary)
        .addFields(
          { name: stoneConfig.ui.totalsFieldName, value: totals, inline: false },
        )
        .setColor(stoneConfig.color), stoneConfig.name)

      const attachment = await buildStoneAttachment({
        title: `${weapon.name} - ${stat.name} Cost Table`,
        headers: ['Lvl', 'Value', 'Cost', 'Total'],
        rows: rows.map(row => [
          row.level.toString(),
          String(row.value),
          formatGroupedToolNumber(row.cost),
          formatGroupedToolNumber(row.cumulativeCost),
        ]),
        summary,
        totals,
        discordUserId: storageUserId,
      })

      if (!attachment) {
        return { embed, files: [] }
      }

      embed.setImage('attachment://stone-costs.png')
      return { embed, files: [attachment] }
    }

    const buildComponents = () => {
      const weaponMenu = new StringSelectMenuBuilder()
        .setCustomId(stoneConfig.ids.weaponSelect)
        .setPlaceholder(stoneConfig.ui.weaponPlaceholder)
        .addOptions(
          Object.values(UW_DATA).slice(0, 25).map(weapon => ({
            label: weapon.name,
            value: weapon.name,
            description: stoneConfig.ui.weaponDescriptionTemplate.replace('{weapon}', weapon.name),
            default: weapon.name === selectedWeaponName,
          })),
        )

      const statMenu = new StringSelectMenuBuilder()
        .setCustomId(stoneConfig.ids.statSelect)
        .setPlaceholder(stoneConfig.ui.statPlaceholder)
        .setMinValues(1)
        .setMaxValues(Math.max(1, Math.min(25, buildStatOptions().length)))
        .addOptions(
          buildStatOptions().map(option => ({
            ...option,
            default: option.value === 'all'
              ? getSelectedStatNames().length === resolveAvailableStoneStats(selectedWeaponName).length
              : getSelectedStatNames().includes(option.value),
          })),
        )

      const setLevels = new ButtonBuilder()
        .setCustomId(stoneConfig.ids.setRange)
        .setLabel(stoneConfig.ui.setRangeLabel)
        .setStyle(ButtonStyle.Primary)
        .setDisabled(!getWeapon())

      return appendShareButtonRow([
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(weaponMenu),
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(statMenu),
        new ActionRowBuilder<ButtonBuilder>().addComponents(setLevels),
      ], STONE_SHARE_BUTTON_ID)
    }

    await interaction.deferReply({ ephemeral: true })
    const initialRender = await createRender()

    await interaction.editReply({
      embeds: [initialRender.embed],
      components: buildComponents(),
      files: initialRender.files,
    })

    if (shouldPersistInitialState) {
      void persistState()
    }

    void (async () => {
      const reconcile = await reconcileUserCommandSharedState(storageUserId, 'stone', normalizeStoneSharedState)
      await runCloudReconcileUi<StoneSharedState>({
        interaction,
        promptKey: 'stone-sync',
        userId: interaction.user.id,
        autoCloudEnabled: reconcile.autoCloudEnabled,
        direction: reconcile.direction,
        hasDifference: reconcile.hasDifference,
        cloudState: reconcile.cloudState,
        applyCloudToLocal: reconcile.applyCloudToLocal,
        applyLocalToCloud: reconcile.applyLocalToCloud,
        onCloudApplied: async (next) => {
          selectedWeaponName = next.weaponName
          selectedStats = [...next.selectedStats]
          startLevel = next.startLevel
          requestedTargetLevel = next.targetLevel
          const updatedRender = await createRender()
          await interaction.editReply({ embeds: [updatedRender.embed], components: buildComponents(), files: updatedRender.files })
        },
      })
    })()

    const reply = await interaction.fetchReply()
    if (!('createMessageComponentCollector' in reply)) {
      return
    }

    const collector = reply.createMessageComponentCollector({
      time: stoneConfig.behavior.collectorTimeoutMs,
      filter: i => i.user.id === interaction.user.id,
    })

    collector.on('collect', async componentInteraction => {
      if (componentInteraction.isButton() && componentInteraction.customId === STONE_SHARE_BUTTON_ID) {
        await shareCurrentRender(componentInteraction, {
          commandName: stoneConfig.name,
          render: async () => {
            const rendered = await createRender()
            return { embeds: [rendered.embed], files: rendered.files }
          },
        })
        return
      }

      if (componentInteraction.customId === stoneConfig.ids.weaponSelect && componentInteraction.isStringSelectMenu()) {
        selectedWeaponName = componentInteraction.values[0] ?? selectedWeaponName
        selectedStats = []
        startLevel = stoneConfig.defaults.startLevel
        requestedTargetLevel = resolveDefaultStoneTargetLevel(selectedWeaponName, selectedStats, startLevel)
        await persistState()
        await componentInteraction.deferUpdate()
        const updatedRender = await createRender()
        await interaction.editReply({ embeds: [updatedRender.embed], components: buildComponents(), files: updatedRender.files })
        return
      }

      if (componentInteraction.customId === stoneConfig.ids.statSelect && componentInteraction.isStringSelectMenu()) {
        const availableNames = resolveAvailableStoneStats(selectedWeaponName).map(stat => stat.name)
        const next = componentInteraction.values
          .filter(value => value !== 'all')
          .filter(value => availableNames.includes(value))
        selectedStats = componentInteraction.values.includes('all') || next.length === 0 || next.length === availableNames.length
          ? []
          : next
        if (requestedTargetLevel === null) {
          requestedTargetLevel = resolveDefaultStoneTargetLevel(selectedWeaponName, selectedStats, startLevel)
        }
        await persistState()
        await componentInteraction.deferUpdate()
        const updatedRender = await createRender()
        await interaction.editReply({ embeds: [updatedRender.embed], components: buildComponents(), files: updatedRender.files })
        return
      }

      if (componentInteraction.customId === stoneConfig.ids.setRange && componentInteraction.isButton()) {
        const maxLevel = resolveStoneMaxLevel(selectedWeaponName, selectedStats) ?? 30
        const defaultTargetLevel = requestedTargetLevel ?? getDefaultLevelRange(startLevel, maxLevel).targetLevel
        const modal = new ModalBuilder()
          .setCustomId(stoneConfig.ids.rangeModal)
          .setTitle(stoneConfig.ui.rangeModalTitle)
          .addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder()
                .setCustomId(stoneConfig.ids.startLevelInput)
                .setLabel(`${stoneConfig.ui.startLevelLabel} (0-${maxLevel})`)
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setValue(String(startLevel)),
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder()
                .setCustomId(stoneConfig.ids.targetLevelInput)
                .setLabel(`${stoneConfig.ui.targetLevelLabel} (0-${maxLevel})`)
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setValue(String(Math.max(startLevel, Math.min(defaultTargetLevel, maxLevel)))),
            ),
          )

        const submitted = await showModalAndAwaitSubmit({
          componentInteraction,
          modal,
          baseCustomId: stoneConfig.ids.rangeModal,
          userId: interaction.user.id,
          timeoutMs: stoneConfig.behavior.modalSubmitTimeoutMs,
        })
        if (!submitted) {
          return
        }

        const nextStart = Number.parseInt(submitted.fields.getTextInputValue(stoneConfig.ids.startLevelInput), 10)
        const targetRaw = submitted.fields.getTextInputValue(stoneConfig.ids.targetLevelInput).trim()
        const nextTarget: number | null = targetRaw.length > 0 ? Number.parseInt(targetRaw, 10) : null

        if (!Number.isFinite(nextStart) || nextStart < 0 || (nextTarget != null && (!Number.isFinite(nextTarget) || nextTarget < 0))) {
          await submitted.reply({ content: stoneConfig.ui.invalidInput, ephemeral: true })
          return
        }

        startLevel = nextStart
        requestedTargetLevel = nextTarget

        await persistState()
        await submitted.deferUpdate()
        const updatedRender = await createRender()
        await interaction.editReply({ embeds: [updatedRender.embed], components: buildComponents(), files: updatedRender.files })
        return
      }

      await componentInteraction.reply({ content: stoneConfig.ui.notYourSession, ephemeral: true })
    })

    collector.on('end', async () => {
      await interaction.editReply({
        content: stoneConfig.ui.sessionTimedOut,
        embeds: [],
        components: [],
      }).catch(() => {})
    })
  },
}
