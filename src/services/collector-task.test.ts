import { beforeEach, expect, it, vi } from 'vitest';
const logs = vi.hoisted(() => ({ warn: vi.fn(), error: vi.fn() }));
vi.mock('../core/logger', () => ({ logger: logs }));
import { deferCollectorUpdate, runCollectorTask } from './collector-task';

beforeEach(() => vi.clearAllMocks());

it('acknowledges concurrent/repeated calls once and skips already acknowledged events', async () => {
  const event = { deferred: false, replied: false, deferUpdate: vi.fn().mockResolvedValue(undefined) };
  await Promise.all([deferCollectorUpdate(event), deferCollectorUpdate(event)]);
  await deferCollectorUpdate(event);
  expect(event.deferUpdate).toHaveBeenCalledTimes(1);
  for (const flags of [{ deferred: true, replied: false }, { deferred: false, replied: true }]) {
    const handled = { ...flags, deferUpdate: vi.fn() };
    await deferCollectorUpdate(handled);
    expect(handled.deferUpdate).not.toHaveBeenCalled();
  }
});

it.each([10062, 40060, 'InteractionAlreadyReplied', 'ECONNRESET', 'UND_ERR_CONNECT_TIMEOUT', 50035])(
  'contains failed acknowledgement %s without retry or continuing the task', async code => {
    const failure = Object.assign(new Error('callback failed'), { code });
    const event = { deferred: false, replied: false, deferUpdate: vi.fn().mockRejectedValue(failure) };
    const save = vi.fn();
    const task = () => runCollectorTask('Lab component', async () => {
      await deferCollectorUpdate(event);
      save();
    });
    await expect(task()).resolves.toBeUndefined();
    await expect(task()).resolves.toBeUndefined();
    expect(event.deferUpdate).toHaveBeenCalledTimes(1);
    expect(save).not.toHaveBeenCalled();
    const terminal = code === 10062 || code === 40060 || code === 'InteractionAlreadyReplied';
    expect(terminal ? logs.warn : logs.error).toHaveBeenCalledTimes(2);
  },
);

it('retains unexpected diagnostics but redacts callback URLs and contains synchronous failures', async () => {
  const failure = new Error('unexpected https://discord.com/api/interactions/private-token/callback');
  await runCollectorTask('Lab component', async () => { throw failure; });
  expect(logs.error).toHaveBeenCalledWith('Lab component: task failed', expect.objectContaining({
    name: 'Error', message: 'unexpected [redacted URL]', stack: expect.stringContaining('collector-task.test.ts'),
  }));
  expect(JSON.stringify(logs.error.mock.calls)).not.toContain('private-token');
  const event = { deferred: false, replied: false, deferUpdate: vi.fn(() => { throw failure; }) };
  await runCollectorTask('Lab component', () => deferCollectorUpdate(event));
  await runCollectorTask('Lab component', () => deferCollectorUpdate(event));
  expect(event.deferUpdate).toHaveBeenCalledTimes(1);
});
