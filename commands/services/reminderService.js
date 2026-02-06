const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const db = require('./dbHandler');
const { getByKey, getNextTimestampFor } = require('../data/remindersData');

async function sendReminderDM(client, userId, reminderKey) {
    try {
        const settings = await db.getReminderSettings(userId);
        if (settings && settings.paused) return false;
        const userReminders = await db.getUserReminders(userId);
        const reminder = getByKey(reminderKey);
        if (!reminder) return false;
        // if user has an explicit setting and it's disabled, skip
        if (userReminders && userReminders.hasOwnProperty(reminderKey) && !userReminders[reminderKey]) return false;
        // if user has no explicit setting, respect defaultEnabled
        if ((!userReminders || !userReminders.hasOwnProperty(reminderKey)) && !reminder.defaultEnabled) return false;

        const user = await client.users.fetch(userId);
        if (!user) return false;

        // reminder already fetched above

        const embed = new EmbedBuilder()
            .setTitle('Reminder Alert!')
            .addFields(
                { name: reminder.group, value: reminder.title || ' ', inline: false },
                { name: 'Next Reminder', value: (() => {
                    const ts = getNextTimestampFor(reminderKey);
                    if (!ts) return `${reminder.group} - ${reminder.title}\nNo scheduled time`;
                    return `${reminder.group} - ${reminder.title}\n<t:${ts}:R>`;
                })(), inline: false }
            )
            .setFooter({ text: 'Use /remind in tower server to edit your reminders' });

        const stopButton = new ButtonBuilder()
            .setCustomId(`stop_reminder_${userId}_${reminderKey}`)
            .setLabel('Stop This Reminder')
            .setStyle(ButtonStyle.Danger);

        const row = new ActionRowBuilder().addComponents(stopButton);

        await user.send({ embeds: [embed], components: [row] });
        return true;
    } catch (err) {
        console.error('Error sending reminder DM:', err);
        return false;
    }
}

async function handleStopReminderInteraction(interaction) {
    // customId: stop_reminder_<userId>_<reminderKey>
    try {
        const parts = interaction.customId.split('_');
        // parts: [stop, reminder, <userId>, <reminderKeyParts...>]
        if (parts.length < 4) return;
        const userId = parts[2];
        const reminderKey = parts.slice(3).join('_');
        if (interaction.user.id !== userId) {
            await interaction.reply({ content: 'You are not authorized to stop this reminder.', ephemeral: true });
            return;
        }
        await db.setReminderDisabled(userId, reminderKey);
        await interaction.update({ content: 'This reminder has been stopped for you.', embeds: [], components: [] });
    } catch (err) {
        console.error('Error handling stop reminder interaction:', err);
        try { await interaction.reply({ content: 'Failed to stop reminder.', ephemeral: true }); } catch {};
    }
}

async function sendTestDM(client, userId) {
    try {
        const user = await client.users.fetch(userId);
        if (!user) return { ok: false, reason: 'User not found' };

        const embed = new EmbedBuilder()
            .setTitle('Reminder Alert!')
            .addFields(
                { name: 'Test Reminder', value: 'This is a test reminder to confirm you can receive DMs from the bot.', inline: false },
                { name: 'Next Reminder', value: 'Test', inline: false }
            )
            .setFooter({ text: 'Use /remind in tower server to edit your reminders' });

        await user.send({ embeds: [embed] });
        return { ok: true };
    } catch (err) {
        console.error('Error sending test DM:', err);
        // Discord API error when DMs are disabled is 50007
        const code = err?.code || err?.status || null;
        if (code === 50007) {
            return { ok: false, reason: 'I cannot send you Direct Messages. Please add the bot as a friend or enable DMs from server members in your Discord privacy settings and ensure you have not blocked the bot.' };
        }
        return { ok: false, reason: `Failed to send DM: ${err?.message || String(err)}` };
    }
}

module.exports = { sendReminderDM, handleStopReminderInteraction, sendTestDM };
