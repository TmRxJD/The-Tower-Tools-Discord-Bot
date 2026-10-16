import {
  ActionRowBuilder,
  EmbedBuilder,
  ModalBuilder,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { CommandModule } from '../core/command-types';
import { getBotConfig } from '../config/bot-config';
import { formatCreatorEntriesDescription, sortCreatorEntriesByCode } from '@tmrxjd/platform/tools';
import { getToolsBotKv, setToolsBotKv } from '../services/idb';
import { showModalAndAwaitSubmit } from '../services/modal-submit';

const creatorConfig = getBotConfig().commands.creator;
const CREATOR_LIST_KEY = 'creatorEntries';
const CREATOR_MODAL_ID = 'creator_add_modal';
const CREATOR_CODE_ID = 'creator_code';
const CREATOR_KNOWN_ID = 'creator_known_for';
type CreatorEntry = (typeof creatorConfig.creators)[number];

const data = new SlashCommandBuilder()
  .setName(creatorConfig.name)
  .setDescription(creatorConfig.description)
  .addSubcommand(subcommand => subcommand
    .setName('add')
    .setDescription('Add your creator code to the list'))
  .addSubcommand(subcommand => subcommand
    .setName('list')
    .setDescription('Show known creators and their codes'));

async function loadCreatorEntries(): Promise<CreatorEntry[]> {
  const stored = await getToolsBotKv<CreatorEntry[]>(CREATOR_LIST_KEY);
  return [...creatorConfig.creators, ...(stored ?? [])];
}

export function isValidCreatorSubmission(code: string, known: string): boolean {
  return code.trim().length > 0 && code.length <= 100 && known.trim().length > 0 && known.length <= 300
    && !/[\n\r@]/u.test(code) && !/[\n\r@]/u.test(known);
}

export const creatorCommand: CommandModule = {
  data: data.toJSON(),
  async execute(interaction: ChatInputCommandInteraction) {
    if (interaction.options.getSubcommand(false) === 'add') {
      const modal = new ModalBuilder()
        .setTitle('Add your creator code')
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder()
            .setCustomId(CREATOR_CODE_ID).setLabel('Creator code').setStyle(TextInputStyle.Short)
            .setMaxLength(100).setRequired(true)),
          new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder()
            .setCustomId(CREATOR_KNOWN_ID).setLabel('What are you known for?').setStyle(TextInputStyle.Paragraph)
            .setMaxLength(300).setRequired(true)),
        );
      const submitted = await showModalAndAwaitSubmit({
        componentInteraction: interaction,
        modal,
        baseCustomId: CREATOR_MODAL_ID,
        userId: interaction.user.id,
        timeoutMs: 120_000,
      });
      if (!submitted) return;

      const code = submitted.fields.getTextInputValue(CREATOR_CODE_ID).trim();
      const known = submitted.fields.getTextInputValue(CREATOR_KNOWN_ID).trim();
      if (!isValidCreatorSubmission(code, known)) {
        await submitted.reply({
          content: 'Enter a code (up to 100 characters) and a description (up to 300 characters). Mentions are not allowed.',
          ephemeral: true,
        });
        return;
      }

      const entries = await loadCreatorEntries();
      if (entries.some(entry => entry.id === interaction.user.id || entry.code.toLowerCase() === code.toLowerCase())) {
        await submitted.reply({
          content: 'You or that creator code is already on the list. Contact a moderator if it needs updating.',
          ephemeral: true,
        });
        return;
      }

      const stored = await getToolsBotKv<CreatorEntry[]>(CREATOR_LIST_KEY) ?? [];
      await setToolsBotKv(CREATOR_LIST_KEY, [...stored, { id: interaction.user.id, code, known }]);
      await submitted.reply({ content: 'Your creator code has been added to the list.', ephemeral: true });
      return;
    }

    const sortedCreators = sortCreatorEntriesByCode(await loadCreatorEntries());
    const description = formatCreatorEntriesDescription(sortedCreators, creatorConfig.knownForPrefix);

    const embed = new EmbedBuilder()
      .setTitle(creatorConfig.title)
      .setDescription(description)
      .setColor(creatorConfig.color)
      .setFooter({ text: creatorConfig.footer });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
