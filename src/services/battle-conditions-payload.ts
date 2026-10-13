import path from 'node:path';
import { listBattlePayloads, readBattlePayload } from '@tmrxjd/platform/node';
import type { BattleConditionsRank } from '@tmrxjd/platform/tools';
import type { BattleConditionsRecord } from './battle-conditions-cloud';

export const battlePayloadRoot = path.resolve(__dirname, '../../../../TowerModBot/The-Tower-Discord-Mod-Bot/data/battle-payloads');
export function readLocalBattlePayload(record: BattleConditionsRecord) {
  return readBattlePayload(battlePayloadRoot, record);
}
export async function listLocalBattleRecords(rank: BattleConditionsRank) {
  const entries = await listBattlePayloads(battlePayloadRoot, rank);
  return entries.map(entry => ({ id: entry.record.tournamentDate, ...entry.record }));
}
export async function canAutomaticallyDeliverBattleRecord(record: BattleConditionsRecord): Promise<boolean> {
  const entry = await readLocalBattlePayload(record);
  if (!entry?.automatic) return false;
  // Seeds and old bridge events never replay. Retain pending live updates for this tournament window.
  const today = new Date().toISOString().slice(0, 10);
  const entries = await listBattlePayloads(battlePayloadRoot, record.rank);
  const latest = entries.find(candidate => candidate.record.tournamentDate === record.tournamentDate);
  return record.tournamentDate >= today && record.sourceMessageUpdatedAt <= Date.now() + 60000
    && latest?.record.sourceMessageId === record.sourceMessageId
    && latest.record.sourceMessageUpdatedAt === record.sourceMessageUpdatedAt;
}
