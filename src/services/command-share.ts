import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type AttachmentBuilder,
  type EmbedBuilder,
  type MessageComponentInteraction,
  type MessageCreateOptions,
} from 'discord.js'
import { brandCommandEmbeds } from './command-embed-branding'

export type ShareableRender = {
  content?: string
  embeds?: EmbedBuilder[]
  files?: AttachmentBuilder[]
}

export function createShareButtonRow(customId: string, disabled = false): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(customId)
      .setLabel('Share to Channel')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
  )
}

export function appendShareButtonRow<T>(rows: T[], customId: string, disabled = false): Array<T | ActionRowBuilder<ButtonBuilder>> {
  return [...rows, createShareButtonRow(customId, disabled)]
}

function buildSharePayload(render: ShareableRender, commandName: string): MessageCreateOptions {
  return {
    content: render.content ?? '',
    embeds: render.embeds ? brandCommandEmbeds(render.embeds, commandName) : [],
    files: render.files ?? [],
  }
}

async function sendShareError(interaction: MessageComponentInteraction, message: string): Promise<void> {
  if (interaction.deferred || interaction.replied) {
    await interaction.followUp({ content: message, ephemeral: true })
    return
  }

  await interaction.reply({ content: message, ephemeral: true })
}

export async function shareCurrentRender(
  interaction: MessageComponentInteraction,
  options: {
    commandName: string
    render: () => Promise<ShareableRender>
    unavailableMessage?: string
    failureMessage?: string
  },
): Promise<void> {
  const channel = interaction.channel
  if (!channel || !('send' in channel)) {
    await sendShareError(interaction, options.unavailableMessage ?? 'Share is unavailable in this channel.')
    return
  }

  await interaction.deferUpdate()

  try {
    const payload = buildSharePayload(await options.render(), options.commandName)
    const hasEmbeds = Array.isArray(payload.embeds) && payload.embeds.length > 0
    const hasFiles = Array.isArray(payload.files) && payload.files.length > 0
    if (!payload.content && !hasEmbeds && !hasFiles) {
      await sendShareError(interaction, options.failureMessage ?? 'Unable to share right now.')
      return
    }

    await channel.send(payload)
  } catch {
    await sendShareError(interaction, options.failureMessage ?? 'Unable to share right now.')
  }
}