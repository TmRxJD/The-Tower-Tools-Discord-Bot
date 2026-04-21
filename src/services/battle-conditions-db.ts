import {
  battleConditionsChannelMapSchema,
  battleConditionsDeliveredDatesSchema,
  battleConditionsSchedulerStateSchema,
  normalizeBattleConditionsChannelMap,
  normalizeBattleConditionsDeliveredDates,
} from '@tmrxjd/platform/tools';
import { getToolsBotDb } from './idb';

const SCHEDULER_STATE_ID = 'global';

type LocalBattleConditionsRank = 'legends' | 'champ' | 'plat' | 'gold' | 'silver';
type LocalBattleConditionsRankOrAll = LocalBattleConditionsRank | 'all';
type LocalBattleConditionsSubscription = {
  guildId: string;
  channels: Partial<Record<LocalBattleConditionsRank, string | undefined>>;
  enabled: Partial<Record<LocalBattleConditionsRank, boolean | undefined>>;
  deliveredTournamentDates: Partial<Record<LocalBattleConditionsRank, string | undefined>>;
  updatedAt: number;
};
type LocalBattleConditionsSchedulerState = {
  windowKey: string | null;
  lastPolledAt: number | null;
  resolvedAt: number | null;
  lastSeenTournamentDates: Partial<Record<LocalBattleConditionsRank, string | undefined>>;
  updatedAt: number;
};

function normalizeBattleConditionsEnabledMap(input: unknown): Partial<Record<LocalBattleConditionsRank, boolean | undefined>> {
  const typedInput = (input && typeof input === 'object') ? input as Record<string, unknown> : {};
  return {
    legends: typeof typedInput.legends === 'boolean' ? typedInput.legends : undefined,
    champ: typeof typedInput.champ === 'boolean' ? typedInput.champ : undefined,
    plat: typeof typedInput.plat === 'boolean' ? typedInput.plat : undefined,
    gold: typeof typedInput.gold === 'boolean' ? typedInput.gold : undefined,
    silver: typeof typedInput.silver === 'boolean' ? typedInput.silver : undefined,
  };
}

export async function getBattleConditionsSubscription(guildId: string): Promise<LocalBattleConditionsSubscription | null> {
  const row = await getToolsBotDb().battleConditionsSubscriptions.get(guildId);
  if (!row) {
    return null;
  }

  return {
    guildId: row.guildId,
    channels: normalizeBattleConditionsChannelMap(row.channels),
    enabled: normalizeBattleConditionsEnabledMap(row.enabled),
    deliveredTournamentDates: normalizeBattleConditionsDeliveredDates(row.deliveredTournamentDates),
    updatedAt: row.updatedAt,
  };
}

export async function listBattleConditionsSubscriptions(): Promise<LocalBattleConditionsSubscription[]> {
  const rows = await getToolsBotDb().battleConditionsSubscriptions.toArray();
  return rows.map(row => {
    battleConditionsChannelMapSchema.parse(normalizeBattleConditionsChannelMap(row.channels));
    battleConditionsDeliveredDatesSchema.parse(normalizeBattleConditionsDeliveredDates(row.deliveredTournamentDates));
    return {
      guildId: row.guildId,
      channels: normalizeBattleConditionsChannelMap(row.channels),
      enabled: normalizeBattleConditionsEnabledMap(row.enabled),
      deliveredTournamentDates: normalizeBattleConditionsDeliveredDates(row.deliveredTournamentDates),
      updatedAt: row.updatedAt,
    };
  });
}

export async function saveBattleConditionsSubscription(subscription: LocalBattleConditionsSubscription): Promise<LocalBattleConditionsSubscription> {
  const parsed = {
    guildId: String(subscription.guildId),
    channels: normalizeBattleConditionsChannelMap(subscription.channels),
    enabled: normalizeBattleConditionsEnabledMap(subscription.enabled),
    deliveredTournamentDates: normalizeBattleConditionsDeliveredDates(subscription.deliveredTournamentDates),
    updatedAt: subscription.updatedAt,
  };
  battleConditionsChannelMapSchema.parse(parsed.channels);
  battleConditionsDeliveredDatesSchema.parse(parsed.deliveredTournamentDates);
  if (!parsed.guildId.trim()) {
    throw new Error('Battle conditions subscription guildId is required.');
  }
  if (!Number.isInteger(parsed.updatedAt) || parsed.updatedAt < 0) {
    throw new Error('Battle conditions subscription updatedAt must be a non-negative integer.');
  }
  await getToolsBotDb().battleConditionsSubscriptions.put(parsed);
  return parsed as LocalBattleConditionsSubscription;
}

export async function updateBattleConditionsSubscriptionSettings(input: {
  guildId: string;
  rank: LocalBattleConditionsRankOrAll;
  channelId?: string;
  enabled: boolean;
}): Promise<LocalBattleConditionsSubscription> {
  const existing = await getBattleConditionsSubscription(input.guildId);
  const channels = normalizeBattleConditionsChannelMap(existing?.channels);
  const enabled = normalizeBattleConditionsEnabledMap(existing?.enabled);
  const deliveredTournamentDates = battleConditionsDeliveredDatesSchema.parse(existing?.deliveredTournamentDates ?? {});

  if (input.rank === 'all') {
    if (input.channelId !== undefined) {
      channels.legends = input.channelId;
      channels.champ = input.channelId;
      channels.plat = input.channelId;
      channels.gold = input.channelId;
      channels.silver = input.channelId;
    }
    enabled.legends = input.enabled;
    enabled.champ = input.enabled;
    enabled.plat = input.enabled;
    enabled.gold = input.enabled;
    enabled.silver = input.enabled;
  } else {
    if (input.channelId !== undefined) {
      channels[input.rank] = input.channelId;
    }
    enabled[input.rank] = input.enabled;
  }

  return saveBattleConditionsSubscription({
    guildId: input.guildId,
    channels,
    enabled,
    deliveredTournamentDates,
    updatedAt: Date.now(),
  });
}

export async function markBattleConditionsDelivered(input: {
  guildId: string;
  rank: LocalBattleConditionsRank;
  tournamentDate: string;
}): Promise<void> {
  const existing = await getBattleConditionsSubscription(input.guildId);
  if (!existing) {
    return;
  }

  const deliveredTournamentDates = normalizeBattleConditionsDeliveredDates(existing.deliveredTournamentDates);
  deliveredTournamentDates[input.rank] = input.tournamentDate;
  await saveBattleConditionsSubscription({
    ...existing,
    deliveredTournamentDates,
    updatedAt: Date.now(),
  });
}

export async function getBattleConditionsSchedulerState(): Promise<LocalBattleConditionsSchedulerState> {
  const row = await getToolsBotDb().battleConditionsSchedulerState.get(SCHEDULER_STATE_ID);
  return battleConditionsSchedulerStateSchema.parse({
    windowKey: row?.windowKey ?? null,
    lastPolledAt: row?.lastPolledAt ?? null,
    resolvedAt: row?.resolvedAt ?? null,
    lastSeenTournamentDates: normalizeBattleConditionsDeliveredDates(row?.lastSeenTournamentDates),
    updatedAt: row?.updatedAt ?? 0,
  });
}

export async function saveBattleConditionsSchedulerState(state: LocalBattleConditionsSchedulerState): Promise<LocalBattleConditionsSchedulerState> {
  const parsed = battleConditionsSchedulerStateSchema.parse(state);
  await getToolsBotDb().battleConditionsSchedulerState.put({
    id: SCHEDULER_STATE_ID,
    ...parsed,
  });
  return parsed as LocalBattleConditionsSchedulerState;
}