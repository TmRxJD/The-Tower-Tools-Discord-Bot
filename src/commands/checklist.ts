import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import type { CommandModule } from '../core/command-types';
import type { ToolsBotClient } from '../core/tools-bot-client';
import { getUserChecklist, reconcileUserChecklistState, saveUserChecklist } from '../services/user-reminder-db';
import { getBotConfig } from '../config/bot-config';
import { createChecklistModalBaseCustomId, createChecklistModalPrefix, createChecklistTaskCustomId, parseChecklistTaskCustomId } from './checklist-interaction-ids';
import { resolveUserStorageState } from '../services/user-storage-resolution';
import { runCloudReconcileUi } from '../services/cloud-reconcile-ui';
import { showModalAndAwaitSubmit } from '../services/modal-submit';
import { hasMeaningfulChecklistState, normalizeChecklistLabels } from '@tmrxjd/platform/tools';

const checklistConfig = getBotConfig().commands.checklist;
const checklistUi = checklistConfig.ui;
const checklistIds = checklistConfig.ids;
const checklistBehavior = checklistConfig.behavior;
const MODE_EDIT = checklistIds.modeEditValue;
const MODE_ADD = checklistIds.modeAddValue;
const MODE_REMOVE = checklistIds.modeRemoveValue;
const NO_SLOT_VALUE = checklistIds.noSlotValue;
const MAX_SLOTS = checklistConfig.defaults.maxSlots;
const BASE_SLOT_COUNT = checklistConfig.defaults.baseSlotCount;
const DEFAULT_LABEL_ARRAY = checklistConfig.defaults.labels;

const defaultLabels = normalizeChecklistLabels(DEFAULT_LABEL_ARRAY, {
  maxSlots: MAX_SLOTS,
  baseSlotCount: BASE_SLOT_COUNT,
  defaultTaskLabelTemplate: checklistConfig.defaults.defaultTaskLabelTemplate,
});

const data = new SlashCommandBuilder()
  .setName(checklistConfig.name)
  .setDescription(checklistConfig.description);

export const checklistCommand: CommandModule = {
  data: data.toJSON(),
  async execute(interaction) {
    if (!interaction.isChatInputCommand()) {
      return;
    }

    const discordUserId = interaction.user.id;

    const hasMeaningfulChecklist = (candidate: Awaited<ReturnType<typeof getUserChecklist>>): boolean => (
      hasMeaningfulChecklistState(candidate, defaultLabels)
    );

    const resolvedStorage = await resolveUserStorageState({
      discordUserId,
      load: getUserChecklist,
      hasMeaningfulState: hasMeaningfulChecklist,
    });

    const storageUserId = resolvedStorage.storageUserId;
    const saved = resolvedStorage.state;

    const labels = [...defaultLabels];
    const tasks = new Array<boolean>(MAX_SLOTS).fill(false);

    if (saved) {
      for (let index = 0; index < MAX_SLOTS; index += 1) {
        if (typeof saved.labels[index] === 'string') {
          labels[index] = saved.labels[index];
        }
      }

      const isFresh = saved.updatedAt ? Date.now() - saved.updatedAt <= checklistBehavior.freshnessWindowMs : true;
      if (isFresh) {
        for (let index = 0; index < MAX_SLOTS; index += 1) {
          tasks[index] = Boolean(saved.tasks[index]);
        }
      }
    }

    const activeIndices = (): number[] => labels
      .map((label, index) => (label ? index : null))
      .filter((value): value is number => value !== null);

    const activeCount = (): number => activeIndices().length;

    const buildEmbed = (): EmbedBuilder => {
      const active = activeIndices();
      const completed = active.filter(index => tasks[index]).length;
      const filled = '█'.repeat(completed);
      const empty = '░'.repeat(Math.max(0, active.length - completed));

      return new EmbedBuilder()
        .setTitle(checklistUi.title)
        .setDescription(checklistUi.description)
        .addFields({
          name: checklistUi.progressFieldName,
          value: `**${completed}/${activeCount()}**  ${filled}${empty}`,
        })
        .setColor(checklistUi.color);
    };

    const buildTaskRows = (indices: number[] = activeIndices()) => {
      const rows: ActionRowBuilder<ButtonBuilder>[] = [];
      const rowCount = checklistBehavior.taskGridRowCount;
      const columns = Math.min(checklistBehavior.taskGridMaxColumns, Math.ceil(indices.length / rowCount) || 1);

      for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
        const row = new ActionRowBuilder<ButtonBuilder>();
        for (let colIndex = 0; colIndex < columns; colIndex += 1) {
          const slotIndex = indices[rowIndex * columns + colIndex];
          if (typeof slotIndex !== 'number') {
            continue;
          }

          const checked = tasks[slotIndex];
          const label = `${checked ? checklistUi.completeEmoji : checklistUi.incompleteEmoji} ${labels[slotIndex] ?? checklistUi.unassignedLabel}`;
          row.addComponents(
            new ButtonBuilder()
              .setCustomId(createChecklistTaskCustomId(slotIndex))
              .setLabel(label.slice(0, 80))
              .setStyle(checked ? ButtonStyle.Success : ButtonStyle.Secondary)
          );
        }

        if (row.components.length > 0) {
          rows.push(row);
        }
      }

      return rows;
    };

    const buildControlRow = () => new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(checklistIds.enterEdit).setLabel(checklistUi.editButton).setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(checklistIds.reset).setLabel(checklistUi.resetButton).setStyle(ButtonStyle.Danger)
    );

    const response = await interaction.reply({
      embeds: [buildEmbed()],
      components: [...buildTaskRows(), buildControlRow()],
      ephemeral: true,
      fetchReply: true,
    });

    void (async () => {
      const reconcile = await reconcileUserChecklistState(storageUserId);
      await runCloudReconcileUi<NonNullable<Awaited<ReturnType<typeof getUserChecklist>>>>({
        interaction,
        promptKey: 'checklist-sync',
        userId: interaction.user.id,
        autoCloudEnabled: reconcile.autoCloudEnabled,
        direction: reconcile.direction,
        hasDifference: reconcile.hasDifference && reconcile.cloudState !== null,
        cloudState: reconcile.cloudState,
        applyCloudToLocal: reconcile.applyCloudToLocal,
        applyLocalToCloud: reconcile.applyLocalToCloud,
        onCloudApplied: async (next) => {
          for (let index = 0; index < MAX_SLOTS; index += 1) {
            labels[index] = (next.labels[index] ?? defaultLabels[index] ?? null);
            tasks[index] = Boolean(next.tasks[index]);
          }

          await interaction.editReply({
            embeds: [buildEmbed()],
            components: [...buildTaskRows(), buildControlRow()],
          });
        },
      });
    })();

    if (!('createMessageComponentCollector' in response)) {
      await interaction.editReply({
        embeds: [buildEmbed().setFooter({ text: checklistUi.sessionTimedOutFooter })],
        components: [],
      }).catch(() => {});
      return;
    }

    const collector = response.createMessageComponentCollector({ time: checklistBehavior.collectorTimeoutMs });
    const client = interaction.client as ToolsBotClient;
    const scopedSessionId = `checklist:${interaction.id}`;
    client.scopedInteractionSessions.register({
      sessionId: scopedSessionId,
      ownerUserId: interaction.user.id,
      messageId: response.id,
      modalCustomIds: [createChecklistModalPrefix(MODE_EDIT), createChecklistModalPrefix(MODE_ADD)],
      ttlMs: checklistBehavior.collectorTimeoutMs,
    });
    const editState: { selectedMode: typeof MODE_EDIT | typeof MODE_ADD | typeof MODE_REMOVE; selectedSlot: number | null } = {
      selectedMode: MODE_EDIT,
      selectedSlot: null,
    };

    const buildEditEmbed = () => new EmbedBuilder()
      .setTitle(checklistUi.editTitle)
      .setDescription(checklistUi.editDescription)
      .setColor(checklistUi.editColor)
      .addFields({
        name: checklistUi.slotsFieldName,
        value: labels.map((label, index) => `${index + 1}. ${label ?? checklistUi.unassignedLabel}`).join('\n'),
      });

    const buildModeSelectRow = () => new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(checklistIds.modeSelect)
        .setPlaceholder(checklistUi.modePlaceholder)
        .addOptions([
          { label: checklistUi.modeEdit, value: MODE_EDIT, default: editState.selectedMode === MODE_EDIT },
          { label: checklistUi.modeAdd, value: MODE_ADD, default: editState.selectedMode === MODE_ADD },
          { label: checklistUi.modeRemove, value: MODE_REMOVE, default: editState.selectedMode === MODE_REMOVE },
        ])
    );

    const buildSlotSelectRow = () => {
      const options: Array<{ label: string; value: string; description: string; default?: boolean }> = [];

      if (editState.selectedMode === MODE_EDIT) {
        const active = activeIndices();
        const selected = active.includes(0) ? 0 : (active[0] ?? null);
        editState.selectedSlot = selected;
        for (const slot of active) {
          options.push({
            label: checklistUi.slotLabelTemplate.replace('{index}', String(slot + 1)),
            value: String(slot),
            description: labels[slot] ?? checklistUi.unassignedLabel,
            default: slot === selected,
          });
        }
      } else if (editState.selectedMode === MODE_ADD) {
        const available = labels
          .map((label, index) => (!label ? index : null))
          .filter((value): value is number => value !== null);
        editState.selectedSlot = available[0] ?? null;
        for (const slot of available) {
          options.push({
            label: checklistUi.slotLabelTemplate.replace('{index}', String(slot + 1)),
            value: String(slot),
            description: checklistUi.unassignedLabel,
            default: slot === editState.selectedSlot,
          });
        }
      } else {
        const removable = labels
          .map((label, index) => (label ? index : null))
          .filter((value): value is number => value !== null);
        editState.selectedSlot = removable[0] ?? null;
        for (const slot of removable) {
          options.push({
            label: checklistUi.slotLabelTemplate.replace('{index}', String(slot + 1)),
            value: String(slot),
            description: labels[slot] ?? checklistUi.assignedLabel,
            default: slot === editState.selectedSlot,
          });
        }
      }

      if (options.length === 0) {
        options.push({
          label: checklistUi.noSlotsLabel,
          value: NO_SLOT_VALUE,
          description: checklistUi.noSlotsDescription,
          default: true,
        });
      }

      return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(checklistIds.slotSelect)
          .setPlaceholder(checklistUi.slotPlaceholder)
          .addOptions(options)
      );
    };

    const buildActionRow = () => {
      const label = editState.selectedMode === MODE_ADD
        ? checklistUi.actionAdd
        : editState.selectedMode === MODE_REMOVE
          ? checklistUi.actionRemove
          : checklistUi.actionEdit;
      return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(checklistIds.actionConfirm).setLabel(label).setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(checklistIds.actionBack).setLabel(checklistUi.actionBack).setStyle(ButtonStyle.Secondary)
      );
    };

    collector.on('collect', async componentInteraction => {
      if (componentInteraction.user.id !== interaction.user.id) {
        await componentInteraction.reply({ content: checklistUi.ownershipError, ephemeral: true });
        return;
      }

      const id = componentInteraction.customId;

      if (id === checklistIds.enterEdit) {
        editState.selectedMode = MODE_EDIT;
        await componentInteraction.update({
          embeds: [buildEditEmbed()],
          components: [buildModeSelectRow(), buildSlotSelectRow(), buildActionRow()],
        });
        return;
      }

      if (id === checklistIds.reset) {
        for (let index = 0; index < MAX_SLOTS; index += 1) {
          tasks[index] = false;
        }
        await saveUserChecklist(storageUserId, labels, tasks);
        await componentInteraction.update({
          embeds: [buildEmbed()],
          components: [...buildTaskRows(), buildControlRow()],
        });
        return;
      }

      if (id === checklistIds.modeSelect && componentInteraction.isStringSelectMenu()) {
        const nextMode = componentInteraction.values[0];
        if (nextMode === MODE_ADD || nextMode === MODE_REMOVE || nextMode === MODE_EDIT) {
          editState.selectedMode = nextMode as typeof MODE_EDIT | typeof MODE_ADD | typeof MODE_REMOVE;
        }
        await componentInteraction.update({
          embeds: [buildEditEmbed()],
          components: [buildModeSelectRow(), buildSlotSelectRow(), buildActionRow()],
        });
        return;
      }

      if (id === checklistIds.slotSelect && componentInteraction.isStringSelectMenu()) {
        const value = componentInteraction.values[0];
        editState.selectedSlot = value === NO_SLOT_VALUE ? null : Number(value);
        await componentInteraction.deferUpdate();
        return;
      }

      if (id === checklistIds.actionBack) {
        await componentInteraction.update({
          embeds: [buildEmbed()],
          components: [...buildTaskRows(), buildControlRow()],
        });
        return;
      }

      if (id === checklistIds.actionConfirm) {
        const slot = editState.selectedSlot;
        if (typeof slot !== 'number') {
          await componentInteraction.deferUpdate();
          return;
        }

        if (editState.selectedMode === MODE_REMOVE) {
          labels[slot] = null;
          tasks[slot] = false;
          await saveUserChecklist(storageUserId, labels, tasks);
          await componentInteraction.update({
            embeds: [buildEditEmbed()],
            components: [buildModeSelectRow(), buildSlotSelectRow(), buildActionRow()],
          });
          return;
        }

        const modal = new ModalBuilder()
          .setCustomId(createChecklistModalBaseCustomId(editState.selectedMode, slot))
          .setTitle(`${editState.selectedMode === MODE_ADD ? checklistUi.modalTitleAdd : checklistUi.modalTitleEdit} ${checklistUi.modalTitleSlotTemplate.replace('{index}', String(slot + 1))}`)
          .addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder()
                .setCustomId(checklistIds.modalInput)
                .setLabel(checklistUi.modalInputLabel)
                .setStyle(TextInputStyle.Short)
                .setMaxLength(80)
                .setMinLength(1)
                .setPlaceholder(checklistUi.modalInputPlaceholder)
            )
          );

        const submitted = await showModalAndAwaitSubmit({
          componentInteraction,
          modal,
          baseCustomId: createChecklistModalBaseCustomId(editState.selectedMode, slot),
          userId: componentInteraction.user.id,
          timeoutMs: checklistBehavior.modalSubmitTimeoutMs,
        });

        if (!submitted) {
          return;
        }

        const nextLabel = submitted.fields.getTextInputValue(checklistIds.modalInput).slice(0, 80);
        labels[slot] = nextLabel;
        await saveUserChecklist(storageUserId, labels, tasks);
        await submitted.deferUpdate();
        await interaction.editReply({
          embeds: [buildEditEmbed()],
          components: [buildModeSelectRow(), buildSlotSelectRow(), buildActionRow()],
        });

        return;
      }

      const idx = parseChecklistTaskCustomId(id);
      if (idx !== null) {
        if (idx >= 0 && idx < tasks.length && labels[idx]) {
          tasks[idx] = !tasks[idx];
          await saveUserChecklist(storageUserId, labels, tasks);
          await componentInteraction.update({
            embeds: [buildEmbed()],
            components: [...buildTaskRows(), buildControlRow()],
          });
          return;
        }
      }

      await componentInteraction.deferUpdate();
    });

    collector.on('end', async (_collected, reason) => {
      client.scopedInteractionSessions.unregister(scopedSessionId);
      const disabledRows = buildTaskRows().map(row => {
        row.components.forEach(component => component.setDisabled(true));
        return row;
      });
      const disabledControl = buildControlRow();
      disabledControl.components.forEach(component => component.setDisabled(true));

      await interaction.editReply({
        embeds: [EmbedBuilder.from(buildEmbed()).setFooter({ text: `${checklistUi.closedFooterPrefix} (${reason}).` })],
        components: [...disabledRows, disabledControl],
      }).catch(() => {});
    });
  },
};
