export function createShutdownCleanup (options: {
  destroy: () => void | Promise<void>;
  releaseLocks: () => Promise<void>;
  report: (reason: string, error?: unknown) => void;
  exit: (code: number) => void;
  timeoutMs?: number;
}) {
  let started = false;
  return async (reason: string, error?: unknown) => {
    if (started) return;
    started = true;
    let code = reason === 'SIGINT' || reason === 'SIGTERM' ? 0 : 1;
    options.report(reason, error);
    const deadline = setTimeout(() => options.exit(1), options.timeoutMs ?? 10_000);
    deadline.unref();
    try {
      await options.destroy();
      await options.releaseLocks();
    } catch (cleanupError) {
      code = 1;
      options.report('cleanup failure', cleanupError);
    } finally {
      clearTimeout(deadline);
      options.exit(code);
    }
  };
}
