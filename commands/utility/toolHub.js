const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

// Helper to create the tools embed (reused by slash command and message listener)
function createToolsEmbed() {
    const description = [
        "Click [**blue links**](https://the-tower-run-tracker.com/tools) to open the tools in your browser.",
        "Type **/commands** into chat to use them in Discord.",
        "",
        "**     Calculators:**",
        "[**Bots**](https://the-tower-run-tracker.com/calculators/bots)",
        "CPH **/cph**",
        "[**Damage Reduction**](https://the-tower-run-tracker.com/calculators/damage-reduction)",
        "[**Guardians**](https://the-tower-run-tracker.com/calculators/guardians)",
        "[**Labs**](https://the-tower-run-tracker.com/calculators/labs) **/lab**",
        "[**Modules**](https://the-tower-run-tracker.com/calculators/modules) **/module**",        
        "[**Shard Splitter**](https://the-tower-run-tracker.com/calculators/shard-splitter)",
        "[**Thorns**](https://the-tower-run-tracker.com/calculators/thorns) **/thorns**",        
        "[**Ultimate Weapons**](https://the-tower-run-tracker.com/calculators/uw) **/stone**",
        "[**Uptime**](https://the-tower-run-tracker.com/calculators/uptime)",        
        "[**Workshop**](http://the-tower-run-tracker.com/calculators/workshop) **/workshop**",
        "",
        "**     Trackers:**",
        "[**Battle Report**](https://the-tower-run-tracker.com/) **/track**",
        "[**Cards**](https://the-tower-run-tracker.com/trackers/cards)",
        "[**Labs**](https://the-tower-run-tracker.com/trackers/labs)",
        "[**Lifetime Stats**](https://the-tower-run-tracker.com/trackers/lifetime)",
        "[**Modules**](https://the-tower-run-tracker.com/trackers/modules)",        
        "[**Ultimate Weapons**](https://the-tower-run-tracker.com/trackers/uw)",
        "[**Vault**](https://the-tower-run-tracker.com/trackers/vault)",        "",
        "**     Other Tools:**",
        "Chart Finder **/chart**",
        "Define Acronyms **/define**",
        "Tournament Checklist **/checklist**"
    ].join('\n');

    return new EmbedBuilder()
        .setTitle("JD's Tools Hub")
        .setDescription(description)
        .setColor('#00bfff')
        .setFooter({ text: 'To use this command type /tools' })
        .setURL('https://the-tower-run-tracker.com/tools');
}

module.exports = {
    category: 'utility',
    data: new SlashCommandBuilder()
        .setName('tools')
        .setDescription('Open the tools hub'),

    async execute(interaction) {
        try {
            const embed = createToolsEmbed();
            await interaction.reply({ embeds: [embed], ephemeral: false });
        } catch (err) {
            console.error('Error executing /tools command:', err);
            try {
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({ content: 'There was an error showing the tools hub.', ephemeral: true });
                } else {
                    await interaction.reply({ content: 'There was an error showing the tools hub.', ephemeral: true });
                }
            } catch (e) {
                console.error('Failed to send error reply for /tools:', e);
            }
        }
    }
};
