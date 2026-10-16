import { logger } from '../core/logger';

interface UpdateInteraction {
  deferred: boolean;
  replied: boolean;
  deferUpdate(): Promise<unknown>;
}

const acknowledgements = new WeakMap<UpdateInteraction, Promise<unknown>>();

/** Never retry an ambiguous acknowledgement, including concurrent calls for the same event. */
export async function deferCollectorUpdate(interaction: UpdateInteraction): Promise<void> {
  if (interaction.deferred || interaction.replied) return;
  let acknowledgement = acknowledgements.get(interaction);
  if (!acknowledgement) {
    // Cache the promise before invoking the callback, including synchronous failures.
    acknowledgement = Promise.resolve().then(() => interaction.deferUpdate());
    acknowledgements.set(interaction, acknowledgement);
  }
  await acknowledgement;
}

/** EventEmitter does not await async listeners. Contain failures without sending another callback. */
export async function runCollectorTask(label: string, task: () => Promise<unknown>): Promise<void> {
  try {
    await task();
  } catch (error) {
    const record = error && typeof error === 'object' ? error as { code?: unknown } : {};
    const code = record.code;
    const terminal = code === 10062 || code === 40060 || code === 'InteractionAlreadyReplied';
    const redact = (value: string) => value.replace(/https?:\/\/\S+/g, '[redacted URL]');
    const details = {
      code,
      name: error instanceof Error ? error.name : typeof error,
      message: redact(error instanceof Error ? error.message : String(error)),
      stack: error instanceof Error ? redact(error.stack ?? '') : undefined,
    };
    if (terminal) logger.warn(`${label}: interaction acknowledgement unavailable`, details);
    else logger.error(`${label}: task failed`, details);
  }
}
