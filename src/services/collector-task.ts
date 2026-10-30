import { logger } from '../core/logger';
import { diagnosticRef, failureDiagnostics } from './operation-diagnostics';

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
export async function runCollectorTask(label: string, task: () => Promise<unknown>, context?: {
  interaction: () => { id: string; createdTimestamp: number; deferred: boolean; replied: boolean };
  stage: () => string;
  details?: () => Record<string, unknown>;
}): Promise<void> {
  const startedAt = Date.now();
  try {
    await task();
  } catch (error) {
    const record = error && typeof error === 'object' ? error as { code?: unknown } : {};
    const code = record.code;
    const terminal = code === 10062 || code === 40060 || code === 'InteractionAlreadyReplied';
    const interaction = context?.interaction();
    const details = {
      ...failureDiagnostics(error),
      pid: process.pid,
      durationMs: Date.now() - startedAt,
      outcome: terminal ? 'acknowledgement-unavailable' : 'failed',
      ...context?.details?.(),
      ...(context && interaction ? { correlation: diagnosticRef(interaction.id), stage: context.stage(),
        ageMs: Date.now() - interaction.createdTimestamp,
        deferred: interaction.deferred, replied: interaction.replied } : {}),
    };
    if (terminal) logger.warn(`${label}: interaction acknowledgement unavailable`, details);
    else logger.error(`${label}: task failed`, details);
  }
}
