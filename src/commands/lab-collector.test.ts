import { EventEmitter } from 'node:events';
import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  save: vi.fn(), resolve: vi.fn(), reconcile: vi.fn(), warn: vi.fn(), error: vi.fn(),
}));
vi.mock('../core/logger', () => ({ logger: { warn: mocks.warn, error: mocks.error } }));
vi.mock('../services/user-lab-db', () => ({
  getUserLabSettings: vi.fn(), saveUserLabSettings: mocks.save, reconcileUserLabSettings: mocks.reconcile,
}));
vi.mock('../services/user-storage-resolution', () => ({ resolveUserStorageState: mocks.resolve }));
vi.mock('../services/cloud-reconcile-ui', () => ({ runCloudReconcileUi: vi.fn() }));
vi.mock('../services/table-chart-render', () => ({ renderTableChartPng: vi.fn() }));
vi.mock('../services/command-share', () => ({ appendShareButtonRow: (rows: unknown) => rows, shareCurrentRender: vi.fn() }));
import { labCommand } from './lab';
import { getBotConfig } from '../config/bot-config';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolve.mockResolvedValue({ storageUserId: 'synthetic', state: {
    labSpeed: 1, labRelic: 0, labDiscount: 0, speedUp: 1, hideMaxedLabs: false, labLevels: {},
  } });
  mocks.save.mockResolvedValue(undefined);
  mocks.reconcile.mockResolvedValue({});
});

async function session() {
  const collector = new EventEmitter();
  const unregister = vi.fn();
  const interaction = {
    id: 'synthetic', createdTimestamp: Date.now(), isChatInputCommand: () => true, user: { id: 'synthetic', username: 'synthetic' },
    deferReply: vi.fn().mockResolvedValue(undefined), editReply: vi.fn().mockResolvedValue(undefined),
    fetchReply: vi.fn().mockResolvedValue({ id: 'synthetic', createMessageComponentCollector: vi.fn((options: { time: number }) => { void options; return collector; }) }),
    client: { scopedInteractionSessions: { register: vi.fn(), unregister } },
  };
  await labCommand.execute(interaction as unknown as Parameters<typeof labCommand.execute>[0]);
  return { collector, interaction, unregister };
}

it.each([10062, 'ECONNRESET', 50035])('contains actual selector callback error %s before saving', async code => {
  const { collector, interaction, unregister } = await session();
  const component = {
    user: { id: 'synthetic' }, customId: getBotConfig().commands.lab.ids.speedup, values: ['2'],
    isButton: () => false, isStringSelectMenu: () => true, deferred: false, replied: false,
    deferUpdate: vi.fn().mockRejectedValue(Object.assign(new Error('synthetic failure'), { code })),
  };
  collector.emit('collect', component);
  await vi.waitFor(() => expect(code === 10062 ? mocks.warn : mocks.error).toHaveBeenCalledTimes(1));
  expect(component.deferUpdate).toHaveBeenCalledTimes(1);
  expect(mocks.save).not.toHaveBeenCalled();
  expect(interaction.editReply).toHaveBeenCalledTimes(1);
  expect(unregister).not.toHaveBeenCalled();
});

it('acknowledges before save, retains ownership across refresh and releases it on end', async () => {
  const { collector, interaction, unregister } = await session();
  const order: string[] = [];
  mocks.save.mockImplementation(async () => { order.push('save'); });
  const component = {
    user: { id: 'synthetic' }, customId: getBotConfig().commands.lab.ids.speedup, values: ['2'],
    isButton: () => false, isStringSelectMenu: () => true, deferred: false, replied: false,
    deferUpdate: vi.fn(async () => { order.push('ack'); }),
  };
  collector.emit('collect', component);
  await vi.waitFor(() => expect(interaction.editReply).toHaveBeenCalledTimes(2));
  expect(order).toEqual(['ack', 'save']);
  expect(component.deferUpdate).toHaveBeenCalledTimes(1);
  expect(unregister).not.toHaveBeenCalled();
  collector.emit('end');
  await vi.waitFor(() => expect(interaction.editReply).toHaveBeenCalledTimes(3));
  expect(unregister).toHaveBeenCalledWith('lab:synthetic');
});

it('contains background reconcile and cleanup failures with diagnostics', async () => {
  mocks.reconcile.mockRejectedValue(new Error('synthetic reconcile failure'));
  const { collector, interaction } = await session();
  await vi.waitFor(() => expect(mocks.error).toHaveBeenCalledTimes(1));
  interaction.editReply.mockRejectedValue(new Error('synthetic cleanup failure'));
  collector.emit('end');
  await vi.waitFor(() => expect(mocks.error).toHaveBeenCalledTimes(2));
});

it('gives cleanup headroom and retires an invalid cleanup token after releasing ownership', async () => {
  const { collector, interaction, unregister } = await session();
  const reply = await interaction.fetchReply();
  const options = reply.createMessageComponentCollector.mock.calls[0][0] as { time: number };
  expect(options.time).toBeLessThanOrEqual(870000);
  expect(options.time).toBeGreaterThan(860000);
  interaction.editReply.mockRejectedValueOnce(Object.assign(new Error('invalid webhook'), { code: 50027 }));
  collector.emit('end');
  await vi.waitFor(() => expect(interaction.editReply).toHaveBeenCalledTimes(2));
  await Promise.resolve(); await Promise.resolve();
  expect(unregister).toHaveBeenCalledWith('lab:synthetic');
  expect(mocks.error).not.toHaveBeenCalled();
});

it('releases ownership without editing after the original response expires', async () => {
  const { collector, interaction, unregister } = await session();
  const clock = vi.spyOn(Date, 'now').mockReturnValue(interaction.createdTimestamp + 900000);
  try {
    collector.emit('end');
    await Promise.resolve(); await Promise.resolve();
    expect(unregister).toHaveBeenCalledWith('lab:synthetic');
    expect(interaction.editReply).toHaveBeenCalledTimes(1);
    expect(mocks.error).not.toHaveBeenCalled();
  } finally { clock.mockRestore(); }
});
