import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ChatInputCommandInteraction,
} from 'discord.js';
import {
  applyAutoCloudReconcile,
  type SyncedStateReconcileResult,
} from '@tmrxjd/platform/tools';

type Direction = 'cloud-newer' | 'local-newer' | 'unknown';

type ReconcileUiParams<T> = {
  interaction: ChatInputCommandInteraction;
  promptKey: string;
  userId: string;
  autoCloudEnabled: boolean;
  direction: Direction;
  hasDifference: boolean;
  cloudState: T | null;
  applyCloudToLocal: () => Promise<T | null>;
  applyLocalToCloud: () => Promise<void>;
  onCloudApplied: (nextState: T) => Promise<void>;
};

function getDirectionLabel(direction: Direction): string {
  if (direction === 'cloud-newer') {
    return 'Cloud data is newer than local device data.';
  }

  if (direction === 'local-newer') {
    return 'Cloud data is older than local device data.';
  }

  return 'Cloud data differs from local device data.';
}

async function cleanupPrompt(
  interaction: ChatInputCommandInteraction,
  prompt: Awaited<ReturnType<ChatInputCommandInteraction['followUp']>>,
): Promise<void> {
  await interaction.deleteReply(prompt.id).catch(async () => {
    if ('edit' in prompt) {
      await prompt.edit({ components: [] }).catch(() => {});
    }
  });
}

export async function runCloudReconcileUi<T>(params: ReconcileUiParams<T>): Promise<void> {
  if (!params.hasDifference) {
    return;
  }

  if (params.autoCloudEnabled) {
    await applyAutoCloudReconcile({
      autoCloudEnabled: params.autoCloudEnabled,
      hasDifference: params.hasDifference,
      direction: params.direction,
      localUpdatedAt: null,
      cloudUpdatedAt: null,
      localState: null as T,
      cloudState: params.cloudState,
      applyCloudToLocal: async () => {
        const applied = await params.applyCloudToLocal();
        if (applied) {
          await params.onCloudApplied(applied);
        }
        return applied;
      },
      applyLocalToCloud: params.applyLocalToCloud,
    } satisfies SyncedStateReconcileResult<T>, { preferLocalWhenAmbiguous: true });
    return;
  }

  const keepId = `${params.promptKey}:keep:${params.userId}`;
  const useCloudId = `${params.promptKey}:cloud:${params.userId}`;

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(keepId)
      .setLabel('Keep Local')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(useCloudId)
      .setLabel('Use Cloud')
      .setStyle(ButtonStyle.Primary),
  );

  const prompt = await params.interaction.followUp({
    content: `${getDirectionLabel(params.direction)} Do you want to keep local data or overwrite with cloud data?`,
    components: [row],
    ephemeral: true,
    fetchReply: true,
  });

  if (!('awaitMessageComponent' in prompt)) {
    return;
  }

  try {
    const selection = await prompt.awaitMessageComponent({
      time: 60_000,
      filter: interaction => interaction.user.id === params.userId,
    });

    if (!selection.isButton()) {
      return;
    }

    await selection.deferUpdate();

    if (selection.customId === useCloudId && params.cloudState) {
      const applied = await params.applyCloudToLocal();
      if (applied) {
        await params.onCloudApplied(applied);
      }
    } else {
      await params.applyLocalToCloud();
    }

    await cleanupPrompt(params.interaction, prompt);
  } catch {
    await cleanupPrompt(params.interaction, prompt);
  }
}
