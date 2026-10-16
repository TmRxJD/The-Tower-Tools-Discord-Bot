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
const CREATOR_SERVER_ID_INPUT_ID = 'creator_server_id';
const CREATOR_SERVER_ID_CHECK = '1509606869336068347';
const CREATOR_CODE_MAX_LENGTH = 30;
const MENTION_PATTERN = /<(?:@[!&]?|#)\d+>|@(?:everyone|here)\b/iu;
const BARE_LINK_PATTERN = /(^|[\s|(])((?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s|)]*)?)(?=$|[\s|)])/giu;
type CreatorEntry = { id: string; code: string; known: string };

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

export function getMaxKnownLength(entries: readonly CreatorEntry[]): number {
  return entries.reduce((max, entry) => Math.max(max, entry.known.length), 1);
}

/** Collapses line breaks and turns bare domains into full links so Discord renders them as links. */
export function normalizeCreatorKnown(known: string): string {
  return known
    .replace(/\s*[\r\n]+\s*/gu, ' ')
    .trim()
    .replace(BARE_LINK_PATTERN, (_match, lead: string, link: string) => `${lead}https://${link}`);
}

export function isValidCreatorSubmission(code: string, known: string, maxKnownLength: number): boolean {
  return code.length > 0 && code.length <= CREATOR_CODE_MAX_LENGTH
    && known.length > 0 && known.length <= maxKnownLength
    && !/[\r\n]/u.test(code)
    && !MENTION_PATTERN.test(code) && !MENTION_PATTERN.test(known);
}

export const creatorCommand: CommandModule = {
  data: data.toJSON(),
  skipAppwriteIdentityResolution: true,
  async execute(interaction: ChatInputCommandInteraction) {
    if (interaction.options.getSubcommand(false) === 'add') {
      const maxKnownLength = getMaxKnownLength(await loadCreatorEntries());
      const modal = new ModalBuilder()
        .setTitle('Add your creator code')
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder()
            .setCustomId(CREATOR_CODE_ID).setLabel('Creator code').setStyle(TextInputStyle.Short)
            .setMaxLength(CREATOR_CODE_MAX_LENGTH).setRequired(true)),
          new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder()
            .setCustomId(CREATOR_KNOWN_ID).setLabel('What are you known for?').setStyle(TextInputStyle.Paragraph)
            .setMaxLength(maxKnownLength).setRequired(true)),
          new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder()
            .setCustomId(CREATOR_SERVER_ID_INPUT_ID).setLabel('The Tower Network Discord ServerID').setStyle(TextInputStyle.Short)
            .setMaxLength(32).setRequired(true)),
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
      const known = normalizeCreatorKnown(submitted.fields.getTextInputValue(CREATOR_KNOWN_ID));
      const serverId = submitted.fields.getTextInputValue(CREATOR_SERVER_ID_INPUT_ID).trim();
      if (!isValidCreatorSubmission(code, known, maxKnownLength)) {
        await submitted.reply({
          content: `Enter a code (up to ${CREATOR_CODE_MAX_LENGTH} characters) and a description (up to ${maxKnownLength} characters once links are expanded to https://). Mentions are not allowed.`,
          ephemeral: true,
        });
        return;
      }

      if (serverId !== CREATOR_SERVER_ID_CHECK) {
        await submitted.reply({
          content: 'The server ID did not match. Check the final field and try again.',
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
