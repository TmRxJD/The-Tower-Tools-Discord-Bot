import { afterEach, describe, expect, it, vi } from 'vitest';
import { createShutdownCleanup } from './shutdown';
afterEach(() => vi.useRealTimers());
describe('bounded shutdown', () => {
  it('disconnects before releasing locks and exits once on fatal failure', async () => {
    const order: string[] = []; const exit = vi.fn();
    const cleanup = createShutdownCleanup({ destroy: () => { order.push('destroy'); }, releaseLocks: async () => { order.push('release'); }, report: vi.fn(), exit });
    await cleanup('unhandledRejection', new Error('fatal')); await cleanup('SIGINT');
    expect(order).toEqual(['destroy', 'release']); expect(exit).toHaveBeenCalledExactlyOnceWith(1);
  });
  it('exits cleanly for intentional stops', async () => {
    const exit = vi.fn(); await createShutdownCleanup({ destroy: vi.fn(), releaseLocks: async () => {}, report: vi.fn(), exit })('SIGINT');
    expect(exit).toHaveBeenCalledWith(0);
  });
  it('forces an exit if disconnect stalls', async () => {
    vi.useFakeTimers(); const exit = vi.fn();
    void createShutdownCleanup({ destroy: () => new Promise<void>(() => {}), releaseLocks: async () => {}, report: vi.fn(), exit, timeoutMs: 100 })('SIGTERM');
    await vi.advanceTimersByTimeAsync(101); expect(exit).toHaveBeenCalledWith(1);
  });
});
