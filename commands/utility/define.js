const { SlashCommandBuilder } = require('discord.js');
const acronyms = require('../data/acronyms');

function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function titleCase(str) {
    return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
}

function quoteText(text) {
    if (!text) return '';
    return text.split(/\r?\n/).map(line => `> ${line}`).join('\n');
}

function expandAcronymsInText(text) {
    let changed = false;
    let out = text;
    for (const keyRaw of Object.keys(acronyms)) {
        const key = keyRaw; // preserve exact key (may contain punctuation/spaces)
        const replacement = titleCase(String(acronyms[keyRaw] || acronyms[keyRaw]));
        // Match the key when it's not surrounded by alphanumeric characters (prevents partial matches)
        // Use (^|[^A-Za-z0-9])(<key>)(?=$|[^A-Za-z0-9]) so we can preserve the prefix in replacement
        const escaped = escapeRegex(key);
        const re = new RegExp('(^|[^A-Za-z0-9])(' + escaped + ')(?=$|[^A-Za-z0-9])', 'gi');
        out = out.replace(re, (full, prefix, matched) => {
            changed = true;
            return (prefix || '') + `**${replacement}**`;
        });
    }
    return { text: out, changed };
}

module.exports = {
    category: 'utility',
    data: new SlashCommandBuilder()
        .setName('define')
        .setDescription("Auto-expand known acronyms")
        .addStringOption(option => option
            .setName('text')
            .setDescription('Text to convert acronyms in')
            .setRequired(false))
        .addBooleanOption(option => option
            .setName('public')
            .setDescription('If true, the response is visible to everyone (default: private)')
            .setRequired(false)),


    async execute(interaction) {
        let textOption = interaction.options.getString('text');
        let linkOption = interaction.options.getString('link');
        // allow the invoker to request a public response; default is ephemeral (private)
        const isPublic = interaction.options.getBoolean('public') ?? false;

        if (!textOption && !linkOption) {
            await interaction.reply({ content: 'Usage: provide either `text` or `link` (message link or ID).', ephemeral: true });
            return;
        }

        // normalize inputs
        if (textOption) textOption = textOption.trim();
        if (linkOption) linkOption = linkOption.trim().replace(/^<?\s*link:\s*/i, '').replace(/^<|>$/g, '').trim();
        const client = interaction.client;

        // Fetching arbitrary message content via message ID/link is disabled to avoid needing
        // the Message Content privileged intent. To define a specific message, use the
        // message context-menu command "Define Acronyms" (right-click a message -> Apps -> Define Acronyms),
        // or paste the text into the `text` option.
        if (linkOption) {
            await interaction.reply({ content: 'Fetching message content by link/ID is disabled. Use the message context menu "Define Acronyms" or provide the text directly in the `text` option.', ephemeral: true });
            return;
        }

        // If no linkOption, use textOption directly
        const source = textOption ?? '';
        const { text: expanded, changed } = expandAcronymsInText(source);

        // Do not allow public replies when no acronyms were found
        const allowPublic = isPublic && changed;
        const ephemeral = !allowPublic;
        await interaction.deferReply({ ephemeral });

        try {
            const quoted = quoteText(source);
            if (!changed) {
                const content = quoted ? `${quoted}\n\nNo known acronyms detected.` : 'No known acronyms detected.';
                await interaction.editReply({ content });
            } else {
                await interaction.editReply({ content: `${quoted}\n\n${expanded}` });
            }
        } catch (err) {
            console.error('Error replying to /define:', err);
            try {
                const followUpOpts = { content: 'There was an error processing your request.', ephemeral };
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(followUpOpts);
                } else {
                    await interaction.reply(followUpOpts);
                }
            } catch (e) {
                console.error('Failed to send fallback reply for /define:', e);
            }
        }
    }
};
