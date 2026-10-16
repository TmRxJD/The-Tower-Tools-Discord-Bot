import { AttachmentBuilder, MessageFlags, SlashCommandBuilder } from 'discord.js';
import type { CommandModule } from '../core/command-types';
import { listManagedAcronyms } from '../services/acronym-registry';
import { renderAcronymMarkdown } from '../features/acronyms/acronym-markdown';
import { privateFileShares } from '../services/private-file-share';

export const acronymsCommand: CommandModule = {
  data: new SlashCommandBuilder()
    .setName('acronyms')
    .setDescription('List managed acronym entries')
    .addSubcommand(subcommand => subcommand
      .setName('all')
      .setDescription('Download all acronyms privately, with an option to share in this channel'))
    .toJSON(),
  async execute(interaction) {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.options.getSubcommand(true) !== 'all') {
      await interaction.reply({ content: 'Use /acronyms all to download the complete list.', flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const entries = await listManagedAcronyms();
    const attachment = new AttachmentBuilder(Buffer.from(renderAcronymMarkdown(entries), 'utf8'))
      .setName('tower-acronyms.md');
    await privateFileShares.offer(interaction, {
      content: 'Complete acronym list: ' + entries.length + ' active entries.',
      files: [attachment],
    });
  },
};
