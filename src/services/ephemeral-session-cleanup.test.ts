import { expect, it, vi } from 'vitest';
import { cleanupEphemeralSession, ephemeralCollectorTimeout } from './ephemeral-session-cleanup';

it('ends the lab collector before the original token deadline, including time spent rendering', () => {
  expect(ephemeralCollectorTimeout(1000, 900000, 6000)).toBe(865000);
  expect(ephemeralCollectorTimeout(1000, 60000, 6000)).toBe(60000);
  expect(ephemeralCollectorTimeout(1000, 900000, 901000)).toBe(0);
});
it('does not attempt any edit once the interaction token has expired', async () => {
  const edit = vi.fn();
  expect(await cleanupEphemeralSession(1000, edit, 901000)).toBe('expired');
  expect(edit).not.toHaveBeenCalled();
});
it('edits valid cleanup exactly once', async () => {
  const edit = vi.fn().mockResolvedValue(undefined);
  expect(await cleanupEphemeralSession(1000, edit, 2000)).toBe('edited');
  expect(edit).toHaveBeenCalledTimes(1);
});
it.each([50027, 10015, 10008])('retires unavailable cleanup %s without retry or another response', async code => {
  const edit = vi.fn().mockRejectedValue({ code });
  expect(await cleanupEphemeralSession(1000, edit, 2000)).toBe('unavailable');
  expect(edit).toHaveBeenCalledTimes(1);
});
it.each([50013, 50035, 'ECONNRESET', undefined])('preserves unexpected cleanup failures %s for normal diagnostics', async code => {
  const error = Object.assign(new Error('failure'), { code });
  const edit = vi.fn().mockRejectedValue(error);
  await expect(cleanupEphemeralSession(1000, edit, 2000)).rejects.toBe(error);
  expect(edit).toHaveBeenCalledTimes(1);
});
