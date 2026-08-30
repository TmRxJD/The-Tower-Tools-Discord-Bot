import { logger } from '../core/logger';
import { getActiveToolsUserStateRxDatabase, getOrInitToolsUserStateRxDatabase } from './database-manager';

export type ToolsUserStateInboundChangeHandler = (input: {
  userId: string;
  collection: 'shared_user_settings' | 'lab_settings';
}) => void;

const inboundHandlers = new Set<ToolsUserStateInboundChangeHandler>();
const subscriptionsByUser = new Map<string, { unsubscribe: () => void }>();

export function registerToolsUserStateInboundChangeHandler(
  handler: ToolsUserStateInboundChangeHandler | null,
): void {
  if (!handler) {
    return;
  }
  inboundHandlers.add(handler);
}

function notifyInboundChange(userId: string, collection: 'shared_user_settings' | 'lab_settings'): void {
  for (const handler of inboundHandlers) {
    handler({ userId, collection });
  }
}

export async function bindToolsUserStateRxDBInboundSync(userId: string): Promise<void> {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) {
    return;
  }

  subscriptionsByUser.get(normalizedUserId)?.unsubscribe();

  const db = await getOrInitToolsUserStateRxDatabase(normalizedUserId);
  const sharedSubscription = db.shared_user_settings.find().$.subscribe(() => {
    notifyInboundChange(normalizedUserId, 'shared_user_settings');
  });
  const labSubscription = db.lab_settings.find().$.subscribe(() => {
    notifyInboundChange(normalizedUserId, 'lab_settings');
  });

  subscriptionsByUser.set(normalizedUserId, {
    unsubscribe: () => {
      sharedSubscription.unsubscribe();
      labSubscription.unsubscribe();
    },
  });
}

export function unbindToolsUserStateRxDBInboundSync(userId: string): void {
  const normalizedUserId = userId.trim();
  subscriptionsByUser.get(normalizedUserId)?.unsubscribe();
  subscriptionsByUser.delete(normalizedUserId);
}

export function logToolsUserStateInboundChanges(): void {
  registerToolsUserStateInboundChangeHandler(({ userId, collection }) => {
    logger.info('[rxdb] tools user-state updated', { userId, collection });
  });
}
