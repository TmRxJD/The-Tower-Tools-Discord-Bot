import {
  AttachmentBuilder,
  SlashCommandBuilder,
} from 'discord.js'
import type { CommandModule } from '../core/command-types'
import type { ToolsBotClient } from '../core/tools-bot-client'
import {
  getChartCategoryNames,
  getChartPath,
} from '@tmrxjd/platform/tools'
import { getBotConfig } from '../config/bot-config'
import {
  isChartRenderError,
  isChartRenderSuccess,
  renderChartAttachment,
} from '../services/chart-render'
import {
  autoSelectSingleOptions,
  type ChartState,
  createBaseChartEmbed,
  createChartCommandSessionIds,
  createChartCommandComponents,
  createChartRenderErrorEmbed,
  createRenderedChartEmbed,
  createSelectionChartEmbed,
  createChartTimeoutEmbed,
  normalizeChartState,
} from './chart-command-helpers'
import {
  getUserCommandSharedState,
  saveUserCommandSharedState,
} from '../services/user-command-shared-state'
import { resolveUserStorageState } from '../services/user-storage-resolution'
import { logger } from '../core/logger'

const chartConfig = getBotConfig().commands.chart

const data = new SlashCommandBuilder()
  .setName(chartConfig.name)
  .setDescription(chartConfig.description)

export const chartCommand: CommandModule = {
  data: data.toJSON(),
  async execute(interaction) {
    if (!interaction.isChatInputCommand()) return

    await interaction.deferReply({ ephemeral: true })

    const defaultState = normalizeChartState(null)
    const hasMeaningfulState = (candidate: ChartState): boolean => (
      JSON.stringify(candidate) !== JSON.stringify(defaultState)
    )
    const resolvedStorage = await resolveUserStorageState({
      discordUserId: interaction.user.id,
      load: (storageId) => getUserCommandSharedState(storageId, 'chart', normalizeChartState),
      hasMeaningfulState,
    })

    const storageUserId = resolvedStorage.storageUserId
    const state: ChartState = { ...resolvedStorage.state }

    const persistState = async () => {
      await saveUserCommandSharedState(storageUserId, 'chart', state, normalizeChartState)
    }

    const categories = getChartCategoryNames()
    if (!state.category && categories.length === 1) {
      state.category = categories[0]
      autoSelectSingleOptions(state)
    }

    const createRender = async (): Promise<{ embeds: ReturnType<typeof createBaseChartEmbed>[]; files: AttachmentBuilder[] }> => {
      const isComplete = Boolean(state.category && state.subcategory && state.item)
      if (!isComplete) {
        return {
          embeds: [createBaseChartEmbed(state)],
          files: [],
        }
      }

      const selectedPath = getChartPath(state.category!, state.subcategory!, state.item!)
      const renderResult = await renderChartAttachment(selectedPath, storageUserId, {
        selectedStats: state.selectedStats,
      })

      if (isChartRenderSuccess(renderResult)) {
        const { attachment: rendered } = renderResult
        return {
          embeds: [createRenderedChartEmbed(renderResult)],
          files: [new AttachmentBuilder(rendered.imageBuffer, { name: rendered.fileName })],
        }
      }

      if (isChartRenderError(renderResult)) {
        return {
          embeds: [createChartRenderErrorEmbed(state, renderResult.message)],
          files: [],
        }
      }

      return {
        embeds: [createSelectionChartEmbed(state)],
        files: [],
      }
    }

    const sessionIds = createChartCommandSessionIds(interaction.id)
    const components = createChartCommandComponents(state, sessionIds)
    const initialRender = await createRender()

    await interaction.editReply({
      embeds: initialRender.embeds,
      components,
      files: initialRender.files,
    })

    const replyMessage = await interaction.fetchReply()
    if (!('createMessageComponentCollector' in replyMessage)) {
      return
    }

    const scopedSessionId = `chart:${interaction.id}`
    const client = interaction.client as ToolsBotClient
    client.scopedInteractionSessions.register({
      sessionId: scopedSessionId,
      ownerUserId: interaction.user.id,
      messageId: replyMessage.id,
      componentCustomIds: [
        sessionIds.shareButton,
        sessionIds.categorySelect,
        sessionIds.subcategorySelect,
        sessionIds.itemSelect,
        sessionIds.statFilterSelect,
      ],
      ttlMs: chartConfig.behavior.collectorTimeoutMs,
    })
    const sessionComponentIds = new Set([
      sessionIds.shareButton,
      sessionIds.categorySelect,
      sessionIds.subcategorySelect,
      sessionIds.itemSelect,
      sessionIds.statFilterSelect,
    ])

    const collector = replyMessage.createMessageComponentCollector({
      time: chartConfig.behavior.collectorTimeoutMs,
      filter: componentInteraction => (
        componentInteraction.user.id === interaction.user.id
        && sessionComponentIds.has(componentInteraction.customId)
      ),
    })

    const safeDeferUpdate = async (componentInteraction: { deferred: boolean; replied: boolean; deferUpdate: () => Promise<unknown> }) => {
      if (componentInteraction.deferred || componentInteraction.replied) {
        return
      }

      try {
        await componentInteraction.deferUpdate()
      } catch (error) {
        const code = typeof error === 'object' && error && 'code' in error
          ? Number((error as { code?: unknown }).code)
          : null
        if (code === 40060 || code === 10062) {
          return
        }
        throw error
      }
    }

    collector.on('collect', async componentInteraction => {
      try {
        if (componentInteraction.customId === sessionIds.shareButton && componentInteraction.isButton()) {
          const channel = componentInteraction.channel
          if (!channel?.isTextBased() || !('send' in channel)) {
            await componentInteraction.reply({
              content: 'Unable to share this chart in the current channel.',
              ephemeral: true,
            })
            return
          }

          const isComplete = Boolean(state.category && state.subcategory && state.item)
          if (!isComplete) {
            await componentInteraction.reply({
              content: chartConfig.ui.notReady,
              ephemeral: true,
            })
            return
          }

          await safeDeferUpdate(componentInteraction)

          const selectedPath = getChartPath(state.category!, state.subcategory!, state.item!)
          const renderResult = await renderChartAttachment(selectedPath, storageUserId, {
            selectedStats: state.selectedStats,
          })

          if (isChartRenderSuccess(renderResult)) {
            const { attachment: rendered } = renderResult
            const attachment = new AttachmentBuilder(rendered.imageBuffer, { name: rendered.fileName })
            await channel.send({
              embeds: [createRenderedChartEmbed(renderResult)],
              files: [attachment],
            })
            return
          }

          if (isChartRenderError(renderResult)) {
            await channel.send({
              embeds: [createChartRenderErrorEmbed(state, renderResult.message)],
            })
            return
          }

          await channel.send({
            embeds: [createSelectionChartEmbed(state)],
          })
          return
        }

        await safeDeferUpdate(componentInteraction)

        if (componentInteraction.customId === sessionIds.categorySelect && componentInteraction.isStringSelectMenu()) {
          state.category = componentInteraction.values[0]
          state.subcategory = null
          state.item = null
          state.selectedStats = []
          autoSelectSingleOptions(state)
          await persistState()
        } else if (componentInteraction.customId === sessionIds.subcategorySelect && componentInteraction.isStringSelectMenu()) {
          state.subcategory = componentInteraction.values[0]
          state.item = null
          state.selectedStats = []
          autoSelectSingleOptions(state)
          await persistState()
        } else if (componentInteraction.customId === sessionIds.itemSelect && componentInteraction.isStringSelectMenu()) {
          state.item = componentInteraction.values[0]
          state.selectedStats = []
          autoSelectSingleOptions(state)
          await persistState()
        } else if (componentInteraction.customId === sessionIds.statFilterSelect && componentInteraction.isStringSelectMenu()) {
          state.selectedStats = [...componentInteraction.values]
          await persistState()
        }

        const updatedComponents = createChartCommandComponents(state, sessionIds)
        const updatedRender = await createRender()

        await interaction.editReply({
          embeds: updatedRender.embeds,
          components: updatedComponents,
          files: updatedRender.files,
        })
      } catch (error) {
        logger.error('Chart interaction update failed', error)
        await interaction.editReply({
          embeds: [createChartRenderErrorEmbed(state, 'Chart interaction failed. Use /chart again.')],
          components: createChartCommandComponents(state, sessionIds),
          files: [],
        }).catch(() => {})
      }
    })

    collector.on('end', async (_collected, reason) => {
      client.scopedInteractionSessions.unregister(scopedSessionId)
      try {
        await interaction.editReply({
          embeds: [createChartTimeoutEmbed()],
          components: [],
        })
      } catch {
        // no-op
      }
    })
  },
}
