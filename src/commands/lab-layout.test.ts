import { expect, it, vi } from 'vitest';
import { DiscordAPIError } from 'discord.js';
import { defaultUserLabSettings } from '@tmrxjd/platform/tools';
import { ids, issues, mocks, session } from './lab-layout-test-support';

async function selectUw(s: Awaited<ReturnType<typeof session>>) {
  await s.emit(ids.category, ['ultimate weapon']);
  await s.emit(ids.uwType, ['gt']);
  const lab = s.captures.at(-1).body.components[2].components[0].options[0].value;
  await s.emit(ids.lab, [lab]);
}

function controlIds(body: any): string[] {
  return body.components.flatMap((row: any) => row.components.filter((c: any) => c.type === 2).map((c: any) => c.custom_id));
}

it('keeps existing layouts and all controls, merging Share only at the five-row boundary', async () => {
  const s = await session(false);
  expect(s.captures.at(-1).body.components.length).toBe(3);
  await s.emit(ids.category, ['attack']);
  expect(s.captures.at(-1).body.components.length).toBe(4);
  const lab = s.captures.at(-1).body.components[1].components[0].options[0].value;
  await s.emit(ids.lab, [lab]);
  const normal = s.captures.at(-1).body;
  expect(normal.components.length).toBe(5);
  expect(normal.components.at(-1).components.map((c: any) => c.custom_id)).toEqual(['lab_share']);
  await selectUw(s);
  const uw = s.captures.at(-1).body;
  expect(issues(uw)).toEqual([]);
  expect(uw.components.length).toBe(5);
  expect(uw.components.at(-1).components.length).toBe(5);
  expect(controlIds(uw)).toEqual([ids.settings, ids.range, ids.toggleHideMaxed, ids.close, 'lab_share']);
  expect(uw.components.at(-1).components.map((c: any) => c.label)).toEqual([
    ...normal.components.at(-2).components.map((c: any) => c.label), 'Share to Channel',
  ]);
  expect(uw.components.at(-1).components.at(-1).disabled).toBe(false);
});

it('validates all 211 reachable selections including all 33 UW labs through the actual serializer', async () => {
  const s = await session(false);
  const categories = s.captures[0].body.components[0].components[0].options.map((o: any) => o.value);
  const violations: unknown[] = [];
  let selections = 0;
  let uwSelections = 0;
  for (const category of categories) {
    await s.emit(ids.category, [category]);
    const types = category === 'ultimate weapon' ? s.captures.at(-1).body.components[1].components[0].options.map((o: any) => o.value) : [null];
    for (const type of types) {
      if (type) await s.emit(ids.uwType, [type]);
      const row = type ? 2 : 1;
      const labs = s.captures.at(-1).body.components[row].components[0].options.map((o: any) => o.value).filter((v: string) => v !== 'none');
      for (const lab of labs) {
        await s.emit(ids.lab, [lab]);
        selections += 1;
        if (type) uwSelections += 1;
        const captured = s.captures.at(-1);
        violations.push(...issues(captured.body));
        expect(controlIds(captured.body)).toEqual([ids.settings, ids.range, ids.toggleHideMaxed, ids.close, 'lab_share']);
      }
    }
  }
  expect({ categories: categories.length, selections, uwSelections }).toEqual({ categories: 12, selections: 211, uwSelections: 33 });
  expect(violations).toEqual([]);
}, 30_000);

it('keeps refresh, settings, range, speedup, toggle and disabled cleanup layouts valid', async () => {
  mocks.resolve.mockResolvedValueOnce({ storageUserId: 'offline-user', state: { ...defaultUserLabSettings, labLevels: {} } });
  const s = await session(false);
  await selectUw(s);
  for (const [action, values, button] of [[ids.speedup, ['2'], false], [ids.toggleHideMaxed, [], true], [ids.settings, [], true], [ids.range, [], true]] as const) {
    await s.emit(action, [...values], button);
    expect(issues(s.captures.at(-1).body)).toEqual([]);
  }
  expect(s.modal.components.length).toBe(2);
  expect(s.modal.custom_id.length).toBeLessThanOrEqual(100);
  const before = s.captures.length;
  s.collector.emit('end');
  await vi.waitFor(() => expect(s.captures.length).toBeGreaterThan(before), { interval: 1 });
  const cleanup = s.captures.at(-1);
  expect(issues(cleanup.body)).toEqual([]);
  expect(cleanup.body.components.every((r: any) => r.components.every((c: any) => c.disabled))).toBe(true);
  expect(controlIds(cleanup.body)).toEqual([ids.settings, ids.range, ids.toggleHideMaxed, ids.close, 'lab_share']);
  expect(cleanup.body.attachments).toBeUndefined();
  expect(cleanup.files).toHaveLength(0);
  expect(s.interaction.client.scopedInteractionSessions.unregister).toHaveBeenCalledWith('lab:offline-interaction');
});

it('retains a valid disabled layout after a rejected refresh and logs only safe validation context', async () => {
  const s = await session(false);
  await selectUw(s);
  const error = new DiscordAPIError({ code: 50035, message: 'private content', errors: { components: { _errors: [{ code: 'BASE_TYPE_MAX_LENGTH', message: 'private value' }] } } }, 50035, 400, 'PATCH', 'https://discord.com/api/webhooks/private-id/private-token', { body: { content: 'private content' }, files: [] });
  s.failNext(error);
  await s.emit(ids.speedup, ['3']);
  await vi.waitFor(() => expect(mocks.error).toHaveBeenCalledOnce(), { interval: 1 });
  expect(mocks.error).toHaveBeenCalledWith('Lab component: task failed', expect.objectContaining({
    operation: 'lab', action: 'speedup', stage: 'edit-response', correlation: expect.stringMatching(/^[a-f0-9]{16}$/),
    sessionCorrelation: expect.stringMatching(/^[a-f0-9]{16}$/), deferred: true,
    request: { method: 'PATCH', route: 'original-response' },
    validationIssues: [{ path: 'components', code: 'BASE_TYPE_MAX_LENGTH' }],
    payload: expect.objectContaining({ rowCount: 5, uploadCount: 1 }),
  }));
  expect(JSON.stringify(mocks.error.mock.calls)).not.toMatch(/private|offline-user|offline-interaction|offline-component|https/);
  const before = s.captures.length;
  s.collector.emit('end');
  await vi.waitFor(() => expect(s.captures.length).toBeGreaterThan(before), { interval: 1 });
  expect(issues(s.captures.at(-1).body)).toEqual([]);
  expect(s.captures.at(-1).body.components.every((r: any) => r.components.every((c: any) => c.disabled))).toBe(true);
  expect(mocks.error).toHaveBeenCalledOnce();
});

it('preserves the real PNG upload and embed attachment reference through refresh and cleanup', async () => {
  const renderer = await vi.importActual<typeof import('../services/table-chart-render')>('../services/table-chart-render');
  mocks.render.mockImplementation(renderer.renderTableChartPng);
  const s = await session(false);
  await selectUw(s);
  await s.emit(ids.speedup, ['2']);
  const chart = s.captures.at(-1);
  expect(issues(chart.body)).toEqual([]);
  expect(chart.files).toHaveLength(1);
  expect(chart.files[0].name).toBe('lab-chart.png');
  expect(chart.files[0].data.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  expect(chart.body.attachments).toEqual([{ id: '0', description: undefined }]);
  expect(chart.body.embeds[0].image.url).toBe('attachment://lab-chart.png');
  const before = s.captures.length;
  s.collector.emit('end');
  await vi.waitFor(() => expect(s.captures.length).toBeGreaterThan(before), { interval: 1 });
  expect(s.captures.at(-1).body.attachments).toBeUndefined();
  expect(s.captures.at(-1).files).toHaveLength(0);
  expect(s.captures.at(-1).body.embeds[0].image).toBeUndefined();
});

it('identifies a rejected cleanup edit without logging the rejected payload', async () => {
  const s = await session(false);
  await selectUw(s);
  s.failNext(new DiscordAPIError({ code: 50035, message: 'private', errors: { embeds: { 0: { _errors: [{ code: 'BASE_TYPE_REQUIRED', message: 'private' }] } } } }, 50035, 400, 'PATCH', 'https://private', { body: {}, files: [] }));
  s.collector.emit('end');
  await vi.waitFor(() => expect(mocks.error).toHaveBeenCalledOnce(), { interval: 1 });
  expect(mocks.error).toHaveBeenCalledWith('Lab session cleanup: task failed', expect.objectContaining({
    operation: 'lab', action: 'cleanup', stage: 'cleanup-edit',
    request: { method: 'PATCH', route: 'original-response' },
    validationIssues: [{ path: 'embeds.0', code: 'BASE_TYPE_REQUIRED' }],
    payload: expect.objectContaining({ rowCount: 5, uploadCount: 0 }),
  }));
  expect(JSON.stringify(mocks.error.mock.calls)).not.toMatch(/private|https|offline-user/);
});
