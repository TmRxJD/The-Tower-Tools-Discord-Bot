const { Events, MessageFlags } = require('discord.js');
const reminderService = require('../commands/services/reminderService');

module.exports = {
	name: Events.InteractionCreate,
	async execute(interaction) {
		// Handle button/select interactions (components)
		if (interaction.isMessageComponent()) {
			// handle stop reminder buttons sent in DMs
			if (interaction.customId && interaction.customId.startsWith('stop_reminder_')) {
				await reminderService.handleStopReminderInteraction(interaction);
				return;
			}
			// other component interactions are handled by command collectors where needed
			return;
		}

		// Handle both chat input (slash) commands and context menu commands
		if (!interaction.isChatInputCommand() && !interaction.isContextMenuCommand()) return;

		const command = interaction.client.commands.get(interaction.commandName);

		if (!command) {
			console.error(`No command matching ${interaction.commandName} was found.`);
			return;
		}

		try {
			await command.execute(interaction);
		} catch (error) {
			console.error(error);
			if (interaction.replied || interaction.deferred) {
				await interaction.followUp({ content: 'There was an error while executing this command!', flags: MessageFlags.Ephemeral });
			} else {
				await interaction.reply({ content: 'There was an error while executing this command!', flags: MessageFlags.Ephemeral });
			}
		}
	},
};