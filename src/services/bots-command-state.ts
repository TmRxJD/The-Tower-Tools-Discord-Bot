import { getBotConfig } from '../config/bot-config';
import { getUserCommandSharedState } from './user-command-shared-state';
import { resolveUserStorageState } from './user-storage-resolution';
import { BOT_UPGRADES_DATA, findBotByName, getBotStatBoundsByIndex } from '@tmrxjd/platform/tools';

const botsConfig = getBotConfig().commands.bots;

function resolveBotLevelCap(botName: string | null): number {
  const selectedBot = botName ? findBotByName(botName) : null;
  const bots = selectedBot ? [selectedBot] : BOT_UPGRADES_DATA;
  let maxLevel = 0;

  for (const bot of bots) {
    for (let statIndex = 0; statIndex < bot.statOrder.length; statIndex += 1) {
      maxLevel = Math.max(maxLevel, getBotStatBoundsByIndex(bot, statIndex).max);
    }
  }

  return Math.max(0, maxLevel);
}

export type BotSessionState = {
  botName: string | null;
  selectedStats: string[];
  startLevel: number;
  targetLevel: number | null;
  cooldownLab: number;
  durationLab: number;
};

export function normalizeBotsSharedState(input: Record<string, unknown> | null): BotSessionState {
  const botName = typeof input?.botName === 'string' && input.botName.trim().length > 0
    ? input.botName
    : null;

  const selectedStats = Array.isArray(input?.selectedStats)
    ? input.selectedStats.filter((entry): entry is string => typeof entry === 'string')
    : [];

  const targetRaw = Number(input?.targetLevel);
  const levelCap = resolveBotLevelCap(botName);
  return {
    botName,
    selectedStats,
    startLevel: Number.isFinite(Number(input?.startLevel)) ? Math.max(0, Math.min(levelCap, Math.floor(Number(input?.startLevel)))) : botsConfig.defaults.startLevel,
    targetLevel: Number.isFinite(targetRaw) ? Math.max(0, Math.min(levelCap, Math.floor(targetRaw))) : null,
    cooldownLab: Number.isFinite(Number(input?.cooldownLab)) ? Math.max(0, Math.min(25, Math.floor(Number(input?.cooldownLab)))) : botsConfig.defaults.cooldownLab,
    durationLab: Number.isFinite(Number(input?.durationLab)) ? Math.max(0, Math.min(20, Math.floor(Number(input?.durationLab)))) : botsConfig.defaults.durationLab,
  };
}

export function hasMeaningfulBotsState(candidate: BotSessionState): boolean {
  return JSON.stringify(candidate) !== JSON.stringify(normalizeBotsSharedState(null));
}

export async function resolveEffectiveBotsState(discordUserId: string): Promise<BotSessionState> {
  const resolved = await resolveUserStorageState({
    discordUserId,
    load: storageUserId => getUserCommandSharedState(storageUserId, 'bots', normalizeBotsSharedState),
    hasMeaningfulState: hasMeaningfulBotsState,
  });

  return resolved.state;
}