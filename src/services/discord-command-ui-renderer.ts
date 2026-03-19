import {
  AttachmentBuilder,
  EmbedBuilder,
  type InteractionEditReplyOptions,
  type InteractionReplyOptions,
} from 'discord.js';
import type {
  UniversalCommandAttachment,
  UniversalCommandResponse,
  UniversalCommandUiSchema,
} from './universal-command-schema';

function asBoundedString(value: unknown, maxLength: number): string {
  return String(value ?? '').slice(0, Math.max(1, maxLength)).trim();
}

function renderSchemaToDiscordPayload(ui: UniversalCommandUiSchema | undefined, fallbackText: string): InteractionReplyOptions {
  const contentFallback = asBoundedString(fallbackText, 1900) || 'Command completed.';
  if (!ui) {
    return {
      content: contentFallback,
    };
  }

  if (ui.type !== 'embed') {
    const description = asBoundedString(ui.description, 1900);
    return {
      content: description || contentFallback,
    };
  }

  const embed = new EmbedBuilder();
  const title = asBoundedString(ui.title, 200);
  const description = asBoundedString(ui.description, 4000);
  if (title) embed.setTitle(title);
  if (description) embed.setDescription(description);

  if (Array.isArray(ui.fields)) {
    const fields = ui.fields
      .map(field => ({
        name: asBoundedString(field?.name, 256),
        value: asBoundedString(field?.value, 1024),
      }))
      .filter(field => field.name && field.value)
      .slice(0, 25);
    if (fields.length > 0) {
      embed.addFields(fields);
    }
  }

  return {
    content: '',
    embeds: [embed],
  };
}

function buildDiscordAttachments(attachments: UniversalCommandAttachment[] | undefined): {
  files: AttachmentBuilder[];
  embedImageName: string | null;
} {
  const files: AttachmentBuilder[] = [];
  let embedImageName: string | null = null;

  for (const attachment of Array.isArray(attachments) ? attachments : []) {
    const name = asBoundedString(attachment?.name, 120) || 'attachment.bin';
    const dataBase64 = asBoundedString(attachment?.dataBase64, 12_000_000);
    if (!dataBase64) {
      continue;
    }

    try {
      const file = new AttachmentBuilder(Buffer.from(dataBase64, 'base64'), { name });
      files.push(file);
      if (!embedImageName && attachment?.embedImage === true) {
        embedImageName = name;
      }
    } catch {
      // Skip invalid attachment payloads.
    }
  }

  return { files, embedImageName };
}

function applyAttachmentsToPayload(
  payload: InteractionReplyOptions,
  attachments: UniversalCommandAttachment[] | undefined,
): InteractionReplyOptions {
  const { files, embedImageName } = buildDiscordAttachments(attachments);
  if (files.length === 0) {
    return payload;
  }

  const embeds = Array.isArray(payload.embeds) ? payload.embeds.map(embed => EmbedBuilder.from(embed)) : [];
  if (embedImageName && embeds[0]) {
    embeds[0].setImage(`attachment://${embedImageName}`);
  }

  return {
    ...payload,
    embeds,
    files,
  };
}

export function toDiscordCommandReplyPayload(response: UniversalCommandResponse): InteractionReplyOptions {
  const fallbackText = asBoundedString(response.answer, 1900) || 'Command completed.';
  return applyAttachmentsToPayload(renderSchemaToDiscordPayload(response.ui, fallbackText), response.attachments);
}

export function toDiscordCommandEditPayload(response: UniversalCommandResponse): InteractionEditReplyOptions {
  const payload = toDiscordCommandReplyPayload(response);
  return {
    content: payload.content,
    embeds: payload.embeds,
    components: payload.components,
    files: payload.files,
  };
}
