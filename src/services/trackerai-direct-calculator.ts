import {
  buildTrackerAiUptimeProjectionPayload,
  findBotByName,
  formatTrackerAiUptimeProjectionPayload,
  formatGroupedToolNumber,
  getBotStatMaxLevel,
  getBotStatMinLevel,
  normalizeBotStats,
  parseSpeculativeUptimeCalcRequest,
  sumBotStatCostsBetween,
} from '@tmrxjd/platform/tools';
import { resolveEffectiveBotsState } from './bots-command-state';
import type { UniversalCommandResponse } from './universal-command-schema';

type DirectCalculatorOptions = {
  message: string;
  userId?: string;
};

type ParsedBotMedalsPrompt = {
  bot: string | null;
  stat: string | null;
  startLevel?: number;
  targetLevel?: number;
  wantsMaxTarget: boolean;
};

const BOT_ALIASES: Record<string, string> = {
  'golden bot': 'Golden Bot',
  'coin bot': 'Golden Bot',
  'gold bot': 'Golden Bot',
  gb: 'Golden Bot',
  cb: 'Golden Bot',
  'amplify bot': 'Amplify Bot',
  'amp bot': 'Amplify Bot',
  ab: 'Amplify Bot',
  'flame bot': 'Flame Bot',
  fb: 'Flame Bot',
  'thunder bot': 'Thunder Bot',
  tb: 'Thunder Bot',
};

const BOT_STAT_ALIASES: Record<string, string> = {
  cooldown: 'Cooldown',
  cd: 'Cooldown',
  duration: 'Duration',
  dur: 'Duration',
  bonus: 'Bonus',
  range: 'Range',
  damage: 'Damage',
  dmg: 'Damage',
  linger: 'Linger',
  all: 'all',
  'all stats': 'all',
  'every stat': 'all',
};

function hasWord(input: string, term: string): boolean {
  return new RegExp(`(^|[^a-z0-9])${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^a-z0-9])`, 'i').test(input);
}

function parseLevelMatch(prompt: string, pattern: RegExp): number | undefined {
  const match = pattern.exec(prompt);
  if (!match) return undefined;
  const value = Number.parseInt(String(match[1] || '').trim(), 10);
  return Number.isFinite(value) ? value : undefined;
}

function parseBotMedalsPrompt(prompt: string): ParsedBotMedalsPrompt | null {
  const normalized = String(prompt || '').trim().toLowerCase();
  if (!normalized) return null;
  if (!/\bmedals?\b/.test(normalized)) return null;

  const bot = Object.entries(BOT_ALIASES)
    .sort((left, right) => right[0].length - left[0].length)
    .find(([alias]) => hasWord(normalized, alias))?.[1] ?? null;
  if (!bot) return null;

  const stat = Object.entries(BOT_STAT_ALIASES)
    .sort((left, right) => right[0].length - left[0].length)
    .find(([alias]) => hasWord(normalized, alias))?.[1] ?? null;

  return {
    bot,
    stat,
    startLevel: parseLevelMatch(normalized, /\bfrom\s+(\d{1,3})\b/i),
    targetLevel: parseLevelMatch(normalized, /\b(?:to|target(?:\s+level)?)\s+(\d{1,3})\b/i),
    wantsMaxTarget: /\b(?:max|to\s+max)\b/i.test(normalized),
  };
}

function clampLevel(level: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.trunc(level)));
}

function resolveSelectedStat(savedSelectedStats: string[], parsedStat: string | null): string {
  if (parsedStat) return parsedStat;
  return savedSelectedStats.length === 1 ? savedSelectedStats[0] : 'all';
}

function buildValuesUsed(values: Array<[string, string | number]>): string {
  return values.map(([label, value]) => `${label}: ${value}`).join(' | ');
}

function buildUptimeValuesUsed(payload: ReturnType<typeof buildTrackerAiUptimeProjectionPayload>): string {
  const focusSubjects = Array.isArray(payload.focusSubjects) ? payload.focusSubjects.join(', ') : 'none';
  const overrides = payload.overrides && typeof payload.overrides === 'object'
    ? Object.entries(payload.overrides).map(([key, value]) => `${key}=${String(value)}`).join(', ')
    : 'none';
  return buildValuesUsed([
    ['Field', String(payload.field ?? 'overview')],
    ['Focus', focusSubjects],
    ['Overrides', overrides || 'none'],
    ['DW Kill Wave', payload.includeDwKillWave ? 'enabled' : 'disabled'],
    ['Base Source', String(payload.baseSource ?? 'blank')],
  ]);
}

function buildBotUptimeGuidance(): UniversalCommandResponse {
  const description = 'I can project uptime on the bot when the prompt includes the relevant uptime calculator values, for example `gt cooldown 200 and bh cooldown 100 sync?`. For your saved workspace values, use the site uptime calculator.';
  return {
    command: 'ask',
    tier: 'bot-direct-calculator',
    answer: description,
    ui: {
      type: 'embed',
      title: 'TowerAI',
      description,
      fields: [
        { name: 'Route', value: 'calculator_request' },
        { name: 'Values Used', value: buildValuesUsed([['Calculator', 'uptime'], ['Base Source', 'blank']]) },
      ],
    },
  };
}

export async function runDirectTrackerAiCalculatorCommand(options: DirectCalculatorOptions): Promise<UniversalCommandResponse | null> {
  const uptimeRequest = parseSpeculativeUptimeCalcRequest(options.message);
  if (uptimeRequest) {
    const payload = buildTrackerAiUptimeProjectionPayload({
      field: uptimeRequest.field,
      focusSubjects: uptimeRequest.focusSubjects,
      compareSubjects: uptimeRequest.compareSubjects,
      overrides: uptimeRequest.overrides,
      includeDwKillWave: uptimeRequest.includeDwKillWave,
    });
    const focusRows = payload.focusRows && typeof payload.focusRows === 'object'
      ? payload.focusRows as Record<string, { effectiveCd?: string; durationTotal?: string }>
      : {};
    const missingProjectionBase = Object.values(focusRows).some(row => row?.effectiveCd === '0s')
      || (payload.field !== 'sync' && Object.values(focusRows).some(row => row?.durationTotal === '0s'));
    if (missingProjectionBase) {
      return buildBotUptimeGuidance();
    }

    const description = formatTrackerAiUptimeProjectionPayload(payload as unknown as Record<string, unknown>);
    return {
      command: 'ask',
      tier: 'bot-direct-calculator',
      answer: description,
      ui: {
        type: 'embed',
        title: 'TowerAI',
        description,
        fields: [
          { name: 'Route', value: 'calculator_request' },
          { name: 'Values Used', value: buildUptimeValuesUsed(payload) },
        ],
      },
    };
  }

  const parsed = parseBotMedalsPrompt(options.message);
  if (!parsed) return null;

  const savedState = options.userId
    ? await resolveEffectiveBotsState(options.userId)
    : { botName: null, selectedStats: [], startLevel: 0, targetLevel: null, cooldownLab: 0, durationLab: 0 };

  const botName = parsed.bot ?? savedState.botName;
  if (!botName) return null;

  const bot = findBotByName(botName);
  if (!bot) return null;

  const statSelection = resolveSelectedStat(savedState.selectedStats, parsed.stat);
  const stats = normalizeBotStats(bot, { Cooldown: savedState.cooldownLab, Duration: savedState.durationLab });
  const isAllStats = String(statSelection).trim().toLowerCase() === 'all';
  const selectedStatIndex = isAllStats
    ? -1
    : stats.findIndex(stat => stat.name.trim().toLowerCase() === String(statSelection).trim().toLowerCase());

  if (!isAllStats && selectedStatIndex < 0) return null;

  let medalsRequired = 0;
  const usedTargetLabel = parsed.wantsMaxTarget
    ? 'max'
    : (parsed.targetLevel ?? savedState.targetLevel ?? 'max');
  const startLevelArg = parsed.startLevel ?? savedState.startLevel;

  for (let statIndex = 0; statIndex < stats.length; statIndex += 1) {
    if (!isAllStats && statIndex !== selectedStatIndex) continue;
    const stat = stats[statIndex];
    if (!stat) continue;
    const min = getBotStatMinLevel(stat);
    const max = getBotStatMaxLevel(stat);
    const startLevel = clampLevel(startLevelArg, min, max);
    const targetCandidate = parsed.wantsMaxTarget
      ? max
      : (parsed.targetLevel ?? savedState.targetLevel ?? max);
    const targetLevel = clampLevel(targetCandidate, startLevel, max);
    medalsRequired += sumBotStatCostsBetween(stat, startLevel, targetLevel);
  }

  const statLabel = isAllStats ? 'all stats' : stats[selectedStatIndex]?.name ?? statSelection;
  const description = isAllStats
    ? `${bot.label} all stats from level ${startLevelArg} to ${usedTargetLabel} cost ${formatGroupedToolNumber(medalsRequired)} medals.`
    : `${bot.label} ${String(statLabel).toLowerCase()} from level ${startLevelArg} to ${usedTargetLabel} costs ${formatGroupedToolNumber(medalsRequired)} medals.`;

  return {
    command: 'ask',
    tier: 'bot-direct-calculator',
    answer: description,
    ui: {
      type: 'embed',
      title: 'TowerAI',
      description,
      fields: [
        { name: 'Route', value: 'calculator_request' },
        {
          name: 'Values Used',
          value: buildValuesUsed([
            ['Bot', bot.label],
            ['Stat', statLabel],
            ['Start', startLevelArg],
            ['Target', usedTargetLabel],
            ...(bot.labInfo.some(lab => lab.name === 'Cooldown') ? [['Cooldown Lab', savedState.cooldownLab] as [string, string | number]] : []),
            ...(bot.labInfo.some(lab => lab.name === 'Duration') ? [['Duration Lab', savedState.durationLab] as [string, string | number]] : []),
          ]),
        },
      ],
    },
  };
}