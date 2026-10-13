import { AttachmentBuilder, MessageFlags, SlashCommandBuilder } from 'discord.js';
import type { CommandModule } from '../core/command-types';
import { listManagedAcronyms } from '../services/acronym-registry';

import { renderAcronymMarkdown } from '../features/acronyms/acronym-markdown';

const COMMAND_NAME = 'acronyms';
const SUBCOMMAND_ALL = 'all';
const MAX_MESSAGE_LENGTH = 1800;

function chunkLines(lines: string[]): string[] {
  const chunks: string[] = [];
  let current = '';

  for (const line of lines) {
    const next = current.length === 0 ? line : `${current}\n${line}`;
    if (next.length > MAX_MESSAGE_LENGTH && current.length > 0) {
      chunks.push(current);
      current = line;
      continue;
    }

    current = next;
  }

  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks;
}

export const acronymsCommand: CommandModule = {
  data: new SlashCommandBuilder()
    .setName(COMMAND_NAME)
    .setDescription('List managed acronym entries')
    .addSubcommand(subcommand =>
      subcommand
        .setName(SUBCOMMAND_ALL)
        .setDescription('Show every active acronym')
    )
    .addSubcommand(subcommand => subcommand
      .setName('export')
      .setDescription('Download the entire acronym list as a private Markdown file'))
    .toJSON(),
  async execute(interaction) {
    if (!interaction.isChatInputCommand()) {
      return;
    }

    const subcommand = interaction.options.getSubcommand(true);
    if (subcommand === 'export') {
      // Set privacy before any data access; edits and router errors inherit it.
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const entries = await listManagedAcronyms();
      const attachment = new AttachmentBuilder(Buffer.from(renderAcronymMarkdown(entries), 'utf8'))
        .setName('tower-acronyms.md');
      await interaction.editReply({
        content: 'Complete acronym list: ' + entries.length + ' active entries.',
        files: [attachment],
        allowedMentions: { parse: [] },
      });
      return;
    }
    if (subcommand !== SUBCOMMAND_ALL) {
      await interaction.reply({ content: 'Unsupported acronym listing command.', ephemeral: true });
      return;
    }

    const entries = await listManagedAcronyms();
    if (entries.length === 0) {
      await interaction.reply({ content: 'No active acronyms are configured.', ephemeral: true });
      return;
    }

    const lines = entries.map(entry => `${entry.acronym}: ${entry.expansion}`);
    const chunks = chunkLines([`Active acronyms: ${entries.length}`, ...lines]);

    await interaction.reply({ content: chunks[0], ephemeral: true });
    for (let index = 1; index < chunks.length; index += 1) {
      await interaction.followUp({ content: chunks[index], ephemeral: true });
    }
  },
};