import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import type { CommandModule } from '../core/command-types';
import { summarizeUsageParityMetrics } from '@tmrxjd/platform/tools';
import { queryDailyCommandUsage, queryUsageEvents, type DailyCommandUsageRow } from '../services/analytics-db';
import { getBotConfig } from '../config/bot-config';

const analyticsConfig = getBotConfig().commands.analytics;

function buildUsageTable(rows: DailyCommandUsageRow[]): string {
  const dates = [...new Set(rows.map(row => row.date))].sort();
  const commands = [...new Set(rows.map(row => row.command_name))].sort();

  const dataMap: Record<string, Record<string, { total: number; unique: number }>> = {};
  for (const row of rows) {
    if (!dataMap[row.command_name]) {
      dataMap[row.command_name] = {};
    }
    dataMap[row.command_name][row.date] = {
      total: row.total_uses,
      unique: row.unique_users,
    };
  }

  let table = '```\n';
  table += analyticsConfig.table.commandHeader.padEnd(15) + '|';
  for (const date of dates) {
    const shortDate = new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    table += shortDate.padEnd(8) + '|';
  }
  table += `\n${'-'.repeat(15 + dates.length * 9)}\n`;

  for (const command of commands) {
    const displayName = command.length > 14 ? command.slice(0, 14) : command;
    table += displayName.padEnd(15) + '|';
    for (const date of dates) {
      const data = dataMap[command]?.[date];
      const cell = data ? `${data.total}/${data.unique}` : '0/0';
      table += cell.padEnd(8) + '|';
    }
    table += '\n';
  }

  table += '```';
  return table;
}

const data = new SlashCommandBuilder()
  .setName(analyticsConfig.name)
  .setDescription(analyticsConfig.description)
  .addIntegerOption(option =>
    option
      .setName(analyticsConfig.options.days.name)
      .setDescription(analyticsConfig.options.days.description)
      .setMinValue(analyticsConfig.options.days.min)
      .setMaxValue(analyticsConfig.options.days.max)
      .setRequired(false)
  );

export const analyticsCommand: CommandModule = {
  data: data.toJSON(),
  async execute(interaction) {
    if (!interaction.isChatInputCommand()) {
      return;
    }

    const days = interaction.options.getInteger(analyticsConfig.options.days.name) ?? 7;
    const [rows, events] = await Promise.all([
      queryDailyCommandUsage(days),
      queryUsageEvents(days),
    ]);

    if (rows.length === 0) {
      await interaction.reply({ content: analyticsConfig.noData, ephemeral: true });
      return;
    }

    const table = buildUsageTable(rows);
    const parity = summarizeUsageParityMetrics(events);
    const parityLines = [
      `Uses: ${parity.uses}`,
      `New uses: ${parity.newUses}`,
      `Unique uses: ${parity.uniqueUses}`,
      `Run tracker uploads: ${parity.runTrackerUploads}`,
      `Lifetime uploads: ${parity.lifetimeTrackerUploads}`,
      '',
    ].join('\n');

    const embed = new EmbedBuilder()
      .setTitle(`${analyticsConfig.titlePrefix}${days}${analyticsConfig.titleSuffix}`)
      .setDescription(`${parityLines}${table}`)
      .setColor(analyticsConfig.color)
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
