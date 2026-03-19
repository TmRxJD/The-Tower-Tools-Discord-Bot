import { resolveCanonicalAppwriteUserId } from './identity';

type StorageResolutionOptions<T> = {
  discordUserId: string;
  load: (userId: string) => Promise<T>;
  hasMeaningfulState: (state: T) => boolean;
};

export type ResolvedUserStorageState<T> = {
  storageUserId: string;
  state: T;
};

export async function resolveUserStorageState<T>(
  options: StorageResolutionOptions<T>,
): Promise<ResolvedUserStorageState<T>> {
  const canonicalUserId = resolveCanonicalAppwriteUserId(options.discordUserId);

  const primaryState = await options.load(options.discordUserId);
  if (!canonicalUserId || canonicalUserId === options.discordUserId) {
    return {
      storageUserId: options.discordUserId,
      state: primaryState,
    };
  }

  if (options.hasMeaningfulState(primaryState)) {
    return {
      storageUserId: options.discordUserId,
      state: primaryState,
    };
  }

  const mappedState = await options.load(canonicalUserId);
  if (options.hasMeaningfulState(mappedState)) {
    return {
      storageUserId: canonicalUserId,
      state: mappedState,
    };
  }

  return {
    storageUserId: options.discordUserId,
    state: primaryState,
  };
}