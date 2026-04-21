import {
  battleConditionsDeliveredDatesSchema,
  battleConditionsSchedulerStateSchema,
  battleConditionsSubscriptionSchema,
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

export async function getBattleConditionsSubscription(guildId: string): Promise<LocalBattleConditionsSubscription | null> {
  const row = await getToolsBotDb().battleConditionsSubscriptions.get(guildId);
  if (!row) {
    return null;
  }

  return battleConditionsSubscriptionSchema.parse({
    guildId: row.guildId,
    channels: normalizeBattleConditionsChannelMap(row.channels),
    deliveredTournamentDates: normalizeBattleConditionsDeliveredDates(row.deliveredTournamentDates),
    updatedAt: row.updatedAt,
  });
}

export async function listBattleConditionsSubscriptions(): Promise<LocalBattleConditionsSubscription[]> {
  const rows = await getToolsBotDb().battleConditionsSubscriptions.toArray();
  return rows.map(row => battleConditionsSubscriptionSchema.parse({
    guildId: row.guildId,
    channels: normalizeBattleConditionsChannelMap(row.channels),
    deliveredTournamentDates: normalizeBattleConditionsDeliveredDates(row.deliveredTournamentDates),
    updatedAt: row.updatedAt,
  }));
}

export async function saveBattleConditionsSubscription(subscription: LocalBattleConditionsSubscription): Promise<LocalBattleConditionsSubscription> {
  const parsed = battleConditionsSubscriptionSchema.parse(subscription);
  await getToolsBotDb().battleConditionsSubscriptions.put(parsed);
  return parsed as LocalBattleConditionsSubscription;
}

export async function updateBattleConditionsSubscriptionChannels(input: {
  guildId: string;
  rank: LocalBattleConditionsRankOrAll;
  channelId: string;
}): Promise<LocalBattleConditionsSubscription> {
  const existing = await getBattleConditionsSubscription(input.guildId);
  const channels = normalizeBattleConditionsChannelMap(existing?.channels);
  const deliveredTournamentDates = battleConditionsDeliveredDatesSchema.parse(existing?.deliveredTournamentDates ?? {});

  if (input.rank === 'all') {
    channels.legends = input.channelId;
    channels.champ = input.channelId;
    channels.plat = input.channelId;
    channels.gold = input.channelId;
    channels.silver = input.channelId;
  } else {
    channels[input.rank] = input.channelId;
  }

  return saveBattleConditionsSubscription({
    guildId: input.guildId,
    channels,
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