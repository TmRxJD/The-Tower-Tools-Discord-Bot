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
  buildBotStatCostRows,
  type BotData,
  type ConfigurableCell,
  type ConfigurableTableDocument,
  findBotByName,
  formatGroupedToolNumber,
  getBotStatMaxLevel,
  getBotStatMinLevel,
  normalizeBotStats,
  sumBotStatCostsBetween,
} from '@tmrxjd/platform/tools'
import { getBotConfig } from '../config/bot-config'
import { brandCommandEmbed, brandCommandEmbeds } from '../services/command-embed-branding'
import { appendShareButtonRow, shareCurrentRender } from '../services/command-share'
import { renderConfigurableTablePng, renderTableChartPng } from '../services/table-chart-render'
import { getUserCommandSharedState, reconcileUserCommandSharedState, saveUserCommandSharedState } from '../services/user-command-shared-state'
import { resolveUserStorageState } from '../services/user-storage-resolution'
import { runCloudReconcileUi } from '../services/cloud-reconcile-ui'
import { normalizeBotsSharedState, hasMeaningfulBotsState } from '../services/bots-command-state'
import { showModalAndAwaitSubmit } from '../services/modal-submit'
import type { ToolsBotClient } from '../core/tools-bot-client'

const botsConfig = getBotConfig().commands.bots
const BOTS_SHARE_BUTTON_ID = 'bots_share'

type BotSessionState = ReturnType<typeof normalizeBotsSharedState>

function clampLevel(level: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.trunc(level)))
}

function parseLevelInput(input: string | null | undefined): number | null {
  if (typeof input !== 'string') return null
  const trimmed = input.trim()
  if (!trimmed) return null
  const parsed = Number.parseInt(trimmed, 10)
  return Number.isFinite(parsed) ? parsed : null
}

function hasBotLab(bot: BotData | null | undefined, labName: 'Cooldown' | 'Duration'): boolean {
  return Boolean(bot?.labInfo.some(lab => lab.name === labName))
}

function getEffectiveBotLabLevels(bot: BotData | null | undefined, state: BotSessionState): { Cooldown?: number; Duration?: number } {
  return {
    ...(hasBotLab(bot, 'Cooldown') ? { Cooldown: state.cooldownLab } : {}),
    ...(hasBotLab(bot, 'Duration') ? { Duration: state.durationLab } : {}),
  }
}

function getBotStats(bot: BotData, state: BotSessionState) {
  return normalizeBotStats(bot, getEffectiveBotLabLevels(bot, state))
}

type BotDisplayPreviewRow = {
  level: number
  value: string
  cost: number
  cumulativeCost: number
  costLabel: string
  cumulativeLabel: string
}

function getSelectedBotStats(bot: BotData, state: BotSessionState) {
  const stats = getBotStats(bot, state)
  if (state.selectedStats.length === 0) return stats
  const selectedSet = new Set(state.selectedStats)
  const selected = stats.filter(stat => selectedSet.has(stat.name))
  return selected.length > 0 ? selected : stats
}

function resolveSelectedBotLevelBounds(bot: BotData | null | undefined, state: BotSessionState): {
  startMin: number
  startMax: number
  targetMin: number
  targetMax: number
} {
  if (!bot) {
    return {
      startMin: 0,
      startMax: 30,
      targetMin: 1,
      targetMax: 30,
    }
  }

  const stats = getBotStats(bot, state)
  const selectedStats = getSelectedBotStats(bot, state)
  const useStats = selectedStats.length === 1 ? selectedStats : stats
  const startMins = useStats.map(stat => (
    stat.levels.some(level => level.level === 0 && level.value !== '')
      ? 0
      : getBotStatMinLevel(stat)
  ))
  const targetMins = useStats.map(stat => (
    stat.levels.some(level => level.level === 0 && level.value !== '')
      ? 1
      : getBotStatMinLevel(stat)
  ))
  const maxes = useStats.map(getBotStatMaxLevel)

  return {
    startMin: Math.min(...startMins),
    startMax: Math.max(...maxes),
    targetMin: Math.min(...targetMins),
    targetMax: Math.max(...maxes),
  }
}

function buildBotDisplayPreviewRows(stat: ReturnType<typeof getBotStats>[number], startLevel: number, targetLevel: number): BotDisplayPreviewRow[] {
  const rows: BotDisplayPreviewRow[] = []
  const currentLevelRow = stat.levels.find(level => level.level === startLevel && level.value !== '')

  if (currentLevelRow) {
    rows.push({
      level: currentLevelRow.level,
      value: currentLevelRow.value,
      cost: 0,
      cumulativeCost: 0,
      costLabel: startLevel === 0 ? 'Unlock' : '',
      cumulativeLabel: '0',
    })
  }

  const previewRows = buildBotStatCostRows(stat, startLevel, targetLevel)
  for (const row of previewRows) {
    rows.push({
      ...row,
      costLabel: formatGroupedToolNumber(row.cost),
      cumulativeLabel: formatGroupedToolNumber(row.cumulativeCost),
    })
  }

  return rows
}

function resolveDefaultTargetLevel(startLevel: number, targetMin: number, targetMax: number): number {
  return clampLevel(startLevel + 30, Math.max(startLevel, targetMin), targetMax)
}

async function buildCostChartAttachment(args: {
  title: string
  headers: string[]
  rows: string[][]
  footerLines?: string[]
  descriptionLines?: string[]
  fileName: string
  discordUserId?: string
}): Promise<AttachmentBuilder | null> {
  try {
    const image = await renderTableChartPng({
      title: args.title,
      headers: args.headers,
      rows: args.rows,
      footerLines: args.footerLines,
      descriptionLines: args.descriptionLines,
    }, args.discordUserId)
    return new AttachmentBuilder(image, { name: args.fileName })
  } catch {
    return null
  }
}

const data = new SlashCommandBuilder()
  .setName(botsConfig.name)
  .setDescription(botsConfig.description)
  .addStringOption(option => {
    const builtOption = option
      .setName(botsConfig.options.bot.name)
      .setDescription(botsConfig.options.bot.description)
      .setRequired(false)

    for (const choice of botsConfig.botChoices) {
      builtOption.addChoices({ name: choice.name, value: choice.value })
    }

    return builtOption
  })
  .addStringOption(option =>
    option
      .setName(botsConfig.options.stat.name)
      .setDescription(botsConfig.options.stat.description)
      .setRequired(false),
  )
  .addIntegerOption(option =>
    option
      .setName(botsConfig.options.startLevel.name)
      .setDescription(botsConfig.options.startLevel.description)
      .setMinValue(0)
      .setMaxValue(30)
      .setRequired(false),
  )
  .addIntegerOption(option =>
    option
      .setName(botsConfig.options.targetLevel.name)
      .setDescription(botsConfig.options.targetLevel.description)
      .setMinValue(0)
      .setMaxValue(30)
      .setRequired(false),
  )
  .addIntegerOption(option =>
    option
      .setName(botsConfig.options.cooldownLab.name)
      .setDescription(botsConfig.options.cooldownLab.description)
      .setMinValue(0)
      .setMaxValue(25)
      .setRequired(false),
  )
  .addIntegerOption(option =>
    option
      .setName(botsConfig.options.durationLab.name)
      .setDescription(botsConfig.options.durationLab.description)
      .setMinValue(0)
      .setMaxValue(20)
      .setRequired(false),
  )

export const botsCommand: CommandModule = {
  data: data.toJSON(),
  async execute(interaction) {
    if (!interaction.isChatInputCommand()) return

    // Acknowledge within Discord's 3s window BEFORE any cloud/storage reads.
    await interaction.deferReply({ ephemeral: true })

    const defaultState = normalizeBotsSharedState(null)
    const hasMeaningfulState = (candidate: BotSessionState): boolean => hasMeaningfulBotsState(candidate) && JSON.stringify(candidate) !== JSON.stringify(defaultState)
    const resolvedStorage = await resolveUserStorageState({
      discordUserId: interaction.user.id,
      load: (storageId) => getUserCommandSharedState(storageId, 'bots', normalizeBotsSharedState),
      hasMeaningfulState,
    })

    const storageUserId = resolvedStorage.storageUserId
    const persistedState = resolvedStorage.state
    const shouldPersistInitialState = interaction.options.getString(botsConfig.options.bot.name) !== null
      || interaction.options.getString(botsConfig.options.stat.name) !== null
      || interaction.options.getInteger(botsConfig.options.startLevel.name) !== null
      || interaction.options.getInteger(botsConfig.options.targetLevel.name) !== null
      || interaction.options.getInteger(botsConfig.options.cooldownLab.name) !== null
      || interaction.options.getInteger(botsConfig.options.durationLab.name) !== null

    const state: BotSessionState = {
      botName: interaction.options.getString(botsConfig.options.bot.name) ?? persistedState.botName,
      selectedStats: [...persistedState.selectedStats],
      startLevel: interaction.options.getInteger(botsConfig.options.startLevel.name) ?? persistedState.startLevel,
      targetLevel: interaction.options.getInteger(botsConfig.options.targetLevel.name) ?? persistedState.targetLevel,
      cooldownLab: interaction.options.getInteger(botsConfig.options.cooldownLab.name) ?? persistedState.cooldownLab,
      durationLab: interaction.options.getInteger(botsConfig.options.durationLab.name) ?? persistedState.durationLab,
    }

    const persistState = async () => {
      await saveUserCommandSharedState(storageUserId, 'bots', state, normalizeBotsSharedState)
    }

    const initialStat = interaction.options.getString(botsConfig.options.stat.name)

    function createBotRow(): ActionRowBuilder<StringSelectMenuBuilder> {
      return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(botsConfig.ids.botSelect)
          .setPlaceholder(botsConfig.ui.botPlaceholder)
          .setMinValues(1)
          .setMaxValues(1)
          .addOptions(botsConfig.botChoices.map(choice => ({
            label: choice.name,
            value: choice.value,
            description: botsConfig.ui.botDescriptionTemplate.replace('{bot}', choice.name),
            default: state.botName === choice.value,
          }))),
      )
    }

    function createStatRow(): ActionRowBuilder<StringSelectMenuBuilder> {
      const bot = state.botName ? findBotByName(state.botName) : null
      const stats = bot
        ? getBotStats(bot, state)
        : []

      if (!bot || stats.length === 0) {
        return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(botsConfig.ids.statSelect)
            .setPlaceholder(botsConfig.ui.statPlaceholder)
            .setMinValues(1)
            .setMaxValues(1)
            .setDisabled(true)
            .addOptions([
              {
                label: 'No stats available',
                value: 'none',
                description: 'Select a bot first',
                default: true,
              },
            ]),
        )
      }

      const availableNames = stats.map(stat => stat.name)
      if (state.selectedStats.length === 0) {
        state.selectedStats = initialStat ? [initialStat] : [...availableNames]
      }

      state.selectedStats = state.selectedStats.filter(name => availableNames.includes(name))
      if (state.selectedStats.length === 0 && availableNames.length > 0) {
        state.selectedStats = [...availableNames]
      }

      const options = stats.map(stat => ({
        label: stat.name,
        value: stat.name,
        description: botsConfig.ui.statDescriptionTemplate.replace('{stat}', stat.name),
        default: state.selectedStats.includes(stat.name),
      }))

      return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(botsConfig.ids.statSelect)
          .setPlaceholder(botsConfig.ui.statPlaceholder)
          .setMinValues(1)
          .setMaxValues(Math.max(1, Math.min(25, options.length)))
          .setDisabled(!bot)
          .addOptions(options),
      )
    }

    function createActionRow(): ActionRowBuilder<ButtonBuilder> {
      return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(botsConfig.ids.levelButton)
          .setLabel(botsConfig.ui.levelButtonLabel)
          .setStyle(ButtonStyle.Primary),
      )
    }

    async function createRender(): Promise<{ embeds: EmbedBuilder[]; files: AttachmentBuilder[] }> {
      const bot = state.botName ? findBotByName(state.botName) : null
      if (!bot) {
        return {
          embeds: brandCommandEmbeds([new EmbedBuilder()
            .setTitle(botsConfig.ui.title)
            .setDescription(botsConfig.ui.description)
            .setColor(botsConfig.color)], botsConfig.name),
          files: [],
        }
      }

      const stats = getBotStats(bot, state)
      const selectedSet = new Set(state.selectedStats)
      const selectedStats = stats.filter(stat => selectedSet.has(stat.name))
      const statIsSingle = selectedStats.length === 1

      if (!statIsSingle) {
        let totalCost = 0
        const detailedStats = selectedStats.map(stat => {
          const minLevel = getBotStatMinLevel(stat)
          const maxLevel = getBotStatMaxLevel(stat)
          const startLevel = clampLevel(state.startLevel, minLevel, maxLevel)
          const targetLevel = clampLevel(state.targetLevel ?? maxLevel, startLevel, maxLevel)
          const rows = buildBotDisplayPreviewRows(stat, startLevel, targetLevel)
          const cost = sumBotStatCostsBetween(stat, startLevel, targetLevel)
          totalCost += cost

          return {
            stat,
            startLevel,
            targetLevel,
            rows,
            cost,
          }
        })

        const summary = botsConfig.ui.allStatsSummaryTemplate
          .replace('{bot}', bot.name)
          .replace('{start}', state.startLevel.toString())
          .replace('{target}', state.targetLevel?.toString() ?? botsConfig.ui.maxLabel)

        const totals = botsConfig.ui.allStatsTotalsTemplate.replace('{total}', formatGroupedToolNumber(totalCost))

        const summaryEmbed = brandCommandEmbed(new EmbedBuilder()
          .setTitle(botsConfig.ui.title)
          .setDescription(summary)
          .addFields({ name: botsConfig.ui.totalsFieldName, value: totals, inline: false })
          .setColor(botsConfig.color), botsConfig.name)

        const minLevel = detailedStats.reduce((lowest, entry) => {
          if (entry.rows.length === 0) return lowest
          return Math.min(lowest, entry.rows[0].level)
        }, Number.POSITIVE_INFINITY)
        const maxLevel = detailedStats.reduce((highest, entry) => {
          if (entry.rows.length === 0) return highest
          return Math.max(highest, entry.rows[entry.rows.length - 1]?.level ?? highest)
        }, Number.NEGATIVE_INFINITY)

        const fileName = 'bots-all-costs.png'
        let chart: AttachmentBuilder | null = null
        if (Number.isFinite(minLevel) && Number.isFinite(maxLevel) && minLevel <= maxLevel) {
          try {
            const headerStyle = { bold: true, wrap: true, align: 'center' as const, verticalAlign: 'middle' as const }
            const headerRowTop: ConfigurableCell[] = [{ value: 'Level', style: headerStyle }]
            const headerRowBottom: ConfigurableCell[] = [{ value: '', style: headerStyle }]
            const merges: ConfigurableTableDocument['merges'] = []
            const statGroups: ConfigurableTableDocument['statGroups'] = []

            for (const entry of detailedStats) {
              const groupStartColumn = headerRowTop.length
              headerRowTop.push({ value: entry.stat.name, style: headerStyle }, { value: '', style: headerStyle }, { value: '', style: headerStyle })
              headerRowBottom.push({ value: 'Value', style: headerStyle }, { value: 'Cost', style: headerStyle }, { value: 'Total', style: headerStyle })
              merges.push({ row: 0, col: headerRowTop.length - 3, rowSpan: 1, colSpan: 3 })
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
              for (const entry of detailedStats) {
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
              title: `${bot.name} - Level Cost Table`,
              rows,
              rowHeights: [48, 48],
              merges,
              statGroups,
            }, interaction.user.id)
            chart = new AttachmentBuilder(image, { name: fileName })
          } catch {
            chart = null
          }
        }

        if (chart) {
          summaryEmbed.setImage(`attachment://${fileName}`)
          return { embeds: [summaryEmbed], files: [chart] }
        }

        return { embeds: [summaryEmbed], files: [] }
      }

      const stat = selectedStats[0]
      if (!stat) {
        return {
          embeds: brandCommandEmbeds([new EmbedBuilder()
            .setTitle(botsConfig.ui.title)
            .setDescription(botsConfig.ui.description)
            .setColor(botsConfig.color)], botsConfig.name),
          files: [],
        }
      }

      const minLevel = getBotStatMinLevel(stat)
      const maxLevel = getBotStatMaxLevel(stat)
      const startLevel = clampLevel(state.startLevel, minLevel, maxLevel)
      const targetLevel = clampLevel(state.targetLevel ?? maxLevel, startLevel, maxLevel)
      const rows = buildBotDisplayPreviewRows(stat, startLevel, targetLevel)
      const medalsRequired = sumBotStatCostsBetween(stat, startLevel, targetLevel)

      const summary = botsConfig.ui.summaryTemplate
        .replace('{bot}', bot.name)
        .replace('{stat}', stat.name)
        .replace('{start}', startLevel.toString())
        .replace('{target}', targetLevel.toString())

      const totals = botsConfig.ui.totalsTemplate
            .replace('{medals}', formatGroupedToolNumber(medalsRequired))
        .replace('{rows}', rows.length.toString())

      const embed = brandCommandEmbed(new EmbedBuilder()
        .setTitle(botsConfig.ui.title)
        .setDescription(summary)
        .addFields(
          { name: botsConfig.ui.totalsFieldName, value: totals, inline: false },
        )
        .setColor(botsConfig.color), botsConfig.name)

      const fileName = 'bots-stat-costs.png'
      const chart = await buildCostChartAttachment({
        title: `${bot.name} - ${stat.name} Medal Costs`,
        headers: ['Level', 'Value', 'Cost', 'Total'],
        rows: rows.map(row => [
          row.level.toString(),
          row.value,
            row.costLabel,
            row.cumulativeLabel,
        ]),
        descriptionLines: [summary],
        fileName,
        discordUserId: storageUserId,
      })

      if (chart) {
        embed.setImage(`attachment://${fileName}`)
        return { embeds: [embed], files: [chart] }
      }

      return { embeds: [embed], files: [] }
    }

    const buildComponents = () => appendShareButtonRow([createBotRow(), createStatRow(), createActionRow()], BOTS_SHARE_BUTTON_ID)

    const initialRender = await createRender()

    await interaction.editReply({
      embeds: initialRender.embeds,
      components: buildComponents(),
      files: initialRender.files,
    })

    if (shouldPersistInitialState) {
      void persistState()
    }

    void (async () => {
      const reconcile = await reconcileUserCommandSharedState(storageUserId, 'bots', normalizeBotsSharedState)
      await runCloudReconcileUi<BotSessionState>({
        interaction,
        promptKey: 'bots-sync',
        userId: interaction.user.id,
        autoCloudEnabled: reconcile.autoCloudEnabled,
        direction: reconcile.direction,
        hasDifference: reconcile.hasDifference,
        cloudState: reconcile.cloudState,
        applyCloudToLocal: reconcile.applyCloudToLocal,
        applyLocalToCloud: reconcile.applyLocalToCloud,
        onCloudApplied: async (next) => {
          state.botName = next.botName
          state.selectedStats = [...next.selectedStats]
          state.startLevel = next.startLevel
          state.targetLevel = next.targetLevel
          state.cooldownLab = next.cooldownLab
          state.durationLab = next.durationLab
          const updatedRender = await createRender()
          await interaction.editReply({
            embeds: updatedRender.embeds,
            components: buildComponents(),
            files: updatedRender.files,
          })
        },
      })
    })()

    const reply = await interaction.fetchReply()
    if (!('createMessageComponentCollector' in reply)) return

    const collector = reply.createMessageComponentCollector({
      time: botsConfig.behavior.collectorTimeoutMs,
      filter: i => i.user.id === interaction.user.id,
    })
    const client = interaction.client as ToolsBotClient
    const scopedSessionId = `bots:${interaction.id}`
    client.scopedInteractionSessions.register({
      sessionId: scopedSessionId,
      ownerUserId: interaction.user.id,
      messageId: reply.id,
      modalCustomIds: [botsConfig.ids.levelsModal],
      ttlMs: botsConfig.behavior.collectorTimeoutMs,
    })

    collector.on('collect', async componentInteraction => {
      if (componentInteraction.user.id !== interaction.user.id) {
        await componentInteraction.reply({ content: botsConfig.ui.notYourSession, ephemeral: true })
        return
      }

      if (componentInteraction.isButton() && componentInteraction.customId === BOTS_SHARE_BUTTON_ID) {
        await shareCurrentRender(componentInteraction, {
          commandName: botsConfig.name,
          render: async () => {
            const rendered = await createRender()
            return { embeds: rendered.embeds, files: rendered.files }
          },
        })
        return
      }

      if (componentInteraction.customId === botsConfig.ids.botSelect && componentInteraction.isStringSelectMenu()) {
        state.botName = componentInteraction.values[0]
        state.startLevel = 0
        state.targetLevel = null
        const selectedBot = state.botName ? findBotByName(state.botName) : null
        if (selectedBot) {
          state.selectedStats = getBotStats(selectedBot, state).map(stat => stat.name)
        } else {
          state.selectedStats = []
        }
        await persistState()
        await componentInteraction.deferUpdate()
        const updatedRender = await createRender()
        await interaction.editReply({
          embeds: updatedRender.embeds,
          components: buildComponents(),
          files: updatedRender.files,
        })
        return
      }

      if (componentInteraction.customId === botsConfig.ids.statSelect && componentInteraction.isStringSelectMenu()) {
        state.selectedStats = [...componentInteraction.values]
        await persistState()
        await componentInteraction.deferUpdate()
        const updatedRender = await createRender()
        await interaction.editReply({
          embeds: updatedRender.embeds,
          components: buildComponents(),
          files: updatedRender.files,
        })
        return
      }

      if (componentInteraction.customId === botsConfig.ids.levelButton && componentInteraction.isButton()) {
        const selectedBot = state.botName ? findBotByName(state.botName) : null
        const levelBounds = resolveSelectedBotLevelBounds(selectedBot, state)
        const modalRows = [
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId(botsConfig.ids.startLevelInput)
              .setLabel(`${botsConfig.ui.startLevelLabel} (${levelBounds.startMin}-${levelBounds.startMax})`)
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setValue(String(clampLevel(state.startLevel, levelBounds.startMin, levelBounds.startMax))),
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId(botsConfig.ids.targetLevelInput)
              .setLabel(`${botsConfig.ui.targetLevelLabel} (${levelBounds.targetMin}-${levelBounds.targetMax})`)
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setValue(String(clampLevel(
                state.targetLevel ?? resolveDefaultTargetLevel(state.startLevel, levelBounds.targetMin, levelBounds.targetMax),
                levelBounds.targetMin,
                levelBounds.targetMax,
              ))),
          ),
        ]

        if (hasBotLab(selectedBot, 'Cooldown')) {
          modalRows.push(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder()
                .setCustomId(botsConfig.ids.cooldownLabInput)
                .setLabel(botsConfig.ui.cooldownLabLabel)
                .setStyle(TextInputStyle.Short)
                .setRequired(false)
                .setValue(String(state.cooldownLab)),
            ),
          )
        }

        if (hasBotLab(selectedBot, 'Duration')) {
          modalRows.push(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder()
                .setCustomId(botsConfig.ids.durationLabInput)
                .setLabel(botsConfig.ui.durationLabLabel)
                .setStyle(TextInputStyle.Short)
                .setRequired(false)
                .setValue(String(state.durationLab)),
            ),
          )
        }

        const modal = new ModalBuilder()
          .setCustomId(botsConfig.ids.levelsModal)
          .setTitle(botsConfig.ui.levelsModalTitle)
          .addComponents(...modalRows)

        const submitted = await showModalAndAwaitSubmit({
          componentInteraction,
          modal,
          baseCustomId: botsConfig.ids.levelsModal,
          userId: interaction.user.id,
          timeoutMs: botsConfig.behavior.modalSubmitTimeoutMs,
        })
        if (!submitted) {
          return
        }

        const startInput = parseLevelInput(submitted.fields.getTextInputValue(botsConfig.ids.startLevelInput))
        const targetInput = parseLevelInput(submitted.fields.getTextInputValue(botsConfig.ids.targetLevelInput))
        const cooldownInput = hasBotLab(selectedBot, 'Cooldown')
          ? parseLevelInput(submitted.fields.getTextInputValue(botsConfig.ids.cooldownLabInput))
          : null
        const durationInput = hasBotLab(selectedBot, 'Duration')
          ? parseLevelInput(submitted.fields.getTextInputValue(botsConfig.ids.durationLabInput))
          : null

        if (startInput === null || targetInput === null) {
          await submitted.reply({ content: botsConfig.ui.invalidLevelInput, ephemeral: true })
          return
        }

        state.startLevel = clampLevel(startInput, levelBounds.startMin, levelBounds.startMax)
        state.targetLevel = clampLevel(targetInput, Math.max(state.startLevel, levelBounds.targetMin), levelBounds.targetMax)
        if (cooldownInput !== null) state.cooldownLab = clampLevel(cooldownInput, 0, 25)
        if (durationInput !== null) state.durationLab = clampLevel(durationInput, 0, 20)
        await persistState()

        await submitted.deferUpdate()
        const updatedRender = await createRender()
        await interaction.editReply({
          embeds: updatedRender.embeds,
          components: [createBotRow(), createStatRow(), createActionRow()],
          files: updatedRender.files,
        })
      }
    })

    collector.on('end', async () => {
      client.scopedInteractionSessions.unregister(scopedSessionId)
      try {
        await interaction.editReply({
          content: botsConfig.ui.sessionTimedOut,
          embeds: [],
          components: [],
        })
      } catch {
        // no-op
      }
    })
  },
}