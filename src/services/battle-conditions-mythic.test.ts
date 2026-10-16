import { expect, it } from 'vitest';
import { battleConditionsRankSchema, battleConditionsRankOrder, battleConditionsChannelMapSchema, battleConditionsDeliveredDatesSchema, battleConditionsDeliveredUpdatedAtSchema, getBattleConditionsRankConfig, getBattleConditionsRankBySourceChannelId } from '@tmrxjd/platform/tools';
it('accepts Mythic in the shared source and persisted subscription contracts', () => {
 expect(battleConditionsRankSchema.parse('mythic')).toBe('mythic');
 expect(getBattleConditionsRankBySourceChannelId('1542575039814312026')).toBe('mythic');
 expect(getBattleConditionsRankConfig('mythic')).toMatchObject({label: 'Mythic', collectionId: 'mythic'});
 expect(battleConditionsChannelMapSchema.parse({mythic: '1543430599648485476'}).mythic).toBe('1543430599648485476');
 expect(battleConditionsDeliveredDatesSchema.parse({mythic: '2026-10-03'}).mythic).toBe('2026-10-03');
 expect(battleConditionsDeliveredUpdatedAtSchema.parse({mythic: 42}).mythic).toBe(42);
 expect(battleConditionsRankOrder.filter(rank => rank !== 'mythic')).toEqual(['legends','champ','plat','gold','silver']);
 expect(battleConditionsChannelMapSchema.parse({legends:'old'})).toEqual({legends:'old'});
 expect(battleConditionsRankSchema.safeParse('unknown').success).toBe(false);
});
import { getConfiguredBattleConditionsRanks } from './battle-conditions-runtime';
it('never opts existing destinations into Mythic and supports explicit opt-out', () => {
 expect(getConfiguredBattleConditionsRanks({legends:'old'}, {})).toEqual(['legends']);
 expect(getConfiguredBattleConditionsRanks({mythic:'new'}, {})).toEqual(['mythic']);
 expect(getConfiguredBattleConditionsRanks({mythic:'new'}, {mythic:false})).toEqual([]);
});
