import { EmbedBuilder } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { toDiscordCommandEditPayload, toDiscordCommandReplyPayload } from './discord-command-ui-renderer';

describe('discord-command-ui-renderer', () => {
  it('renders universal command chart attachments into Discord files and embed image URLs', () => {
    const response = {
      command: 'ask',
      answer: 'Here is the chart you asked for.',
      ui: {
        type: 'embed' as const,
        title: 'TowerAI',
        description: 'Here is the chart you asked for.',
      },
      attachments: [
        {
          name: 'black-hole.png',
          contentType: 'image/png',
          dataBase64: Buffer.from('fake-image').toString('base64'),
          embedImage: true,
        },
      ],
    };

    const payload = toDiscordCommandReplyPayload(response);
    const embed = payload.embeds?.[0] ? EmbedBuilder.from(payload.embeds[0]).toJSON() : null;

    expect(Array.isArray(payload.files)).toBe(true);
    expect(payload.files).toHaveLength(1);
    expect(embed?.image?.url).toBe('attachment://black-hole.png');
  });

  it('preserves chart attachments for edit payloads', () => {
    const response = {
      command: 'ask',
      answer: 'Updated chart.',
      ui: {
        type: 'embed' as const,
        title: 'TowerAI',
        description: 'Updated chart.',
      },
      attachments: [
        {
          name: 'golden-bot.png',
          contentType: 'image/png',
          dataBase64: Buffer.from('fake-image-2').toString('base64'),
          embedImage: true,
        },
      ],
    };

    const payload = toDiscordCommandEditPayload(response);
    const embed = payload.embeds?.[0] ? EmbedBuilder.from(payload.embeds[0]).toJSON() : null;

    expect(Array.isArray(payload.files)).toBe(true);
    expect(payload.files).toHaveLength(1);
    expect(embed?.image?.url).toBe('attachment://golden-bot.png');
  });
});