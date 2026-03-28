import { getBotConfig } from '../config/bot-config';

const checklistIds = getBotConfig().commands.checklist.ids;

export function createChecklistTaskCustomId(slotIndex: number): string {
  return `${checklistIds.checkPrefix}${slotIndex}`;
}

export function parseChecklistTaskCustomId(customId: string): number | null {
  if (!customId.startsWith(checklistIds.checkPrefix)) {
    return null;
  }

  const rawIndex = customId.slice(checklistIds.checkPrefix.length).trim();
  if (!/^\d+$/.test(rawIndex)) {
    return null;
  }

  const slotIndex = Number(rawIndex);
  return Number.isSafeInteger(slotIndex) ? slotIndex : null;
}

export function createChecklistModalPrefix(mode: string): string {
  return `${mode}${checklistIds.modalSuffix}`;
}

export function createChecklistModalBaseCustomId(mode: string, slotIndex: number): string {
  return `${createChecklistModalPrefix(mode)}${slotIndex}`;
}