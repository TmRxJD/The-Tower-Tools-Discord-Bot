import { expect, it } from 'vitest';
import { atOperationStage, diagnosticRef, failureDiagnostics } from './operation-diagnostics';
it('retains the failing stage and structured codes without raw data, messages or arbitrary codes', async () => {
  const error = Object.assign(new Error('secret report and private URL'), { code: 'SQLITE_BUSY', status: 503, requestBody: { secret: 'private' } });
  await expect(atOperationStage('rxdb-state', 'seed-read', async () => { throw error; })).rejects.toBe(error);
  await expect(atOperationStage('outer', 'outer', async () => { throw error; })).rejects.toBe(error);
  expect(failureDiagnostics(error)).toMatchObject({ operation: 'rxdb-state', stage: 'seed-read', code: 'SQLITE_BUSY', status: 503 });
  expect(JSON.stringify(failureDiagnostics(error))).not.toMatch(/secret|private|report|URL/);
  expect(failureDiagnostics({ code: 'secret-token', name: 'secret-token', cause: { code: 'ECONNRESET' } })).toEqual({ code: undefined, causeCode: 'ECONNRESET', status: undefined });
  expect(diagnosticRef('private-user-id')).toMatch(/^[a-f0-9]{16}$/);
});
