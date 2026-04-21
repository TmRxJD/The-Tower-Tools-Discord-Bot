import {
  battleConditionsRankOrder,
} from '@tmrxjd/platform/tools';
import { EmbedBuilder } from 'discord.js';
import type { BattleConditionsRecord } from './battle-conditions-cloud';

const SLOT_OPEN_MINUTE_UTC = 1;
type LocalBattleConditionsRank = 'legends' | 'champ' | 'plat' | 'gold' | 'silver';
type LocalBattleConditionsEnabledMap = Partial<Record<LocalBattleConditionsRank, boolean | undefined>>;

export interface BattleConditionsWindow {
  windowKey: string;
  startMs: number;
  endMs: number;
}

export function getActiveBattleConditionsWindow(now = Date.now()): BattleConditionsWindow | null {
  const date = new Date(now);
  const day = date.getUTCDay();
  if (day !== 1 && day !== 4) {
    return null;
  }

  const startMs = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    0,
    SLOT_OPEN_MINUTE_UTC,
    0,
    0,
  );
  const endMs = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() + 1,
    0,
    0,
    0,
    0,
  );

  if (now < startMs || now >= endMs) {
    return null;
  }

  return {
    windowKey: new Date(startMs).toISOString(),
    startMs,
    endMs,
  };
}

export function isBattleConditionsRankEnabled(
  channels: Partial<Record<LocalBattleConditionsRank, string | undefined>>,
  enabled: LocalBattleConditionsEnabledMap,
  rank: LocalBattleConditionsRank,
): boolean {
  if (!channels[rank]) {
    return false;
  }

  return enabled[rank] !== false;
}

export function getConfiguredBattleConditionsRanks(
  channels: Partial<Record<LocalBattleConditionsRank, string | undefined>>,
  enabled: LocalBattleConditionsEnabledMap,
): LocalBattleConditionsRank[] {
  return (battleConditionsRankOrder as LocalBattleConditionsRank[]).filter(rank => isBattleConditionsRankEnabled(channels, enabled, rank));
}

export function isBattleConditionsRecordFreshForWindow(record: BattleConditionsRecord | null, window: BattleConditionsWindow): boolean {
  if (!record) {
    return false;
  }

  return record.sourceMessageUpdatedAt >= window.startMs;
}

export function buildBattleConditionsEmbed(record: BattleConditionsRecord): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(record.title)
    .setDescription(record.description)
    .setColor(record.color)
    .setTimestamp(new Date(record.sourceMessageUpdatedAt));

  if (record.versionText && !record.description.includes(record.versionText)) {
    embed.setFooter({ text: record.versionText });
  }

  return embed;
}