const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const creators = [
    { id: '393181619911131146', code: '1410c', known: 'Moderating | Sheets & Tools' },
    { id: '398318678673719296', code: 'cruoton', known: 'Moderating | Extensive Game Knowledge | Mentoring' },
    { id: '349704551391297549', code: 'icetae', known: 'Moderating | TDC co-founder' },
    { id: '371914184822095873', code: 'jdevo', known: 'Moderating | https://the-tower-run-tracker.com/ | Discord Bots | Server Events' },
    { id: '204350672714465280', code: 'sheetlord', known: 'Moderating | https://discord.com/channels/850137217828388904/1379468947685904404/1379470428912746506' },
    { id: '92034793302138880',  code: 'VCMomo', known: 'Moderating' },
    { id: '480857237380923393', code: 'nickavii', known: 'Moderating' },
    { id: '96626874708430848',  code: 'PogTheMightyOne', known: 'Moderating | Discord Bots' },
    { id: '197431930877116416', code: 'duckirons', known: 'Moderating' },
    { id: '169201175231463424', code: 'TheDisasterFish', known: 'Moderating | thetower.lol | Discord Bots' },
    { id: '138163202516058112', code: 'crowrocks', known: 'https://www.youtube.com/@crowbarzero' },
    { id: '121649684384055299', code: 'Darknyxzz', known: 'Moderating | Sheets' },
    { id: '200927253809332224', code: 'Iver', known: 'Moderating' },
    { id: '530860087384735775', code: 'jplays', known: 'https://www.youtube.com/@JPlays1 | https://the-tower.notion.site/' },
    { id: '280723745864286208', code: 'Milamber33', known: 'Moderating' },
    { id: '150761026718007296', code: 'NanaSeiYuri', known: 'Moderating | Making Sheets & Infografics' },
    { id: '211865455697068032', code: 'ronmv', known: 'Moderating' },
    { id: '164886229328855040', code: 'Shion', known: 'Moderating' },
    { id: '767167088485335041', code: '300', known: 'https://www.youtube.com/@SpartanTheTower' },
    { id: '928167650352300092', code: 'Zaerdin', known: 'https://www.youtube.com/@ZaerdinGaming' }
];

module.exports = {
    category: 'utility',
    data: new SlashCommandBuilder()
        .setName('creator')
        .setDescription('List known creators and their codes'),

    async execute(interaction) {
        try {
            const description = creators.map(c => `**<@${c.id}>** — **${c.code}**\nKnown for: ${c.known}`).join('\n\n');

            const embed = new EmbedBuilder()
                .setTitle("Known Creators & Codes")
                .setDescription(description)
                .setColor('#00bfff')
                .setFooter({ text: 'If a creator is missing or needs updating, contact a moderator.' });

            await interaction.reply({ embeds: [embed], ephemeral: true });
        } catch (err) {
            console.error('Error executing /creator:', err);
            try {
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({ content: 'There was an error showing the creators list.', ephemeral: true });
                } else {
                    await interaction.reply({ content: 'There was an error showing the creators list.', ephemeral: true });
                }
            } catch (e) {
                console.error('Failed to send error reply for /creator:', e);
            }
        }
    }
};
