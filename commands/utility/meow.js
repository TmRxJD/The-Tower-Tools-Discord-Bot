const { SlashCommandBuilder } = require('discord.js');

const STRETCHY_SETS = [
    ['cat_stretchy_top', 'cat_stretchy_mid', 'cat_stretchy_bottom'],
    ['cat_stetchy_top', 'cat_stetchy_mid', 'cat_stetchy_bottom'],
];

// Track per-user usage to enforce both burst and per-minute caps.
const usageLog = new Map();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('meow')
        .setDescription('Send a random cat emoji'),
    cooldown: 0,

    async execute(interaction) {
        const now = Date.now();
        const perUser = usageLog.get(interaction.user.id)?.filter(ts => now - ts <= 60_000) ?? [];

        const lastTs = perUser.at(-1);
        if (lastTs && now - lastTs < 10_000) {
            const waitSeconds = Math.ceil((10_000 - (now - lastTs)) / 1000);
            await interaction.reply({ content: `Slow down, one meow every 10s. Try again in ${waitSeconds}s.`, ephemeral: true });
            return;
        }

        if (perUser.length >= 3) {
            const resetMs = 60_000 - (now - perUser[0]);
            const waitSeconds = Math.ceil(resetMs / 1000);
            await interaction.reply({ content: `Too many meows. Limit is 3 per minute. Try again in ${waitSeconds}s.`, ephemeral: true });
            return;
        }

        perUser.push(now);
        usageLog.set(interaction.user.id, perUser);

        let appEmojis;
        try {
            appEmojis = await interaction.client.application?.emojis.fetch();
        } catch (err) {
            console.error('Failed to fetch application emojis for /meow', err);
            await interaction.reply({ content: 'I could not fetch cat emojis right now. Try again in a moment.', ephemeral: true });
            return;
        }

        const catEmojis = Array.from(appEmojis?.values?.() ?? []).filter(emoji => emoji.name?.startsWith('cat_'));
        const stretchyGroup = STRETCHY_SETS.find(set => set.every(name => catEmojis.some(emoji => emoji.name === name)));
        const regularCats = catEmojis.filter(emoji => !(stretchyGroup || []).includes(emoji.name));

        const pool = [...regularCats];
        if (stretchyGroup) pool.push('STRETCHY_SET');

        if (pool.length === 0) {
            await interaction.reply({ content: 'No cat emojis found. Add some cat_ emojis to the application emoji list.', ephemeral: true });
            return;
        }

        const choice = pool[Math.floor(Math.random() * pool.length)];

        if (choice === 'STRETCHY_SET') {
            const stretchyLines = stretchyGroup
                .map(name => catEmojis.find(emoji => emoji.name === name))
                .filter(Boolean)
                .map(emoji => emoji.toString())
                .join('\n');
            await interaction.reply(stretchyLines);
            return;
        }

        await interaction.reply({ content: choice.toString() });
    },
};
