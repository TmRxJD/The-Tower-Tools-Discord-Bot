const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { getUserChecklist, saveUserChecklist } = require('./dbHandler.js');

// Optional default labels (array of 12 strings). Use setDefaultLabels to override.
let DEFAULT_LABELS = null;

// Default labels for checklist (customize these as needed)
const DEFAULT_LABEL_ARRAY = [
    'UWs',
    'Modules',
    'Cards',
    'Labs',
    'Bots',
    'Guardians',
    'Orbs',
    'Range/SW Size',
    'Target Prio',
    'Freeup Locks',
    'Black Background/Theme',
    'Restart Game',
];

// Initialize DEFAULT_LABELS from the default array (supports up to 16 slots)
DEFAULT_LABELS = normalizeLabels(DEFAULT_LABEL_ARRAY).concat(new Array(4).fill(null));

function normalizeLabels(labels) {
    if (!Array.isArray(labels)) return null;
    const out = new Array(12).fill('');
    for (let i = 0; i < 12; i++) {
        const v = labels[i];
        out[i] = (typeof v === 'string' && v.length > 0) ? v : `Task ${i + 1}`;
    }
    return out;
}

module.exports = {
    category: 'utility',
    data: new SlashCommandBuilder()
        .setName('checklist')
        .setDescription("Make sure you're ready for tournaments"),

    async execute(interaction) {
        try {
            // Support up to 16 slots (first 12 prefilled, last 4 may be null)
            const MAX_SLOTS = 16;
            // start with defaults
            const labels = (DEFAULT_LABELS || normalizeLabels([])).slice(0, MAX_SLOTS);
            // tasks for all slots
            const tasks = new Array(MAX_SLOTS).fill(false);

            // Load user-specific checklist from DB (if present)
            try {
                const saved = await getUserChecklist(interaction.user.id);
                if (saved && Array.isArray(saved.labels)) {
                    // copy up to MAX_SLOTS, fill missing with existing labels or null
                    for (let s = 0; s < MAX_SLOTS; s++) {
                        if (typeof saved.labels[s] === 'string') labels[s] = saved.labels[s];
                        else if (labels[s] === undefined) labels[s] = null;
                    }
                }
                if (saved && Array.isArray(saved.tasks)) {
                    // if saved.updatedAt is older than 24h, reset tasks to unchecked
                    try {
                        if (saved.updatedAt) {
                            const then = new Date(saved.updatedAt).getTime();
                            const now = Date.now();
                            if ((now - then) > 24 * 60 * 60 * 1000) {
                                // older than 24h: ignore saved tasks (leave as unchecked)
                            } else {
                                for (let s = 0; s < MAX_SLOTS; s++) tasks[s] = !!saved.tasks[s];
                            }
                        } else {
                            for (let s = 0; s < MAX_SLOTS; s++) tasks[s] = !!saved.tasks[s];
                        }
                    } catch (e) {
                        console.error('Error applying saved tasks (date parse):', e);
                        for (let s = 0; s < MAX_SLOTS; s++) tasks[s] = !!saved.tasks[s];
                    }
                }
            } catch (e) {
                console.error('Error loading saved checklist for user:', e);
            }

            // Helper to compute active slot indices
            const activeIndices = () => labels.map((l, i) => (l ? i : null)).filter(v => v !== null);

            // Helper to count active
            const activeCount = () => activeIndices().length;

            const buildEmbed = () => {
                const completed = tasks.filter(Boolean).length;
                // Simple progress bar (12 blocks)
                const filled = '█'.repeat(completed);
                const empty = '░'.repeat(Math.max(0, activeCount() - completed));
                return new EmbedBuilder()
                    .setTitle('Tourney Checklist')
                    .setDescription('Click the buttons below to mark as complete.')
                    .addFields({ name: 'Progress', value: `**${completed}/${activeCount()}**  ${filled}${empty}` })
                    .setColor('#3ac18e');
            };
            const buildRows = (useIndices = null) => {
                // useIndices: array of slot indices to display in order; if null, use activeIndices()
                const indices = useIndices || activeIndices();
                const rows = [];
                const rowsCount = 4;
                const total = indices.length;
                const cols = Math.min(4, Math.ceil(total / rowsCount) || 1);
                for (let r = 0; r < rowsCount; r++) {
                    const row = new ActionRowBuilder();
                    for (let c = 0; c < cols; c++) {
                        const idx = indices[r * cols + c];
                        if (typeof idx === 'number') {
                            const checked = tasks[idx];
                            const label = `${checked ? '✅' : '⬜'} ${labels[idx] || 'Use Add Button to Assign'}`;
                            const btn = new ButtonBuilder()
                                .setCustomId(`check_${idx}`)
                                .setLabel(label)
                                .setStyle(checked ? ButtonStyle.Success : ButtonStyle.Secondary);
                            row.addComponents(btn);
                        }
                    }
                    // Only add row if it has components
                    if (row.components.length > 0) rows.push(row);
                }
                return rows;
            };

            // Build an action row containing the Edit Checklist button and Reset
            const buildControlRow = () => {
                return new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('enter_edit').setLabel('Edit Checklist').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('reset_checklist').setLabel('Reset').setStyle(ButtonStyle.Danger)
                );
            };

            const embed = buildEmbed();
            const rows = buildRows();
            const controlRow = buildControlRow();

            // Include the control row on the main view so users can enter edit mode
            const reply = await interaction.reply({ embeds: [embed], components: [...rows, controlRow], ephemeral: true, fetchReply: true });

            const collector = reply.createMessageComponentCollector({ time: 1000 * 60 * 10 }); // 10 minutes

            // State for edit UI
            let editState = {
                mode: 'view', // or 'edit'
                selectedMode: 'edit', // 'edit' | 'add' | 'remove'
                selectedSlot: null, // index
            };

            collector.on('collect', async i => {
                try {
                    if (i.user.id !== interaction.user.id) {
                        await i.reply({ content: 'This checklist belongs to someone else.', ephemeral: true });
                        return;
                    }

                    const id = i.customId;
                    // Handle different customId patterns
                    if (id === 'enter_edit') {
                        // Enter edit mode: show numbered slots and controls
                        editState.mode = 'edit';
                        editState.selectedMode = 'edit';
                        editState.selectedSlot = null;

                        const indices = [];
                        // show all 16 slots numbered
                        for (let s = 0; s < MAX_SLOTS; s++) indices.push(s);

                        const editEmbed = new EmbedBuilder()
                            .setTitle('Edit Checklist')
                            .setDescription('Manage buttons below. Use the mode selector to Edit, Add, or Remove. Back returns to the checklist.')
                            .setColor('#f1c40f')
                            .addFields({ name: 'Slots', value: indices.map(i2 => `${i2 + 1}. ${labels[i2] || 'Use Add Button to Assign'}`).join('\n') });

                        // Mode dropdown
                        const modeSelect = new ActionRowBuilder().addComponents(
                            new StringSelectMenuBuilder()
                                .setCustomId('mode_select')
                                .setPlaceholder('Select mode')
                                .addOptions([
                                    { label: 'Edit Checklist', value: 'edit', default: true },
                                    { label: 'Add Button', value: 'add' },
                                    { label: 'Remove Button', value: 'remove' }
                                ])
                        );

                        // Slot select (initially for edit mode: only active slots)
                        const slotOptions = [];
                        const act = activeIndices();
                        if (act.length > 0) {
                            // default to slot 1 if active, otherwise first active slot
                            editState.selectedSlot = act.includes(0) ? 0 : act[0];
                            for (const s of act) {
                                slotOptions.push({ label: `Slot ${s + 1}`, value: String(s), description: labels[s] || 'Unassigned', default: (s === editState.selectedSlot) });
                            }
                        } else {
                            editState.selectedSlot = null;
                            slotOptions.push({ label: 'No active slots', value: 'none', description: 'No active slots available', default: true });
                        }
                        const slotSelect = new ActionRowBuilder().addComponents(
                            new StringSelectMenuBuilder()
                                .setCustomId('slot_select')
                                .setPlaceholder('Select a slot')
                                .addOptions(slotOptions)
                        );

                        const actionRow = new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId('action_confirm').setLabel('Edit').setStyle(ButtonStyle.Success),
                            new ButtonBuilder().setCustomId('action_back').setLabel('Back').setStyle(ButtonStyle.Secondary)
                        );

                        await i.update({ embeds: [editEmbed], components: [modeSelect, slotSelect, actionRow] });
                        return;
                    }

                    if (id === 'reset_checklist') {
                        // Clear all task checks (but keep labels)
                        for (let s = 0; s < MAX_SLOTS; s++) tasks[s] = false;
                        const mainEmbed = buildEmbed();
                        const mainRows = buildRows();
                        await i.update({ embeds: [mainEmbed], components: [...mainRows, buildControlRow()] });
                        try { await saveUserChecklist(interaction.user.id, labels, tasks); } catch (e) { console.error('Failed to save checklist after reset:', e); }
                        return;
                    }

                    if (id === 'mode_select') {
                        // mode change
                        editState.selectedMode = i.values[0];
                        // Rebuild the slot select and confirm button label
                        const slotOptions = [];
                        if (editState.selectedMode === 'edit') {
                            // only active slots
                            const act = activeIndices();
                            if (act.length > 0) {
                                // choose default selected slot: prefer index 0 if active, otherwise first active
                                editState.selectedSlot = act.includes(0) ? 0 : act[0];
                                for (const s of act) slotOptions.push({ label: `Slot ${s + 1}`, value: String(s), description: labels[s] || 'Unassigned', default: (s === editState.selectedSlot) });
                            } else {
                                editState.selectedSlot = null;
                                slotOptions.push({ label: 'No active slots', value: 'none', description: 'No active slots available', default: true });
                            }
                        } else if (editState.selectedMode === 'add') {
                            // first available unassigned slot should be default
                            let first = true;
                            editState.selectedSlot = null;
                            for (let s = 0; s < MAX_SLOTS; s++) {
                                if (!labels[s]) {
                                    // set selectedSlot to first unassigned if not already set
                                    if (first) editState.selectedSlot = s;
                                    slotOptions.push({ label: `Slot ${s + 1}`, value: String(s), description: 'Unassigned', default: first });
                                    first = false;
                                }
                            }
                        } else if (editState.selectedMode === 'remove') {
                            // first assigned slot should be default
                            let first = true;
                            editState.selectedSlot = null;
                            for (let s = 0; s < MAX_SLOTS; s++) {
                                if (labels[s]) {
                                    if (first) editState.selectedSlot = s;
                                    slotOptions.push({ label: `Slot ${s + 1}`, value: String(s), description: labels[s] || '', default: first });
                                    first = false;
                                }
                            }
                        }

                        const slotSelect = new ActionRowBuilder().addComponents(
                            new StringSelectMenuBuilder()
                                .setCustomId('slot_select')
                                .setPlaceholder('Select a slot')
                                .addOptions(slotOptions.length ? slotOptions : [{ label: 'No slots', value: 'none', description: 'No available slots', default: true, }])
                        );

                        const actionLabel = editState.selectedMode === 'add' ? 'Add' : (editState.selectedMode === 'remove' ? 'Remove' : 'Edit');
                        const actionRow = new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId('action_confirm').setLabel(actionLabel).setStyle(ButtonStyle.Success),
                            new ButtonBuilder().setCustomId('action_back').setLabel('Back').setStyle(ButtonStyle.Secondary)
                        );

                        // Build a fresh mode select row that reflects the currently chosen mode
                        const modeOptions = [
                            { label: 'Edit Checklist', value: 'edit', default: editState.selectedMode === 'edit' },
                            { label: 'Add Button', value: 'add', default: editState.selectedMode === 'add' },
                            { label: 'Remove Button', value: 'remove', default: editState.selectedMode === 'remove' }
                        ];
                        const newModeSelect = new ActionRowBuilder().addComponents(
                            new StringSelectMenuBuilder()
                                .setCustomId('mode_select')
                                .setPlaceholder('Select mode')
                                .addOptions(modeOptions)
                        );

                        const editEmbed = EmbedBuilder.from(i.message.embeds[0]);
                        await i.update({ embeds: [editEmbed], components: [newModeSelect, slotSelect, actionRow] });
                        return;
                    }

                    if (id === 'slot_select') {
                        const val = i.values[0];
                        if (val === 'none') editState.selectedSlot = null; else editState.selectedSlot = Number(val);
                        await i.deferUpdate();
                        return;
                    }

                    if (id === 'action_back') {
                        // Return to main checklist view
                        editState.mode = 'view';
                        const mainEmbed = buildEmbed();
                        const mainRows = buildRows();
                        await i.update({ embeds: [mainEmbed], components: [...mainRows, buildControlRow()] });
                        return;
                    }

                    if (id === 'action_confirm') {
                        // Confirm action depends on selectedMode
                        const mode = editState.selectedMode || 'edit';
                        const slot = editState.selectedSlot;
                        if (mode === 'edit') {
                            if (typeof slot !== 'number') { await i.deferUpdate(); return; }
                            // Show modal to edit label
                            const modal = new ModalBuilder().setCustomId(`edit_modal_${slot}`).setTitle(`Edit Slot ${slot + 1}`)
                                .addComponents(
                                    new ActionRowBuilder().addComponents(
                                        new TextInputBuilder().setCustomId('new_label').setLabel('Button label').setStyle(TextInputStyle.Short).setMaxLength(80).setMinLength(1).setPlaceholder('Enter new label (max 80 chars)')
                                    )
                                );
                            await i.showModal(modal);

                            try {
                                const filter = (m) => m.customId === `edit_modal_${slot}` && m.user.id === i.user.id;
                                const submitted = await i.awaitModalSubmit({ filter, time: 120000 });
                                const newLabel = submitted.fields.getTextInputValue('new_label').slice(0, 80);
                                labels[slot] = newLabel;
                                await submitted.deferUpdate();
                                // Update view embed listing slots
                                const editEmbed = EmbedBuilder.from(i.message.embeds[0]).setFields({ name: 'Slots', value: labels.map((l, idx) => `${idx + 1}. ${l || 'Use Add Button to Assign'}`).join('\n') });
                                await i.editReply({ embeds: [editEmbed], components: i.message.components });
                                // persist
                                try { await saveUserChecklist(interaction.user.id, labels, tasks); } catch (e) { console.error('Failed to save checklist after edit:', e); }
                            } catch (err) {
                                console.error('Modal submit error (edit):', err);
                            }
                            return;
                        } else if (mode === 'add') {
                            if (typeof slot !== 'number') { await i.deferUpdate(); return; }
                            // Modal to add label
                            const modal = new ModalBuilder().setCustomId(`add_modal_${slot}`).setTitle(`Add to Slot ${slot + 1}`)
                                .addComponents(
                                    new ActionRowBuilder().addComponents(
                                        new TextInputBuilder().setCustomId('new_label').setLabel('Button label').setStyle(TextInputStyle.Short).setMaxLength(80).setMinLength(1).setPlaceholder('Enter label (max 80 chars)')
                                    )
                                );
                            await i.showModal(modal);
                            try {
                                const filter = (m) => m.customId === `add_modal_${slot}` && m.user.id === i.user.id;
                                const submitted = await i.awaitModalSubmit({ filter, time: 120000 });
                                const newLabel = submitted.fields.getTextInputValue('new_label').slice(0, 80);
                                labels[slot] = newLabel;
                                await submitted.deferUpdate();
                                // Return to edit embed
                                const editEmbed = EmbedBuilder.from(i.message.embeds[0]).setFields({ name: 'Slots', value: labels.map((l, idx) => `${idx + 1}. ${l || 'Use Add Button to Assign'}`).join('\n') });
                                await i.editReply({ embeds: [editEmbed], components: i.message.components });
                                try { await saveUserChecklist(interaction.user.id, labels, tasks); } catch (e) { console.error('Failed to save checklist after add:', e); }
                            } catch (err) {
                                console.error('Modal submit error (add):', err);
                            }
                            return;
                        } else if (mode === 'remove') {
                            if (typeof slot !== 'number') { await i.deferUpdate(); return; }
                            labels[slot] = null;
                            tasks[slot] = false;
                            // Update embed listing
                            const editEmbed = EmbedBuilder.from(i.message.embeds[0]).setFields({ name: 'Slots', value: labels.map((l, idx) => `${idx + 1}. ${l || 'Use Add Button to Assign'}`).join('\n') });
                            await i.update({ embeds: [editEmbed], components: i.message.components });
                            try { await saveUserChecklist(interaction.user.id, labels, tasks); } catch (e) { console.error('Failed to save checklist after remove:', e); }
                            return;
                        }
                    }

                    // Toggle check buttons: pattern check_{idx}
                    if (id && id.startsWith('check_')) {
                        const idx = Number(id.split('_')[1]);
                        if (Number.isNaN(idx) || idx < 0 || idx >= tasks.length) { await i.deferUpdate(); return; }
                        if (!labels[idx]) { await i.deferUpdate(); return; }
                        tasks[idx] = !tasks[idx];
                        const newEmbed = buildEmbed();
                        const newRows = buildRows();
                        await i.update({ embeds: [newEmbed], components: [...newRows, buildControlRow()] });
                        // persist toggle
                        try { await saveUserChecklist(interaction.user.id, labels, tasks); } catch (e) { console.error('Failed to save checklist after toggle:', e); }
                        return;
                    }

                    // Unknown control: defer
                    await i.deferUpdate();
                } catch (err) {
                    console.error('Error handling checklist button:', err);
                }
            });

            collector.on('end', async (collected, reason) => {
                try {
                    // Disable all buttons when collector ends
                    const disabledRows = buildRows().map(row => {
                        row.components.forEach(c => c.setDisabled(true));
                        return row;
                    });
                    // Disable the control row as well
                    const disabledControl = buildControlRow();
                    disabledControl.components.forEach(c => c.setDisabled(true));

                    const finalEmbed = EmbedBuilder.from(buildEmbed())
                        .setFooter({ text: `Checklist closed (${reason || 'timeout'}).` });
                    await interaction.editReply({ embeds: [finalEmbed], components: [...disabledRows, disabledControl] });
                } catch (err) {
                    console.error('Error disabling checklist buttons on end:', err);
                }
            });

        } catch (err) {
            console.error('Error executing /checklist command:', err);
            try {
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({ content: 'There was an error showing the checklist.', ephemeral: true });
                } else {
                    await interaction.reply({ content: 'There was an error showing the checklist.', ephemeral: true });
                }
            } catch (e) {
                console.error('Failed to send error reply for /checklist:', e);
            }
        }
    }
};

// Export helper to customize default labels for checklist buttons.
module.exports.setDefaultLabels = function setDefaultLabels(labelsArray) {
    const nl = normalizeLabels(labelsArray);
    if (nl) DEFAULT_LABELS = nl;
};
