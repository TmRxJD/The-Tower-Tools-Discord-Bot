import { ID, Models } from 'node-appwrite';
import { Query } from 'node-appwrite';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  type Giveaway,
  type GiveawayEntry,
  giveawayDocumentSchema,
  giveawayEntryDocumentSchema,
  normalizeGiveawayEndTime,
} from '@tmrxjd/platform/tools';
import { getAppwriteClient } from '../../services/appwrite-client';
import { getAppConfig } from '../../config';
import { logger } from '../../core/logger';

export type { Giveaway, GiveawayEntry };

const giveawayCreateSchema = z.object({
  title: z.string().trim().min(1),
  prize: z.string().trim().min(1),
  winners: z.number().int().positive(),
  duration: z.number().int().nonnegative(),
  creatorId: z.string().min(1),
  sponsorId: z.string().min(1).optional(),
  channelId: z.string().min(1),
  messageId: z.string().default(''),
  endTime: z.number().finite().nonnegative(),
});

const giveawayUpdateSchema = z.object({
  title: z.string().trim().min(1).optional(),
  prize: z.string().trim().min(1).optional(),
  winners: z.number().int().positive().optional(),
  duration: z.number().int().nonnegative().optional(),
  creatorId: z.string().min(1).optional(),
  sponsorId: z.string().min(1).optional(),
  channelId: z.string().min(1).optional(),
  messageId: z.string().min(1).optional(),
  endTime: z.number().finite().nonnegative().optional(),
  entries: z.number().int().nonnegative().optional(),
  winnerIds: z.array(z.string().min(1)).optional(),
  announcementSent: z.boolean().optional(),
}).strict();

const giveawayEntryCreateSchema = z.object({
  giveawayId: z.string().min(1),
  giveawayMessageId: z.string().trim().min(1).optional(),
  userId: z.string().min(1),
  playerId: z.string().trim().min(1),
}).strict();

type GiveawayEntryInput = z.infer<typeof giveawayEntryCreateSchema>;

function getCollections() {
  const cfg = getAppConfig();
  if (!cfg.appwrite) throw new Error('Appwrite is not configured for ToolsBot giveaways');
  return {
    databaseId: cfg.appwrite.giveawayDatabaseId,
    giveaways: cfg.appwrite.giveawaysCollectionId,
    entries: cfg.appwrite.giveawayEntriesCollectionId,
  };
}

function requireAppwriteClient() {
  const client = getAppwriteClient();
  if (!client) throw new Error('Appwrite client is not available');
  return client;
}

function logSchemaFailure(label: string, error: unknown, document: unknown) {
  logger.warn(`[giveawayRepo] Ignoring invalid ${label}`, { error, document });
}

function parseGiveawayDocument(document: unknown): Giveaway | null {
  const parsed = giveawayDocumentSchema.safeParse(document);
  if (!parsed.success) {
    logSchemaFailure('giveaway document', parsed.error, document);
    return null;
  }
  return parsed.data as Giveaway;
}

function parseGiveawayEntryDocument(document: unknown): GiveawayEntry | null {
  const parsed = giveawayEntryDocumentSchema.safeParse(document);
  if (!parsed.success) {
    logSchemaFailure('giveaway entry document', parsed.error, document);
    return null;
  }
  return parsed.data as GiveawayEntry;
}

function parseGiveawayEntryList(documents: unknown[]): GiveawayEntry[] {
  const result: GiveawayEntry[] = [];
  for (const doc of documents) {
    const parsed = parseGiveawayEntryDocument(doc);
    if (parsed) result.push(parsed);
  }
  return result;
}

function getDocumentTimestamp(document: unknown): number {
  const record = (document ?? {}) as Record<string, unknown>;
  const updatedAt = Number(record.updatedAt);
  if (Number.isFinite(updatedAt)) return updatedAt;
  const createdAt = Number(record.createdAt);
  if (Number.isFinite(createdAt)) return createdAt;
  return 0;
}

function isEntryCompatibleWithGiveaway(
  entry: GiveawayEntry,
  giveaway: Pick<Giveaway, '$id' | 'messageId'>,
  userId?: string,
): boolean {
  if (entry.giveawayId !== giveaway.$id) return false;
  if (userId && entry.userId !== userId) return false;
  if (!giveaway.messageId) return !entry.giveawayMessageId;
  if (!entry.giveawayMessageId) return true;
  return entry.giveawayMessageId === giveaway.messageId;
}

function preferEntry(current: GiveawayEntry, next: GiveawayEntry): GiveawayEntry {
  const currentHas = Boolean(current.giveawayMessageId);
  const nextHas = Boolean(next.giveawayMessageId);
  if (currentHas !== nextHas) return nextHas ? next : current;
  const currentTs = getDocumentTimestamp(current);
  const nextTs = getDocumentTimestamp(next);
  if (currentTs !== nextTs) return nextTs > currentTs ? next : current;
  return next.$id > current.$id ? next : current;
}

function mergeEntriesByUser(entries: GiveawayEntry[]): GiveawayEntry[] {
  const merged = new Map<string, GiveawayEntry>();
  for (const entry of entries) {
    const existing = merged.get(entry.userId);
    merged.set(entry.userId, existing ? preferEntry(existing, entry) : entry);
  }
  return Array.from(merged.values());
}

function buildGiveawayEntryId(messageId: string, userId: string): string {
  const hash = createHash('sha256').update(`${messageId}:${userId}`).digest('hex').slice(0, 32);
  return `ge_${hash}`;
}

export const giveawayRepo = {
  async createGiveaway(data: Omit<Giveaway, keyof Models.Document | 'entries' | 'winnerIds' | 'announcementSent'>): Promise<Giveaway> {
    const { databases } = requireAppwriteClient();
    const { databaseId, giveaways } = getCollections();
    const payload = giveawayCreateSchema.parse(data);
    const created = await databases.createDocument(databaseId, giveaways, ID.unique(), {
      ...payload,
      entries: 0,
      winnerIds: [],
      announcementSent: false,
    });
    const parsed = parseGiveawayDocument(created);
    if (!parsed) throw new Error('Created giveaway document failed schema validation');
    return parsed;
  },

  async getGiveaway(id: string): Promise<Giveaway> {
    const { databases } = requireAppwriteClient();
    const { databaseId, giveaways } = getCollections();
    const doc = await databases.getDocument(databaseId, giveaways, id);
    const parsed = parseGiveawayDocument(doc);
    if (!parsed) throw new Error(`Invalid giveaway document: ${id}`);
    return parsed;
  },

  async updateGiveaway(id: string, data: Partial<Giveaway>): Promise<Giveaway> {
    const { databases } = requireAppwriteClient();
    const { databaseId, giveaways } = getCollections();
    const payload = giveawayUpdateSchema.parse(data);
    const updated = await databases.updateDocument(databaseId, giveaways, id, payload);
    const parsed = parseGiveawayDocument(updated);
    if (!parsed) throw new Error(`Invalid giveaway document after update: ${id}`);
    return parsed;
  },

  async createEntry(data: GiveawayEntryInput): Promise<GiveawayEntry> {
    const { databases } = requireAppwriteClient();
    const { databaseId, entries } = getCollections();
    const payload = giveawayEntryCreateSchema.parse(data);
    const documentId = payload.giveawayMessageId
      ? buildGiveawayEntryId(payload.giveawayMessageId, payload.userId)
      : ID.unique();
    const created = await databases.createDocument(databaseId, entries, documentId, payload);
    const parsed = parseGiveawayEntryDocument(created);
    if (!parsed) throw new Error('Created giveaway entry document failed schema validation');
    return parsed;
  },

  async getEntries(giveawayId: string): Promise<{ documents: GiveawayEntry[]; total: number }> {
    const { databases } = requireAppwriteClient();
    const { databaseId, entries } = getCollections();
    const result = await databases.listDocuments(databaseId, entries, [Query.equal('giveawayId', giveawayId)]);
    const documents = parseGiveawayEntryList(result.documents).filter(e => e.giveawayId === giveawayId);
    return { documents, total: documents.length };
  },

  async deleteEntry(id: string): Promise<void> {
    const { databases } = requireAppwriteClient();
    const { databaseId, entries } = getCollections();
    await databases.deleteDocument(databaseId, entries, id);
  },

  async findEntry(giveawayId: string, userId: string): Promise<GiveawayEntry | undefined> {
    const { databases } = requireAppwriteClient();
    const { databaseId, entries } = getCollections();
    const res = await databases.listDocuments(databaseId, entries, [
      Query.equal('giveawayId', giveawayId),
      Query.equal('userId', userId),
    ]);
    const compatible = parseGiveawayEntryList(res.documents).filter(
      e => e.giveawayId === giveawayId && e.userId === userId,
    );
    return compatible[0];
  },

  async findByMessageId(messageId: string): Promise<Giveaway | undefined> {
    const { databases } = requireAppwriteClient();
    const { databaseId, giveaways } = getCollections();
    const res = await databases.listDocuments(databaseId, giveaways, [Query.equal('messageId', messageId)]);
    const list = res.documents
      .map(d => parseGiveawayDocument(d))
      .filter((d): d is Giveaway => d !== null && d.messageId === messageId)
      .sort((a, b) => getDocumentTimestamp(b) - getDocumentTimestamp(a) || b.$id.localeCompare(a.$id));
    return list[0];
  },

  async listPendingAnnouncements(maxOverdueMs: number): Promise<Giveaway[]> {
    const { databases } = requireAppwriteClient();
    const { databaseId, giveaways } = getCollections();
    const res = await databases.listDocuments(databaseId, giveaways);
    const now = Date.now();
    return res.documents
      .map(d => parseGiveawayDocument(d))
      .filter((d): d is Giveaway => d !== null)
      .filter(g => !g.announcementSent)
      .filter(g => {
        const endTime = normalizeGiveawayEndTime(g.endTime);
        return Number.isFinite(endTime) && endTime > 0 && endTime >= now - maxOverdueMs;
      })
      .sort((a, b) => normalizeGiveawayEndTime(a.endTime) - normalizeGiveawayEndTime(b.endTime));
  },

  async getEntriesForGiveaway(giveaway: Pick<Giveaway, '$id' | 'messageId'>): Promise<{ documents: GiveawayEntry[]; total: number }> {
    const { databases } = requireAppwriteClient();
    const { databaseId, entries } = getCollections();
    const results: GiveawayEntry[] = [];

    if (giveaway.messageId) {
      const byMessage = await databases.listDocuments(databaseId, entries, [
        Query.equal('giveawayMessageId', giveaway.messageId),
      ]);
      results.push(...parseGiveawayEntryList(byMessage.documents).filter(e => isEntryCompatibleWithGiveaway(e, giveaway)));
    }

    const byId = await this.getEntries(giveaway.$id);
    results.push(...byId.documents.filter(e => isEntryCompatibleWithGiveaway(e, giveaway)));

    const documents = mergeEntriesByUser(results);
    return { documents, total: documents.length };
  },

  async findEntryForGiveaway(giveaway: Pick<Giveaway, '$id' | 'messageId'>, userId: string): Promise<GiveawayEntry | undefined> {
    const { databases } = requireAppwriteClient();
    const { databaseId, entries } = getCollections();

    if (giveaway.messageId) {
      const messageScopedId = buildGiveawayEntryId(giveaway.messageId, userId);
      const direct = await databases.getDocument(databaseId, entries, messageScopedId).catch(() => null);
      const parsedDirect = direct ? parseGiveawayEntryDocument(direct) : null;
      if (parsedDirect && isEntryCompatibleWithGiveaway(parsedDirect, giveaway, userId) && parsedDirect.giveawayMessageId === giveaway.messageId) {
        return parsedDirect;
      }

      const byMessage = await databases.listDocuments(databaseId, entries, [
        Query.equal('giveawayMessageId', giveaway.messageId),
        Query.equal('userId', userId),
      ]);
      const compatibleMessageEntries = parseGiveawayEntryList(byMessage.documents)
        .filter(e => isEntryCompatibleWithGiveaway(e, giveaway, userId) && e.giveawayMessageId === giveaway.messageId)
        .sort((a, b) => getDocumentTimestamp(b) - getDocumentTimestamp(a) || b.$id.localeCompare(a.$id));
      if (compatibleMessageEntries[0]) return compatibleMessageEntries[0];
    }

    const legacyEntry = await this.findEntry(giveaway.$id, userId);
    if (!legacyEntry) return undefined;
    if (!isEntryCompatibleWithGiveaway(legacyEntry, giveaway, userId)) return undefined;
    return legacyEntry;
  },
};
