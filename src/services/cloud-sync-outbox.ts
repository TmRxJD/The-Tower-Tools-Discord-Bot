import { getToolsBotDb } from './idb';
import { logger } from '../core/logger';
import { computeExponentialBackoffMs, stableSerialize } from '@tmrxjd/platform/tools';

const MAX_RETRY_ATTEMPTS = 8;

type CloudSendFn = (payload: Record<string, unknown>) => Promise<boolean>;

type CloudOutboxSyncInput = {
	userId: string;
	scope: string;
	payload: Record<string, unknown>;
	send: CloudSendFn;
};

function makeOutboxId(userId: string, scope: string): string {
	return `${userId}::${scope}`;
}

function sanitizeError(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}

	return 'Unknown cloud sync error';
}

export async function upsertCloudOutboxState(userId: string, scope: string, payload: Record<string, unknown>): Promise<void> {
	const database = getToolsBotDb();
	const id = makeOutboxId(userId, scope);
	const now = Date.now();
	const existing = await database.cloudSyncOutbox.get(id);
	const hasPayloadChanged = existing
		? stableSerialize(existing.payload) !== stableSerialize(payload)
		: false;

	await database.cloudSyncOutbox.put({
		id,
		userId,
		scope,
		payload,
		attempts: hasPayloadChanged ? 0 : (existing?.attempts ?? 0),
		nextRetryAt: now,
		lastError: hasPayloadChanged ? null : (existing?.lastError ?? null),
		createdAt: existing?.createdAt ?? now,
		updatedAt: now,
	});
}

export async function syncCloudOutboxState(input: CloudOutboxSyncInput): Promise<boolean> {
	const database = getToolsBotDb();
	const id = makeOutboxId(input.userId, input.scope);
	const now = Date.now();
	let pending = await database.cloudSyncOutbox.get(id);

	if (!pending) {
		await upsertCloudOutboxState(input.userId, input.scope, input.payload);
		pending = await database.cloudSyncOutbox.get(id);
		if (!pending) {
			return false;
		}
	}

	if ((pending.nextRetryAt ?? 0) > now) {
		return false;
	}

	if ((pending.attempts ?? 0) >= MAX_RETRY_ATTEMPTS) {
		const nextRetryAt = now + (24 * 60 * 60 * 1000);
		await database.cloudSyncOutbox.put({
			...pending,
			nextRetryAt,
			lastError: pending.lastError ?? `Max retry attempts reached (${MAX_RETRY_ATTEMPTS})`,
			updatedAt: now,
		});
		return false;
	}

	try {
		const ok = await input.send(pending.payload);
		if (!ok) {
			const attempts = (pending.attempts ?? 0) + 1;
			await database.cloudSyncOutbox.put({
				...pending,
				attempts,
				nextRetryAt: now + computeExponentialBackoffMs({ attemptCount: attempts }),
				lastError: 'Cloud save returned unsuccessful result',
				updatedAt: now,
			});
			return false;
		}

		await database.cloudSyncOutbox.delete(id);
		return true;
	} catch (error) {
		const attempts = (pending.attempts ?? 0) + 1;
		const detail = sanitizeError(error);
		await database.cloudSyncOutbox.put({
			...pending,
			attempts,
			nextRetryAt: now + computeExponentialBackoffMs({ attemptCount: attempts }),
			lastError: detail,
			updatedAt: now,
		});
		logger.warn(`Cloud outbox sync failed (${input.scope})`, error);
		return false;
	}
}
