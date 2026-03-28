import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageComponentInteraction,
} from 'discord.js';
import { getNextReminderTimestamp as getNextTimestampFor, getReminderDefinitionByKey as getReminderByKey } from '@tmrxjd/platform/tools';
import {
  getReminderSettings,
  getUserReminders,
  setReminderDisabled,
} from './user-reminder-db';
import type { ToolsBotClient } from '../core/tools-bot-client';
import { getBotConfig } from '../config/bot-config';
import { createReminderStopCustomId, parseReminderStopCustomId } from './reminder-interaction-ids';

const remindConfig = getBotConfig().commands.remind;
const remindUi = remindConfig.ui;
const remindIds = remindConfig.ids;

export async function sendReminderDM(
  client: ToolsBotClient,
  userId: string,
  reminderKey: string
): Promise<boolean> {
  try {
    const settings = await getReminderSettings(userId);
    if (settings.paused) {
      return false;
    }

    const userReminders = await getUserReminders(userId);
    const reminder = getReminderByKey(reminderKey);
    if (!reminder) {
      return false;
    }

    if (Object.prototype.hasOwnProperty.call(userReminders, reminderKey) && !userReminders[reminderKey]) {
      return false;
    }

    if (!Object.prototype.hasOwnProperty.call(userReminders, reminderKey) && !reminder.defaultEnabled) {
      return false;
    }

    const user = await client.users.fetch(userId);
    if (!user) {
      return false;
    }

    const nextTimestamp = getNextTimestampFor(reminderKey);
    const reminderLine = remindUi.dmReminderLineTemplate
      .replace('{group}', reminder.group)
      .replace('{title}', reminder.title);
    const nextReminderText = nextTimestamp
      ? `${reminderLine}\n<t:${nextTimestamp}${remindUi.relativeTimeFormat}>`
      : `${reminderLine}\n${remindUi.dmNoScheduledTime}`;

    const embed = new EmbedBuilder()
      .setTitle(remindUi.dmAlertTitle)
      .addFields(
        { name: reminder.group, value: reminder.title || ' ', inline: false },
        { name: remindUi.dmNextReminderField, value: nextReminderText, inline: false }
      )
      .setFooter({ text: remindUi.dmFooter });

    const stopButton = new ButtonBuilder()
      .setCustomId(createReminderStopCustomId(userId, reminderKey))
      .setLabel(remindUi.dmStopButtonLabel)
      .setStyle(ButtonStyle.Danger);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(stopButton);
    await user.send({ embeds: [embed], components: [row] });
    return true;
  } catch {
    return false;
  }
}

export async function handleStopReminderInteraction(interaction: MessageComponentInteraction): Promise<void> {
  const parsed = parseReminderStopCustomId(interaction.customId);
  if (!parsed) {
    return;
  }

  const { userId, reminderKey } = parsed;
  if (interaction.user.id !== userId) {
    await interaction.reply({ content: remindUi.dmStopUnauthorized, ephemeral: true });
    return;
  }

  await setReminderDisabled(userId, reminderKey);
  await interaction.update({ content: remindUi.dmStopConfirmed, embeds: [], components: [] });
}

export async function sendTestDM(client: ToolsBotClient, userId: string): Promise<{ ok: boolean; reason?: string }> {
  try {
    const user = await client.users.fetch(userId);
    if (!user) {
      return { ok: false, reason: remindUi.dmUserNotFound };
    }

    const embed = new EmbedBuilder()
      .setTitle(remindUi.dmAlertTitle)
      .addFields(
        {
          name: remindUi.dmTestFieldName,
          value: remindUi.dmTestFieldValue,
          inline: false,
        },
        { name: remindUi.dmNextReminderField, value: remindUi.dmTestNextValue, inline: false }
      )
      .setFooter({ text: remindUi.dmFooter });

    await user.send({ embeds: [embed] });
    return { ok: true };
  } catch (error) {
    const typedError = error as { code?: number; status?: number; message?: string };
    const code = typedError.code ?? typedError.status ?? null;
    if (code === 50007) {
      return {
        ok: false,
        reason: remindUi.dmBlockedReason,
      };
    }
    return { ok: false, reason: `${remindUi.dmSendFailedPrefix}${typedError.message ?? String(error)}` };
  }
}
