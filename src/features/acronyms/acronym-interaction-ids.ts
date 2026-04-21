export const ACRONYM_REQUEST_APPROVE_PREFIX = 'acronym-request:approve:';
export const ACRONYM_REQUEST_DENY_PREFIX = 'acronym-request:deny:';

function parseId(prefix: string, customId: string): string {
  if (!customId.startsWith(prefix)) {
    throw new Error(`Invalid acronym request custom id: ${customId}`);
  }

  return customId.slice(prefix.length);
}

export function createAcronymRequestApproveCustomId(proposalId: string): string {
  return `${ACRONYM_REQUEST_APPROVE_PREFIX}${proposalId}`;
}

export function createAcronymRequestDenyCustomId(proposalId: string): string {
  return `${ACRONYM_REQUEST_DENY_PREFIX}${proposalId}`;
}

export function parseAcronymRequestApproveCustomId(customId: string): string {
  return parseId(ACRONYM_REQUEST_APPROVE_PREFIX, customId);
}

export function parseAcronymRequestDenyCustomId(customId: string): string {
  return parseId(ACRONYM_REQUEST_DENY_PREFIX, customId);
}