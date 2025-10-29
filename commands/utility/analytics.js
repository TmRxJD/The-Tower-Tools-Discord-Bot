const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const Database = require('better-sqlite3');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('analytics')
		.setDescription('View command usage analytics for the last 7 days')
		.addIntegerOption(option =>
			option.setName('days')
				.setDescription('Number of days to look back (default: 7)')
				.setMinValue(1)
				.setMaxValue(30)),

	async execute(interaction) {
		const days = interaction.options.getInteger('days') || 7;

		const analyticsDb = new Database('./analytics.db');

		// Get data for the last N days
		const query = `
			SELECT
				DATE(timestamp) as date,
				command_name,
				COUNT(*) as total_uses,
				COUNT(DISTINCT user_id) as unique_users
			FROM command_usage
			WHERE timestamp >= datetime('now', '-${days} days')
			GROUP BY DATE(timestamp), command_name
			ORDER BY DATE(timestamp) DESC, command_name
		`;

		const rows = analyticsDb.prepare(query).all();

		if (rows.length === 0) {
			analyticsDb.close();
			return interaction.reply('No usage data found for the specified period.');
		}

		// Process data for table
		const dates = [...new Set(rows.map(r => r.date))].sort();
		const commands = [...new Set(rows.map(r => r.command_name))].sort();

		// Create data map for easy lookup
		const dataMap = {};
		rows.forEach(row => {
			if (!dataMap[row.command_name]) {
				dataMap[row.command_name] = {};
			}
			dataMap[row.command_name][row.date] = {
				total: row.total_uses,
				unique: row.unique_users
			};
		});

		// Build table
		let table = '```\n';
		// Header row
		table += 'Command'.padEnd(15) + '|';
		dates.forEach(date => {
			const shortDate = new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
			table += shortDate.padEnd(8) + '|';
		});
		table += '\n' + '-'.repeat(15 + dates.length * 9) + '\n';

		// Data rows
		commands.forEach(command => {
			const displayName = command.length > 14 ? command.substring(0, 14) : command;
			table += displayName.padEnd(15) + '|';
			dates.forEach(date => {
				const data = dataMap[command]?.[date];
				const cell = data ? `${data.total}/${data.unique}` : '0/0';
				table += cell.padEnd(8) + '|';
			});
			table += '\n';
		});
		table += '```';

		analyticsDb.close();

		const embed = new EmbedBuilder()
			.setTitle(`Command Usage Analytics (Last ${days} Days)`)
			.setDescription(table)
			.setColor(0x0099FF)
			.setTimestamp();

		await interaction.reply({ embeds: [embed] });
	},
};