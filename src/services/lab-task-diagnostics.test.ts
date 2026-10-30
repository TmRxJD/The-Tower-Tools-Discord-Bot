import { expect, it, vi } from 'vitest';
import { LabTaskDiagnostics } from './lab-task-diagnostics';

const event = { id: 'private-interaction', createdTimestamp: 1000, deferred: true, replied: false };

it('keeps per-task stages and timings separate across overlapping flows', async () => {
  let now = 1000;
  const clock = vi.spyOn(Date, 'now').mockImplementation(() => now);
  try {
    const first = new LabTaskDiagnostics(event, 'speedup', 'private-session');
    const second = new LabTaskDiagnostics(event, 'cleanup', 'private-session');
    await first.run('persist', async () => { now += 25; });
    await second.run('cleanup-build', async () => { now += 10; });
    await expect(first.run('render', async () => { now += 40; throw new Error('private contents'); })).rejects.toThrow();
    expect(first.stage()).toBe('render');
    expect(first.details()).toMatchObject({ operation: 'lab', action: 'speedup', stageDurationsMs: { persist: 25, render: 40 } });
    expect(second.stage()).toBe('cleanup-build');
    expect(second.details()).toMatchObject({ action: 'cleanup', stageDurationsMs: { 'cleanup-build': 10 } });
    expect(first.details().sessionCorrelation).toBe(second.details().sessionCorrelation);
    expect(JSON.stringify(first.details())).not.toContain('private');
  } finally { clock.mockRestore(); }
});

it('bounds payload summaries and never includes contents, IDs, labels, filenames or URLs', async () => {
  const diagnostics = new LabTaskDiagnostics(event, 'private-action', 'private-session');
  const payload = { content: 'private content', files: [{ name: 'private.png', attachment: Buffer.from('private bytes') }],
    components: Array.from({ length: 100 }, () => ({ components: Array.from({ length: 100 }, () => ({ type: 2, custom_id: 'private-user-id', label: 'private label', url: 'https://private' })) })),
    embeds: [{ title: 'private title', fields: [{ name: 'private name', value: 'private value' }] }] };
  await expect(diagnostics.run('edit-response', async () => { throw new Error('private error'); }, { method: 'PATCH', route: 'original-response', payload })).rejects.toThrow();
  const details = diagnostics.details();
  const shape = details.payload as { rowCount: number; rows: Array<{ components: unknown[] }> };
  expect(shape.rowCount).toBe(100);
  expect(shape.rows).toHaveLength(10);
  expect(shape.rows.every(row => row.components.length === 5)).toBe(true);
  expect(details.action).toBe('unknown');
  expect(JSON.stringify(details)).not.toMatch(/private|https/);
  expect(JSON.stringify(details).length).toBeLessThan(8000);
});

it('contains diagnostic serialization errors and uses the submitted modal lifecycle', async () => {
  const diagnostics = new LabTaskDiagnostics(event, 'range', 'private-session');
  const modal = { ...event, id: 'private-modal', deferred: false };
  diagnostics.useInteraction(modal);
  expect(diagnostics.interaction()).toBe(modal);
  await expect(diagnostics.run('edit-response', async () => { throw new Error('private'); }, {
    method: 'PATCH', route: 'original-response', payload: { components: [{ toJSON: () => { throw new Error('private'); } }] },
  })).rejects.toThrow();
  expect(diagnostics.details().payload).toMatchObject({ rowCount: 1, serializationFailed: true });
  expect(JSON.stringify(diagnostics.details())).not.toContain('private');
});
