import { AttachmentBuilder } from 'discord.js';

const CONTENT_LIMIT = 2_000;
const ATTACHMENT_NOTICE = '\n\nFull text is attached in definition.txt.';

/** Preserve the complete result while keeping Discord's content field within its limit. */
export function buildDefineResponse(text: string): { content: string; files: AttachmentBuilder[] } {
  if (text.length <= CONTENT_LIMIT) return { content: text, files: [] };

  const limit = CONTENT_LIMIT - ATTACHMENT_NOTICE.length - 1;
  let preview = '';
  // Count UTF-16 units conservatively, but never split a Unicode code point.
  for (const character of text) {
    if (preview.length + character.length > limit) break;
    preview += character;
  }
  return {
    content: `${preview}…${ATTACHMENT_NOTICE}`,
    files: [new AttachmentBuilder(Buffer.from(text, 'utf8'), { name: 'definition.txt' })],
  };
}
