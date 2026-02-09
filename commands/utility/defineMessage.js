const { ContextMenuCommandBuilder, ApplicationCommandType } = require('discord.js');

function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function titleCase(str) {
    return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
}

function expandAcronymsInText(text) {
    let changed = false;
    let out = text;
    // lazy-load acronyms to avoid circular requires
    const acronyms = require('../data/acronyms');
    const caseSensitiveKeys = new Set(['is', 'as']);
    // iterate longer keys first to avoid partial matches (e.g. 'uw+' vs 'uw')
    const keys = Object.keys(acronyms).sort((a, b) => b.length - a.length);

    // Use placeholders so inserted replacement text isn't subject to later replacements
    const placeholders = [];
    for (const keyRaw of keys) {
        const key = keyRaw;
        const replacement = String(acronyms[keyRaw] || acronyms[keyRaw]);
        const isCaseSensitive = caseSensitiveKeys.has(keyRaw.toLowerCase());
        const matchKey = isCaseSensitive ? keyRaw.toUpperCase() : key;
        const escaped = escapeRegex(matchKey);
        const flags = isCaseSensitive ? 'g' : 'gi';
        const re = new RegExp('(^|[^A-Za-z0-9])(' + escaped + ')(?=$|[^A-Za-z0-9])', flags);
        const placeholder = `\u0001${placeholders.length}\u0001`;
        placeholders.push(replacement);
        out = out.replace(re, (full, prefix, matched) => {
            changed = true;
            return (prefix || '') + placeholder;
        });
    }

    // restore placeholders with the final replacement text (preserve exact map text)
    if (placeholders.length) {
        for (let i = 0; i < placeholders.length; i++) {
            const ph = `\u0001${i}\u0001`;
            // replace all occurrences of the placeholder with the bolded replacement
            out = out.split(ph).join(`**${placeholders[i]}**`);
        }
    }
    return { text: out, changed };
}

function quoteText(text) {
    if (!text) return '';
    return text.split(/\r?\n/).map(line => `> ${line}`).join('\n');
}

module.exports = {
    category: 'utility',
    data: new ContextMenuCommandBuilder()
        .setName('Define Acronyms')
        .setType(ApplicationCommandType.Message),

    async execute(interaction) {
        try {
            // `targetMessage` contains the original message when used as a message context menu
            const msg = interaction.targetMessage;
            const source = msg?.content ?? '';
            const { text: expanded, changed } = expandAcronymsInText(source);
            const quoted = quoteText(source);
            if (!changed) {
                await interaction.reply({ content: quoted, ephemeral: true });
            } else {
                await interaction.reply({ content: `${quoted}\n\n${expanded}`, ephemeral: true });
            }
        } catch (err) {
            console.error('Error in Define Acronyms (context menu):', err);
            try {
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({ content: 'There was an error processing the message.', ephemeral: true });
                } else {
                    await interaction.reply({ content: 'There was an error processing the message.', ephemeral: true });
                }
            } catch (e) {
                console.error('Failed to send fallback reply for define context menu:', e);
            }
        }
    }
};
