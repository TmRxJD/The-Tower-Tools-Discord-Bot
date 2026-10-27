import { logger } from '../core/logger';
import { getOrInitToolsUserStateRxDatabase } from './database-manager';
import { diagnosticRef } from '../services/operation-diagnostics';

export type ToolsUserStateInboundChangeHandler = (input: {
  userId: string;
  collection: 'shared_user_settings' | 'lab_settings';
}) => void;

const inboundHandlers = new Set<ToolsUserStateInboundChangeHandler>();
const subscriptionsByUser = new Map<string, { unsubscribe: () => void }>();

export function getToolsUserStateSubscriptionCount(): number {
  return subscriptionsByUser.size;
}

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

  if (subscriptionsByUser.has(normalizedUserId)) return;

  const db = await getOrInitToolsUserStateRxDatabase(normalizedUserId);
  if (subscriptionsByUser.has(normalizedUserId)) return;
  const sharedSubscription = db.shared_user_settings.$.subscribe((change: { documentData: { userId: string } }) => {
    if (change.documentData.userId === normalizedUserId) notifyInboundChange(normalizedUserId, 'shared_user_settings');
  });
  const labSubscription = db.lab_settings.$.subscribe((change: { documentData: { userId: string } }) => {
    if (change.documentData.userId === normalizedUserId) notifyInboundChange(normalizedUserId, 'lab_settings');
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
    logger.info('[rxdb] tools user-state updated', { correlation: diagnosticRef(userId), collection });
  });
}
