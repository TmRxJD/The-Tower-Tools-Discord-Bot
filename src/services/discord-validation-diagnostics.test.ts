import { expect, it } from 'vitest';
import { DiscordAPIError } from 'discord.js';
import { failureDiagnostics } from './operation-diagnostics';

it('retains safe Discord validation paths and codes without messages, identities or request bodies', () => {
  const error = new DiscordAPIError({ code: 50035, message: 'private message', errors: {
    components: { _errors: [{ code: 'BASE_TYPE_MAX_LENGTH', message: 'private value' }] },
    embeds: { 0: { fields: { 2: { value: { _errors: [{ code: 'BASE_TYPE_REQUIRED', message: 'private content' }] } } } } },
  } }, 50035, 400, 'PATCH', 'https://discord.com/api/webhooks/private-identity/private-token', { body: { content: 'private content' }, files: [] });
  const details = failureDiagnostics(error);
  expect(details).toMatchObject({ code: 50035, status: 400, validationIssues: [
    { path: 'components', code: 'BASE_TYPE_MAX_LENGTH' },
    { path: 'embeds.0.fields.2.value', code: 'BASE_TYPE_REQUIRED' },
  ] });
  expect(JSON.stringify(details)).not.toMatch(/private|https|requestBody|rawError/);
});

it('bounds traversal and redacts unknown field keys and codes', () => {
  const errors: Record<string, unknown> = { 'private-user-id': { _errors: [{ code: 'PRIVATE_TOKEN', message: 'private' }] } };
  errors.components = Object.fromEntries(Array.from({ length: 100 }, (_, i) => [i, { _errors: [{ code: 'BASE_TYPE_REQUIRED', message: 'private' }] }]));
  errors.loop = errors;
  const details = failureDiagnostics({ code: 50035, status: 400, rawError: { errors } });
  expect(details).toHaveProperty('validationTruncated', true);
  const issues = details.validationIssues as Array<{ path: string; code: string }>;
  expect(issues.length).toBeLessThanOrEqual(16);
  expect(issues).toContainEqual({ path: '*', code: 'other' });
  expect(JSON.stringify(details)).not.toMatch(/private|PRIVATE_TOKEN|loop/);
  expect(JSON.stringify(details).length).toBeLessThan(2500);
});
