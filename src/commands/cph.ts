import { EmbedBuilder, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { CommandModule } from '../core/command-types';
import {
  formatNumberForDisplay,
  formatRateWithNotation,
  parseDurationToHours,
  parseResource,
} from '@tmrxjd/platform/math';
import { getBotConfig } from '../config/bot-config';
import { brandCommandEmbed } from '../services/command-embed-branding';

const cphConfig = getBotConfig().commands.cph;
const toolsHubConfig = getBotConfig().common.toolsHub;

type ResourceKind = 'coins' | 'cells' | 'dice';

const RESOURCE_META: Record<ResourceKind, { label: string; emoji: string }> = {
  coins: { label: 'Coins', emoji: '🪙' },
  cells: { label: 'Cells', emoji: '🔋' },
  dice: { label: 'Dice', emoji: '🎲' },
};

const data = new SlashCommandBuilder()
  .setName(cphConfig.name)
  .setDescription(cphConfig.description)
  .addStringOption(option =>
    option
      .setName(cphConfig.options.time.name)
      .setDescription(cphConfig.options.time.description)
      .setRequired(true)
  )
  .addStringOption(option =>
    option
      .setName(cphConfig.options.coins.name)
      .setDescription(cphConfig.options.coins.description)
      .setRequired(false)
  )
  .addStringOption(option =>
    option
      .setName(cphConfig.options.cells.name)
      .setDescription(cphConfig.options.cells.description)
      .setRequired(false)
  )
  .addStringOption(option =>
    option
      .setName(cphConfig.options.dice.name)
      .setDescription(cphConfig.options.dice.description)
      .setRequired(false)
  );

export const cphCommand: CommandModule = {
  data: data.toJSON(),
  async execute(interaction) {
    if (!interaction.isChatInputCommand()) {
      return;
    }

    const timeInput = interaction.options.getString(cphConfig.options.time.name, true);
    const coinsInput = interaction.options.getString(cphConfig.options.coins.name);
    const cellsInput = interaction.options.getString(cphConfig.options.cells.name);
    const diceInput = interaction.options.getString(cphConfig.options.dice.name);

    const totalHours = parseDurationToHours(timeInput);
    if (totalHours <= 0) {
      await interaction.reply({ content: cphConfig.invalidTime, ephemeral: true });
      return;
    }

    if (!coinsInput && !cellsInput && !diceInput) {
      await interaction.reply({ content: cphConfig.missingResources, ephemeral: true });
      return;
    }

    const fields: Array<{ name: string; value: string; inline: true }> = [];
    const invalid: string[] = [];

    if (coinsInput) {
      const parsedCoins = parseResource(coinsInput);
      if (!parsedCoins.value) {
        invalid.push(RESOURCE_META.coins.label);
      } else {
        fields.push({
          name: `${RESOURCE_META.coins.emoji} ${RESOURCE_META.coins.label}`,
          value: `**Total:** ${formatNumberForDisplay(parsedCoins.value)}\n**Per hour:** ${formatRateWithNotation(parsedCoins.value, totalHours)}/hr`,
          inline: true,
        });
      }
    }

    if (cellsInput) {
      const parsedCells = parseResource(cellsInput);
      if (!parsedCells.value) {
        invalid.push(RESOURCE_META.cells.label);
      } else {
        fields.push({
          name: `${RESOURCE_META.cells.emoji} ${RESOURCE_META.cells.label}`,
          value: `**Total:** ${formatNumberForDisplay(parsedCells.value)}\n**Per hour:** ${formatRateWithNotation(parsedCells.value, totalHours)}/hr`,
          inline: true,
        });
      }
    }

    if (diceInput) {
      const parsedDice = parseResource(diceInput);
      if (!parsedDice.value) {
        invalid.push(RESOURCE_META.dice.label);
      } else {
        fields.push({
          name: `${RESOURCE_META.dice.emoji} ${RESOURCE_META.dice.label}`,
          value: `**Total:** ${formatNumberForDisplay(parsedDice.value)}\n**Per hour:** ${formatRateWithNotation(parsedDice.value, totalHours)}/hr`,
          inline: true,
        });
      }
    }

    if (invalid.length > 0) {
      await interaction.reply({
        content: `${cphConfig.invalidAmountsPrefix}${invalid.join(', ')}${cphConfig.invalidAmountsHint}`,
        ephemeral: true,
      });
      return;
    }

    const embed = brandCommandEmbed(
      new EmbedBuilder()
        .setTitle('CPH Calculator')
        .setDescription(`Game Time: **${timeInput}**`)
        .setColor(toolsHubConfig.embedColor)
        .addFields(fields),
      cphConfig.name,
    );

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
