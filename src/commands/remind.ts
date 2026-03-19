import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
} from 'discord.js';
import type { CommandModule } from '../core/command-types';
import { getNextReminderTimestamp as getNextTimestampFor, reminderDefinitions as reminders } from '@tmrxjd/platform/tools';
import {
  getReminderSettings,
  reconcileUserReminderState,
  getUserReminders,
  saveUserReminders,
  setPauseAll,
} from '../services/user-reminder-db';
import { sendTestDM } from '../services/reminder-service';
import type { ToolsBotClient } from '../core/tools-bot-client';
import { getBotConfig } from '../config/bot-config';
import { resolveUserStorageState } from '../services/user-storage-resolution';
import { runCloudReconcileUi } from '../services/cloud-reconcile-ui';

const remindConfig = getBotConfig().commands.remind;
const remindUi = remindConfig.ui;
const remindIds = remindConfig.ids;
const remindBehavior = remindConfig.behavior;

const data = new SlashCommandBuilder()
  .setName(remindConfig.name)
  .setDescription(remindConfig.description);

export const remindCommand: CommandModule = {
  data: data.toJSON(),
  async execute(interaction) {
    if (!interaction.isChatInputCommand()) {
      return;
    }

    const userId = interaction.user.id;

    const hasMeaningfulReminders = (candidate: {
      paused: boolean;
      toggles: Record<string, boolean>;
    }): boolean => {
      if (candidate.paused) {
        return true;
      }

      for (const reminder of reminders) {
        const current = Object.prototype.hasOwnProperty.call(candidate.toggles, reminder.key)
          ? Boolean(candidate.toggles[reminder.key])
          : reminder.defaultEnabled;
        if (current !== reminder.defaultEnabled) {
          return true;
        }
      }

      return false;
    };

    const resolvedStorage = await resolveUserStorageState({
      discordUserId: userId,
      load: async (storageId) => {
        const toggles = await getUserReminders(storageId);
        const settings = await getReminderSettings(storageId);
        return {
          paused: settings.paused,
          toggles,
        };
      },
      hasMeaningfulState: hasMeaningfulReminders,
    });

    const storageUserId = resolvedStorage.storageUserId;
    const resolvedReminderState = resolvedStorage.state;

    await interaction.deferReply({ ephemeral: true });
    const message = await interaction.fetchReply();

    const userReminders = resolvedReminderState.toggles;
    const preferences: Record<string, boolean> = {};
    for (const reminder of reminders) {
      preferences[reminder.key] = Object.prototype.hasOwnProperty.call(userReminders, reminder.key)
        ? userReminders[reminder.key]
        : reminder.defaultEnabled;
    }

    const buildEmbed = (showExactTime: boolean): EmbedBuilder => {
      const embed = new EmbedBuilder()
        .setTitle(remindUi.title)
        .setDescription(remindUi.description);

      for (const reminder of reminders) {
        const enabled = preferences[reminder.key];
        const emoji = enabled ? remindUi.enabledEmoji : remindUi.disabledEmoji;
        const timestamp = getNextTimestampFor(reminder.key);
        const nextText = !timestamp
          ? `${remindUi.nextReminderPrefix}${remindUi.noScheduledTime}`
          : showExactTime
            ? `${remindUi.nextReminderPrefix}<t:${timestamp}${remindUi.exactTimeFormat}>`
            : `${remindUi.nextReminderPrefix}<t:${timestamp}${remindUi.relativeTimeFormat}>`;

        const fieldName = remindUi.reminderFieldTemplate
          .replace('{emoji}', emoji)
          .replace('{group}', reminder.group)
          .replace('{title}', reminder.title);

        embed.addFields({
          name: fieldName,
          value: nextText,
          inline: false,
        });
      }
      return embed;
    };

    const buildSelectRow = () => {
      const options = reminders.map(reminder => ({
        label: `${reminder.group}: ${reminder.title}`,
        value: reminder.key,
        description: preferences[reminder.key] ? remindUi.enabledLabel : remindUi.disabledLabel,
      }));

      const menu = new StringSelectMenuBuilder()
        .setCustomId(`${remindIds.selectPrefix}${userId}`)
        .setPlaceholder(remindUi.selectPlaceholder)
        .setMinValues(0)
        .setMaxValues(options.length)
        .addOptions(options);

      return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
    };

    const buildButtonsRow = (paused: boolean, showExactTime: boolean) => {
      const pauseButton = new ButtonBuilder()
        .setCustomId(`${remindIds.pausePrefix}${userId}`)
        .setLabel(paused ? remindUi.resumeLabel : remindUi.pauseLabel)
        .setStyle(paused ? ButtonStyle.Success : ButtonStyle.Danger);

      const toggleTimeButton = new ButtonBuilder()
        .setCustomId(`${remindIds.toggleTimePrefix}${userId}`)
        .setLabel(showExactTime ? remindUi.showRelativeLabel : remindUi.showExactLabel)
        .setStyle(ButtonStyle.Primary);

      const testButton = new ButtonBuilder()
        .setCustomId(`${remindIds.testPrefix}${userId}`)
        .setLabel(remindUi.sendTestLabel)
        .setStyle(ButtonStyle.Secondary);

      return new ActionRowBuilder<ButtonBuilder>().addComponents(pauseButton, toggleTimeButton, testButton);
    };

    let paused = resolvedReminderState.paused;
    let showExact = false;

    await interaction.editReply({
      embeds: [buildEmbed(showExact)],
      components: [buildSelectRow(), buildButtonsRow(paused, showExact)],
    });

    void (async () => {
      const reconcile = await reconcileUserReminderState(storageUserId);
      await runCloudReconcileUi<{ paused: boolean; toggles: Record<string, boolean> }>({
        interaction,
        promptKey: 'remind-sync',
        userId,
        autoCloudEnabled: reconcile.autoCloudEnabled,
        direction: reconcile.direction,
        hasDifference: reconcile.hasDifference,
        cloudState: reconcile.cloudState,
        applyCloudToLocal: reconcile.applyCloudToLocal,
        applyLocalToCloud: reconcile.applyLocalToCloud,
        onCloudApplied: async (next) => {
          paused = next.paused;
          for (const reminder of reminders) {
            preferences[reminder.key] = Object.prototype.hasOwnProperty.call(next.toggles, reminder.key)
              ? Boolean(next.toggles[reminder.key])
              : reminder.defaultEnabled;
          }

          await interaction.editReply({
            embeds: [buildEmbed(showExact)],
            components: [buildSelectRow(), buildButtonsRow(paused, showExact)],
          });
        },
      });
    })();

    if (!('createMessageComponentCollector' in message)) {
      await interaction.editReply({
        embeds: [buildEmbed(showExact).setFooter({ text: remindUi.collectorUnavailable })],
        components: [],
      }).catch(() => {});
      return;
    }

    const collector = message.createMessageComponentCollector({
      filter: componentInteraction => componentInteraction.user.id === userId,
      time: remindBehavior.collectorTimeoutMs,
    });

    collector.on('collect', async componentInteraction => {
      if (componentInteraction.isStringSelectMenu() && componentInteraction.customId === `${remindIds.selectPrefix}${userId}`) {
        const selected = new Set(componentInteraction.values);
        for (const selectedKey of selected) {
          preferences[selectedKey] = !preferences[selectedKey];
        }

        await saveUserReminders(storageUserId, preferences);
        await componentInteraction.update({
          embeds: [buildEmbed(showExact)],
          components: [buildSelectRow(), buildButtonsRow(paused, showExact)],
        });
        return;
      }

      if (componentInteraction.isButton() && componentInteraction.customId === `${remindIds.pausePrefix}${userId}`) {
        paused = !paused;
        await setPauseAll(storageUserId, paused);
        await componentInteraction.update({
          embeds: [buildEmbed(showExact)],
          components: [buildSelectRow(), buildButtonsRow(paused, showExact)],
        });
        return;
      }

      if (componentInteraction.isButton() && componentInteraction.customId === `${remindIds.toggleTimePrefix}${userId}`) {
        showExact = !showExact;
        await componentInteraction.update({
          embeds: [buildEmbed(showExact)],
          components: [buildSelectRow(), buildButtonsRow(paused, showExact)],
        });
        return;
      }

      if (componentInteraction.isButton() && componentInteraction.customId === `${remindIds.testPrefix}${userId}`) {
        const result = await sendTestDM(interaction.client as ToolsBotClient, userId);
        await componentInteraction.reply({
          content: result.ok ? remindUi.testSent : `${remindUi.testFailedPrefix}${result.reason}`,
          ephemeral: true,
        });
        return;
      }

      await componentInteraction.reply({ content: remindUi.unknownComponent, ephemeral: true });
    });

    collector.on('end', async () => {
      const disabledSelectRow = buildSelectRow();
      disabledSelectRow.components.forEach(component => component.setDisabled(true));
      const disabledButtonRow = buildButtonsRow(paused, showExact);
      disabledButtonRow.components.forEach(component => component.setDisabled(true));

      await interaction.editReply({
        components: [disabledSelectRow, disabledButtonRow],
      }).catch(() => {});
    });
  },
};
