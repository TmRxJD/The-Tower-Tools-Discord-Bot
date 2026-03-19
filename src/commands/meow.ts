import { SlashCommandBuilder, type Emoji } from 'discord.js';
import type { CommandModule } from '../core/command-types';
import { getBotConfig } from '../config/bot-config';

const usageLog = new Map<string, number[]>();
const meowConfig = getBotConfig().commands.meow;
const meowBehavior = meowConfig.behavior;
const meowEmojiConfig = meowConfig.emoji;

function findStretchyGroup(catEmojis: Emoji[]): Emoji[] | null {
  for (const variant of meowEmojiConfig.stretchySets) {
    const found = variant.map(name => catEmojis.find(emoji => emoji.name === name));
    if (found.every(Boolean)) {
      return found as Emoji[];
    }
  }
  return null;
}

const data = new SlashCommandBuilder()
  .setName(meowConfig.name)
  .setDescription(meowConfig.description);

export const meowCommand: CommandModule = {
  data: data.toJSON(),
  async execute(interaction) {
    if (!interaction.isChatInputCommand()) {
      return;
    }

    const now = Date.now();
    const perUser = usageLog.get(interaction.user.id)?.filter(
      timestamp => now - timestamp <= meowBehavior.perUserBurstWindowMs
    ) ?? [];
    const lastTs = perUser.at(-1);

    if (lastTs && now - lastTs < meowBehavior.perUserSingleCooldownMs) {
      const waitSeconds = Math.ceil((meowBehavior.perUserSingleCooldownMs - (now - lastTs)) / 1000);
      await interaction.reply({
        content: meowConfig.rateLimitSingle.replace('{seconds}', String(waitSeconds)),
        ephemeral: true,
      });
      return;
    }

    if (perUser.length >= meowBehavior.perUserBurstLimit) {
      const resetMs = meowBehavior.perUserBurstWindowMs - (now - perUser[0]);
      const waitSeconds = Math.ceil(resetMs / 1000);
      await interaction.reply({
        content: meowConfig.rateLimitBurst.replace('{seconds}', String(waitSeconds)),
        ephemeral: true,
      });
      return;
    }

    perUser.push(now);
    usageLog.set(interaction.user.id, perUser);

    let appEmojis;
    try {
      appEmojis = await interaction.client.application?.emojis.fetch();
    } catch {
      await interaction.reply({ content: meowConfig.emojiFetchError, ephemeral: true });
      return;
    }

    const catEmojis = Array.from(appEmojis?.values?.() ?? []).filter(
      emoji => emoji.name?.startsWith(meowEmojiConfig.catPrefix)
    );
    const stretchyGroup = findStretchyGroup(catEmojis);
    const regularCats = stretchyGroup
      ? catEmojis.filter(emoji => !stretchyGroup.some(stretchy => stretchy.id === emoji.id))
      : catEmojis;

    const pool: Array<Emoji | string> = [...regularCats];
    if (stretchyGroup) {
      pool.push(meowEmojiConfig.stretchyToken);
    }

    if (pool.length === 0) {
      await interaction.reply({ content: meowConfig.noCats, ephemeral: true });
      return;
    }

    const choice = pool[Math.floor(Math.random() * pool.length)];

    if (choice === meowEmojiConfig.stretchyToken && stretchyGroup) {
      const stretchyLines = stretchyGroup.map(emoji => emoji.toString()).join('\n');
      await interaction.reply({ content: stretchyLines });
      return;
    }

    await interaction.reply({ content: choice.toString() });
  },
};
