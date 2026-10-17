import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  EmbedBuilder,
  ModalBuilder,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { CommandModule } from '../core/command-types';
import { getBotConfig } from '../config/bot-config';
import { sortCreatorEntriesByCode } from '@tmrxjd/platform/tools';
import type { ToolsBotClient } from '../core/tools-bot-client';
import { getCreatorPageBudget, paginateCreatorEntries } from '../features/creator/creator-pages';
import { getToolsBotKv, setToolsBotKv } from '../services/idb';
import { showModalAndAwaitSubmit } from '../services/modal-submit';

const creatorConfig = getBotConfig().commands.creator;
const CREATOR_LIST_KEY = 'creatorEntries';
const CREATOR_PAGE_PREV_ID = 'creator_page_prev';
const CREATOR_PAGE_NEXT_ID = 'creator_page_next';
const CREATOR_MODAL_ID = 'creator_add_modal';
const CREATOR_CODE_ID = 'creator_code';
const CREATOR_KNOWN_ID = 'creator_known_for';
const CREATOR_SERVER_ID_INPUT_ID = 'creator_server_id';
const CREATOR_SERVER_ID_CHECK = '1509606869336068347';
const CREATOR_PAGE_TIMEOUT_MS = 5 * 60 * 1000;
const CREATOR_CODE_MAX_LENGTH = 30;
const MENTION_PATTERN = /<(?:@[!&]?|#)\d+>|@(?:everyone|here)\b/iu;
const BARE_LINK_PATTERN = /(^|[\s|(])((?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s|)]*)?)(?=$|[\s|)])/giu;
type CreatorEntry = { id: string; code: string; known: string };

const data = new SlashCommandBuilder()
  .setName(creatorConfig.name)
  .setDescription(creatorConfig.description)
  .addSubcommand(subcommand => subcommand
    .setName('add')
    .setDescription('Add your creator code, or update your existing entry'))
  .addSubcommand(subcommand => subcommand
    .setName('list')
    .setDescription('Show known creators and their codes'));

/** Stored entries override built-in ones for the same user, which is how listed creators update themselves. */
export function mergeCreatorEntries(base: readonly CreatorEntry[], stored: readonly CreatorEntry[]): CreatorEntry[] {
  const overridden = new Set(stored.map(entry => entry.id));
  return [...base.filter(entry => !overridden.has(entry.id)), ...stored];
}

async function loadCreatorEntries(): Promise<CreatorEntry[]> {
  const stored = await getToolsBotKv<CreatorEntry[]>(CREATOR_LIST_KEY);
  return mergeCreatorEntries(creatorConfig.creators, stored ?? []);
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
      const currentEntries = await loadCreatorEntries();
      const maxKnownLength = getMaxKnownLength(currentEntries);
      const existing = currentEntries.find(entry => entry.id === interaction.user.id);
      const codeInput = new TextInputBuilder()
        .setCustomId(CREATOR_CODE_ID).setLabel('Creator code').setStyle(TextInputStyle.Short)
        .setMaxLength(CREATOR_CODE_MAX_LENGTH).setRequired(true);
      const knownInput = new TextInputBuilder()
        .setCustomId(CREATOR_KNOWN_ID).setLabel('What are you known for?').setStyle(TextInputStyle.Paragraph)
        .setMaxLength(maxKnownLength).setRequired(true);
      if (existing) {
        codeInput.setValue(existing.code.slice(0, CREATOR_CODE_MAX_LENGTH));
        knownInput.setValue(existing.known.slice(0, maxKnownLength));
      }
      const modal = new ModalBuilder()
        .setTitle(existing ? 'Update your creator code' : 'Add your creator code')
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(codeInput),
          new ActionRowBuilder<TextInputBuilder>().addComponents(knownInput),
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
      if (entries.some(entry => entry.id !== interaction.user.id && entry.code.toLowerCase() === code.toLowerCase())) {
        await submitted.reply({
          content: 'That creator code is already used by someone else. Contact a moderator if it needs correcting.',
          ephemeral: true,
        });
        return;
      }

      const current = entries.find(entry => entry.id === interaction.user.id);
      if (current && current.code === code && current.known === known) {
        await submitted.reply({ content: 'Your entry is already up to date.', ephemeral: true });
        return;
      }

      const stored = await getToolsBotKv<CreatorEntry[]>(CREATOR_LIST_KEY) ?? [];
      const entry = { id: interaction.user.id, code, known };
      await setToolsBotKv(CREATOR_LIST_KEY, current
        ? [...stored.filter(item => item.id !== interaction.user.id), entry]
        : [...stored, entry]);
      await submitted.reply({
        content: current ? 'Your creator entry has been updated.' : 'Your creator code has been added to the list.',
        ephemeral: true,
      });
      return;
    }

    const sortedCreators = sortCreatorEntriesByCode(await loadCreatorEntries());
    const budget = getCreatorPageBudget(creatorConfig.title.length, creatorConfig.footer.length);
    const pages = paginateCreatorEntries(sortedCreators, creatorConfig.knownForPrefix, budget);

    const buildEmbed = (page: number) => new EmbedBuilder()
      .setTitle(creatorConfig.title)
      .setDescription(pages[page])
      .setColor(creatorConfig.color)
      .setFooter({ text: pages.length > 1 ? `${creatorConfig.footer} • Page ${page + 1}/${pages.length}` : creatorConfig.footer });

    if (pages.length === 1) {
      await interaction.reply({ embeds: [buildEmbed(0)], ephemeral: true });
      return;
    }

    const prevId = `${CREATOR_PAGE_PREV_ID}:${interaction.id}`;
    const nextId = `${CREATOR_PAGE_NEXT_ID}:${interaction.id}`;
    const buildRow = (page: number, disabled = false) => new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(prevId).setLabel('Previous').setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled || page === 0),
      new ButtonBuilder().setCustomId(nextId).setLabel('Next').setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled || page === pages.length - 1),
    );

    let page = 0;
    await interaction.reply({ embeds: [buildEmbed(page)], components: [buildRow(page)], ephemeral: true });
    const reply = await interaction.fetchReply();

    const client = interaction.client as ToolsBotClient;
    const scopedSessionId = `creator:${interaction.id}`;
    client.scopedInteractionSessions.register({
      sessionId: scopedSessionId,
      ownerUserId: interaction.user.id,
      messageId: reply.id,
      componentCustomIds: [prevId, nextId],
      ttlMs: CREATOR_PAGE_TIMEOUT_MS,
    });

    const collector = reply.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: CREATOR_PAGE_TIMEOUT_MS,
      filter: component => component.user.id === interaction.user.id,
    });
    collector.on('collect', async component => {
      if (component.customId === nextId) page = Math.min(page + 1, pages.length - 1);
      else if (component.customId === prevId) page = Math.max(page - 1, 0);
      else return;
      await component.update({ embeds: [buildEmbed(page)], components: [buildRow(page)] }).catch(() => {});
    });
    collector.on('end', async () => {
      client.scopedInteractionSessions.unregister(scopedSessionId);
      await interaction.editReply({ embeds: [buildEmbed(page)], components: [buildRow(page, true)] }).catch(() => {});
    });
  },
};
