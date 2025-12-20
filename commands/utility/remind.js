const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ComponentType } = require('discord.js');
const db = require('./dbHandler');
const { reminders, getNextTimestampFor } = require('../data/remindersData');
const reminderService = require('../services/reminderService');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('remind')
        .setDescription('Configure your Tower reminders'),
    async execute(interaction) {
        const userId = interaction.user.id;
        console.log(`User ${userId} invoked /remind`);
        // Reply immediately to avoid interaction timeout
        await interaction.deferReply({ ephemeral: true });
        const msg = await interaction.fetchReply();

        // Load user's reminder preferences (fall back to defaults)
        const userReminders = await db.getUserReminders(userId);
        const prefs = {};
        for (const r of reminders) prefs[r.key] = (userReminders.hasOwnProperty(r.key) ? userReminders[r.key] : !!r.defaultEnabled);

        function buildEmbed(showExactTime) {
            const embed = new EmbedBuilder()
                .setTitle('Tower Reminders')
                .setDescription('Use the dropdown below to enable and disable reminders. Make sure proper permissions are set to receive Direct Messages from the bot. You can use the test button below to confirm you can receive reminders.');

            for (const r of reminders) {
                const enabled = prefs[r.key];
                const emoji = enabled ? '✅' : '❌';
                const ts = getNextTimestampFor(r.key);
                let desc = 'Next Reminder: No scheduled time';
                if (ts) {
                    desc = showExactTime ? `Next Reminder: <t:${ts}:f>` : `Next Reminder: <t:${ts}:R>`;
                }
                embed.addFields({ name: `${emoji} ${r.group}: ${r.title}`, value: desc, inline: false });
            }
            return embed;
        }

        function buildSelect() {
            const options = reminders.map(r => {
                const enabled = !!prefs[r.key];
                const opt = { label: `${r.group}: ${r.title}`, value: r.key, description: enabled ? 'Enabled' : 'Disabled' };
                return opt;
            });
            const selected = Object.entries(prefs).filter(([k, v]) => v).map(([k]) => k);
            const menu = new StringSelectMenuBuilder()
                .setCustomId(`remind_select_${userId}`)
                .setPlaceholder('Select reminders to receive')
                .setMinValues(0)
                .setMaxValues(options.length)
                .addOptions(options);
            const row = new ActionRowBuilder().addComponents(menu);
            return { row, selected };
        }

        function buildButtons(paused, showExactTime) {
            const pauseBtn = new ButtonBuilder()
                .setCustomId(`remind_pause_${userId}`)
                .setLabel(paused ? 'Resume All Reminders' : 'Pause All Reminders')
                .setStyle(paused ? ButtonStyle.Success : ButtonStyle.Danger);
            const toggleBtn = new ButtonBuilder()
                .setCustomId(`remind_toggletime_${userId}`)
                .setLabel(showExactTime ? 'Show Relative Times' : 'Show Exact Times')
                .setStyle(ButtonStyle.Primary);
            const testBtn = new ButtonBuilder()
                .setCustomId(`remind_test_${userId}`)
                .setLabel('Send Test Reminder')
                .setStyle(ButtonStyle.Secondary);            
            const row = new ActionRowBuilder().addComponents(pauseBtn, toggleBtn, testBtn);
            return row;
        }

        const reminderSettings = await db.getReminderSettings(userId);
        let paused = reminderSettings ? !!reminderSettings.paused : false;
        let showExact = false; // default to relative

        // Edit the initial reply with the full interactive UI
        const embed = buildEmbed(showExact);
        const { row: selectRow } = buildSelect();
        const buttonRow = buildButtons(paused, showExact);
        await interaction.editReply({ content: null, embeds: [embed], components: [selectRow, buttonRow] });

        const collector = msg.createMessageComponentCollector({ filter: i => i.user.id === userId, time: 10 * 60 * 1000 });

        collector.on('collect', async i => {
            try {
                if (i.isStringSelectMenu() && i.customId === `remind_select_${userId}`) {
                    // i.values contains selected keys
                    const selected = new Set(i.values);
                    // Toggle the state for each selected reminder only
                    for (const key of selected) {
                        prefs[key] = !prefs[key];
                    }
                    await db.saveUserReminders(userId, prefs);
                    const newEmbed = buildEmbed(showExact);
                    const { row: newSelectRow } = buildSelect();
                    const newButtonRow = buildButtons(paused, showExact);
                    await i.update({ embeds: [newEmbed], components: [newSelectRow, newButtonRow] });
                } else if (i.isButton() && i.customId === `remind_pause_${userId}`) {
                    // toggle paused
                    paused = !paused;
                    await db.setPauseAll(userId, paused);
                    const newButtonRow = buildButtons(paused, showExact);
                    const newEmbed = buildEmbed(showExact);
                    const { row: newSelectRow } = buildSelect();
                    await i.update({ embeds: [newEmbed], components: [newSelectRow, newButtonRow] });
                } else if (i.isButton() && i.customId === `remind_test_${userId}`) {
                    // Send a test DM and report status
                    try {
                        const res = await reminderService.sendTestDM(interaction.client, userId);
                        if (res.ok) {
                            await i.reply({ content: 'Test reminder sent to your DMs.', ephemeral: true });
                        } else {
                            await i.reply({ content: `Unable to send test reminder: ${res.reason}`, ephemeral: true });
                        }
                    } catch (err) {
                        console.error('Error running test send:', err);
                        try { await i.reply({ content: 'Failed to send test reminder.', ephemeral: true }); } catch {};
                    }
                } else if (i.isButton() && i.customId === `remind_toggletime_${userId}`) {
                    // toggle time display exact vs relative
                    showExact = !showExact;
                    const newEmbed = buildEmbed(showExact);
                    const { row: newSelectRow } = buildSelect();
                    const newButtonRow = buildButtons(paused, showExact);
                    await i.update({ embeds: [newEmbed], components: [newSelectRow, newButtonRow] });
                } else {
                    await i.reply({ content: 'Unknown component.', ephemeral: true });
                }
            } catch (err) {
                console.error('Remind collector error:', err);
                try { await i.reply({ content: 'There was an error handling that action.', ephemeral: true }); } catch {};
            }
        });

        collector.on('end', collected => {
            // disable components after collector stops
            try {
                const disabledSelect = selectRow.components[0].setDisabled(true);
                const disabledButtons = buttonRow.components.map(b => b.setDisabled(true));
                interaction.editReply({ components: [new ActionRowBuilder().addComponents(disabledSelect), new ActionRowBuilder().addComponents(...disabledButtons)] }).catch(() => {});
            } catch (e) {}
        });
    }
};
