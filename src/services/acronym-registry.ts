import { trackerAiAcronyms, type AcronymExpansionResult } from '@tmrxjd/platform/ai';
import {
  getToolsBotDb,
  type AcronymOverrideRecord,
  type AcronymProposalAction,
  type AcronymProposalRecord,
  type AcronymProposalStatus,
  type AcronymRemovalRecord,
} from './idb';

export interface ManagedAcronymEntry {
  acronym: string;
  expansion: string;
  source: 'base' | 'custom';
}

export interface AcronymMutationPreview {
  action: AcronymProposalAction;
  acronym: string;
  existingExpansion: string | null;
  nextExpansion: string | null;
  source: 'base' | 'custom' | null;
}

const CASE_SENSITIVE_KEYS = new Set(['is', 'as']);

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function normalizeAcronymKey(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function normalizeExpansionValue(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function getBaseAcronymMap(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(trackerAiAcronyms).map(([key, expansion]) => [normalizeAcronymKey(key), String(expansion)]),
  );
}

export function mergeAcronymMaps(
  baseMap: Record<string, string>,
  overrides: AcronymOverrideRecord[],
  removals: AcronymRemovalRecord[],
): Record<string, string> {
  const merged = { ...baseMap };

  for (const record of overrides) {
    merged[normalizeAcronymKey(record.key)] = normalizeExpansionValue(record.expansion);
  }

  for (const record of removals) {
    delete merged[normalizeAcronymKey(record.key)];
  }

  return merged;
}

export function expandAcronymsWithMap(text: string, acronymMap: Record<string, string>): AcronymExpansionResult {
  let changed = false;
  let output = text;
  const keys = Object.keys(acronymMap).sort((left, right) => right.length - left.length);
  const placeholders: string[] = [];

  for (const keyRaw of keys) {
    const replacement = String(acronymMap[keyRaw] ?? '').trim();
    if (!replacement) {
      continue;
    }

    const isCaseSensitive = CASE_SENSITIVE_KEYS.has(keyRaw.toLowerCase());
    const matchKey = isCaseSensitive ? keyRaw.toUpperCase() : keyRaw;
    const escaped = escapeRegex(matchKey);
    const flags = isCaseSensitive ? 'g' : 'gi';
    const regex = new RegExp(`(^|[^A-Za-z0-9])(${escaped})(?=$|[^A-Za-z0-9])`, flags);
    const placeholder = `\u0001${placeholders.length}\u0001`;
    placeholders.push(`**${replacement}**`);

    output = output.replace(regex, (_full, prefix: string) => {
      changed = true;
      return `${prefix ?? ''}${placeholder}`;
    });
  }

  for (let index = 0; index < placeholders.length; index += 1) {
    output = output.split(`\u0001${index}\u0001`).join(placeholders[index]);
  }

  return { text: output, changed };
}

async function getAcronymState() {
  const db = getToolsBotDb();
  const [overrides, removals] = await Promise.all([
    db.acronymOverrides.toArray(),
    db.acronymRemovals.toArray(),
  ]);

  const overrideKeys = new Set(overrides.map(record => normalizeAcronymKey(record.key)));
  const effectiveMap = mergeAcronymMaps(getBaseAcronymMap(), overrides, removals);

  return {
    effectiveMap,
    overrideKeys,
  };
}

export async function expandManagedAcronymsInText(text: string): Promise<AcronymExpansionResult> {
  const { effectiveMap } = await getAcronymState();
  return expandAcronymsWithMap(text, effectiveMap);
}

export async function listManagedAcronyms(): Promise<ManagedAcronymEntry[]> {
  const { effectiveMap, overrideKeys } = await getAcronymState();
  return Object.entries(effectiveMap)
    .map(([acronym, expansion]) => ({
      acronym,
      expansion,
      source: overrideKeys.has(acronym) ? 'custom' as const : 'base' as const,
    }))
    .sort((left, right) => left.acronym.localeCompare(right.acronym));
}

export async function getManagedAcronymPreview(
  action: AcronymProposalAction,
  rawAcronym: string,
  rawExpansion?: string,
): Promise<AcronymMutationPreview> {
  const acronym = normalizeAcronymKey(rawAcronym);
  const nextExpansion = action === 'add' && rawExpansion ? normalizeExpansionValue(rawExpansion) : null;
  const entries = await listManagedAcronyms();
  const current = entries.find(entry => entry.acronym === acronym) ?? null;

  return {
    action,
    acronym,
    existingExpansion: current?.expansion ?? null,
    nextExpansion,
    source: current?.source ?? null,
  };
}

export async function applyAcronymMutation(input: {
  action: AcronymProposalAction;
  acronym: string;
  expansion?: string | null;
  actorUserId: string;
}): Promise<void> {
  const db = getToolsBotDb();
  const normalizedKey = normalizeAcronymKey(input.acronym);
  const updatedAt = Date.now();

  if (input.action === 'add') {
    const normalizedExpansion = normalizeExpansionValue(input.expansion ?? '');
    if (!normalizedExpansion) {
      throw new Error('Acronym expansion is required for add actions.');
    }

    await db.acronymOverrides.put({
      key: normalizedKey,
      expansion: normalizedExpansion,
      updatedAt,
      updatedByUserId: input.actorUserId,
    });
    await db.acronymRemovals.delete(normalizedKey);
    return;
  }

  await db.acronymOverrides.delete(normalizedKey);
  await db.acronymRemovals.put({
    key: normalizedKey,
    updatedAt,
    updatedByUserId: input.actorUserId,
  });
}

export async function getAcronymProposal(proposalId: string): Promise<AcronymProposalRecord | undefined> {
  return getToolsBotDb().acronymProposals.get(proposalId);
}

export async function saveAcronymProposal(proposal: AcronymProposalRecord): Promise<void> {
  await getToolsBotDb().acronymProposals.put(proposal);
}

export async function updateAcronymProposalStatus(input: {
  proposalId: string;
  status: AcronymProposalStatus;
  reviewedByUserId: string;
}): Promise<AcronymProposalRecord | null> {
  const existing = await getAcronymProposal(input.proposalId);
  if (!existing) {
    return null;
  }

  const updated: AcronymProposalRecord = {
    ...existing,
    status: input.status,
    reviewedAt: Date.now(),
    reviewedByUserId: input.reviewedByUserId,
  };
  await saveAcronymProposal(updated);
  return updated;
}