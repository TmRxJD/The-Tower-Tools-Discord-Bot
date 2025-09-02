const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

// Helper to create the tools embed (reused by slash command and message listener)
function createToolsEmbed() {
    const description = [
        "[**Assist Module Calc**](https://the-tower-run-tracker.com/tools/calculators/assist-module-cost)",
        "**Chart Finder** **/chart**",
        "[**Lab Calc**](https://the-tower-run-tracker.com/tools/lab-tracker) **/lab**",
        "[**Module Calc**](https://the-tower-run-tracker.com/tools/calculators/module-cost) **/module**",
        "[**Shard Splitter**](https://the-tower-run-tracker.com/tools/calculators/shard-splitter)",
        "[**Run Tracker**](https://the-tower-run-tracker.com/) **/track**",
        "[**Thorns Calc**](https://the-tower-run-tracker.com/tools/thorns-calculator) **/thorns**",
        "**Tournament Checklist** **/checklist**",
        "[**Ultimate Weapons Calc**](https://the-tower-run-tracker.com/tools/ultimate-weapons-tracker) **/stone**",
        "[**Uptime Calc**](https://the-tower-run-tracker.com/tools/calculators/uptime)",
        "[**Vault Tracker**](https://the-tower-run-tracker.com/tools/vault-tracker)",
        "[**Workshop Calcr**](http://localhost:5174/tools/calculators/workshop-calculator) **/workshop**",
    ].join('\n');

    return new EmbedBuilder()
        .setTitle("JD's Tools Hub")
        .setDescription(description)
        .setColor('#00bfff')
        .setFooter({ text: 'Use Creator Code "JDEVO" to support this project!\n\nTo use this command type !tools or /tools' });
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



// Register a simple message listener for '!tools' to send the same embed
module.exports.registerMessageListener = function registerMessageListener(client) {
    if (!client || typeof client.on !== 'function') return;
    client.on('messageCreate', async (message) => {
        try {
            if (!message || !message.content) return;
            if (message.author && message.author.bot) return;
            if (message.content.trim() === '!tools') {
                const embed = createToolsEmbed();
                await message.channel.send({ embeds: [embed] });
            }
        } catch (err) {
            console.error('Error in !tools message listener:', err);
        }
    });
};

