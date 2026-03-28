import { getUserCommandSharedState } from './user-command-shared-state';
import { resolveUserStorageState } from './user-storage-resolution';
import { hasMeaningfulBotsState, normalizeBotsSharedState, type BotSharedState as BotSessionState } from '@tmrxjd/platform/tools';

export { hasMeaningfulBotsState, normalizeBotsSharedState } from '@tmrxjd/platform/tools';
export type { BotSharedState as BotSessionState } from '@tmrxjd/platform/tools';

export async function resolveEffectiveBotsState(discordUserId: string): Promise<BotSessionState> {
  const resolved = await resolveUserStorageState({
    discordUserId,
    load: storageUserId => getUserCommandSharedState(storageUserId, 'bots', normalizeBotsSharedState),
    hasMeaningfulState: hasMeaningfulBotsState,
  });

  return resolved.state;
}