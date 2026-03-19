import type {
  MessageComponentInteraction,
  ModalBuilder,
  ModalSubmitInteraction,
} from 'discord.js'

type ShowModalAndAwaitSubmitArgs = {
  componentInteraction: MessageComponentInteraction
  modal: ModalBuilder
  baseCustomId: string
  userId: string
  timeoutMs: number
}

export async function showModalAndAwaitSubmit({
  componentInteraction,
  modal,
  baseCustomId,
  userId,
  timeoutMs,
}: ShowModalAndAwaitSubmitArgs): Promise<ModalSubmitInteraction | null> {
  const uniqueCustomId = `${baseCustomId}:${componentInteraction.id}`
  modal.setCustomId(uniqueCustomId)
  await componentInteraction.showModal(modal)

  try {
    return await componentInteraction.awaitModalSubmit({
      filter: modalInteraction => (
        modalInteraction.customId === uniqueCustomId
        && modalInteraction.user.id === userId
      ),
      time: timeoutMs,
    })
  } catch {
    return null
  }
}