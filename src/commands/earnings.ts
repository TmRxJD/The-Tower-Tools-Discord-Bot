import { SlashCommandBuilder } from 'discord.js';
import { formatMoney, parseCsvText, summarizeEarnings } from '../services/earnings-analyzer';
import { getBotConfig } from '../config/bot-config';
import { createChatInputCommand } from '../core/command-factory';
import { createCommandEmbed } from '../core/command-ui';

const earningsConfig = getBotConfig().commands.earnings;

const data = new SlashCommandBuilder()
  .setName(earningsConfig.name)
  .setDescription(earningsConfig.description)
  .addAttachmentOption(option =>
    option
      .setName(earningsConfig.options.csvFile.name)
      .setDescription(earningsConfig.options.csvFile.description)
      .setRequired(true)
  );

async function fetchAttachmentText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Fetch failed with status ${response.status}`);
  }
  return response.text();
}

function toTableLines(rows: Array<{ name: string; sales: number; revenue: number }>): string {
  if (rows.length === 0) {
    return earningsConfig.noData;
  }
  return rows.map(row => `${row.name}: ${row.sales} sales · ${formatMoney(row.revenue)}`).join('\n');
}

export const earningsCommand = createChatInputCommand(
  data,
  async interaction => {
    const attachment = interaction.options.getAttachment(earningsConfig.options.csvFile.name, true);
    const fileName = attachment.name?.toLowerCase() ?? '';
    if (!fileName.endsWith('.csv')) {
      await interaction.reply({
        content: earningsConfig.invalidFile,
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const csvText = await fetchAttachmentText(attachment.url);
      const rows = parseCsvText(csvText);

      if (rows.length === 0) {
        await interaction.editReply({ content: earningsConfig.emptyRows });
        return;
      }

      const summary = summarizeEarnings(rows);

      const topProducts = toTableLines(
        summary.topProducts.map(item => ({ name: item.product, sales: item.sales, revenue: item.revenue }))
      );
      const platforms = toTableLines(
        summary.platformRevenue.slice(0, 5).map(item => ({ name: item.platform, sales: item.sales, revenue: item.revenue }))
      );
      const statuses = toTableLines(
        summary.statusRevenue.slice(0, 5).map(item => ({ name: item.status, sales: item.sales, revenue: item.revenue }))
      );

      const embed = createCommandEmbed({
        title: earningsConfig.title,
        description: earningsConfig.summaryDescription,
        color: earningsConfig.color,
        fields: [
          {
            name: earningsConfig.totalsField,
            value: [
              `${earningsConfig.totalsRevenueLabel}: ${formatMoney(summary.totalRevenue)}`,
              `${earningsConfig.totalsSalesLabel}: ${summary.totalSales}`,
              `${earningsConfig.totalsAvgRevenueLabel}: ${formatMoney(summary.averageRevenuePerSale)}`,
            ].join('\n'),
            inline: false,
          },
          {
            name: earningsConfig.dateRangeField,
            value: summary.dateSpan.min && summary.dateSpan.max
              ? `${summary.dateSpan.min} → ${summary.dateSpan.max}`
              : earningsConfig.unknownDateRange,
            inline: false,
          },
          { name: earningsConfig.topProductsField, value: topProducts, inline: false },
          { name: earningsConfig.topPlatformsField, value: platforms, inline: false },
          { name: earningsConfig.topStatusesField, value: statuses, inline: false },
        ],
      });

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      await interaction.editReply({
        content: `${earningsConfig.processErrorPrefix}${(error as Error)?.message ?? earningsConfig.processUnknownError}`,
      });
    }
  },
);
