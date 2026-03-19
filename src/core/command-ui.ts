import { EmbedBuilder, type ColorResolvable, type APIEmbedField } from 'discord.js';

type CommandEmbedOptions = {
  title: string;
  description?: string;
  color?: ColorResolvable;
  footerText?: string;
  url?: string;
  fields?: APIEmbedField[];
  includeTimestamp?: boolean;
};

export function createCommandEmbed(options: CommandEmbedOptions): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(options.title)
    .setColor(options.color ?? '#00bfff');

  if (options.description) {
    embed.setDescription(options.description);
  }

  if (options.url) {
    embed.setURL(options.url);
  }

  if (options.footerText) {
    embed.setFooter({ text: options.footerText });
  }

  if (options.fields && options.fields.length > 0) {
    embed.addFields(options.fields);
  }

  if (options.includeTimestamp ?? true) {
    embed.setTimestamp();
  }

  return embed;
}
