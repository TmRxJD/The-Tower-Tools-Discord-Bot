import { EventEmitter } from 'node:events';
import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ save: vi.fn(), resolve: vi.fn(), reconcile: vi.fn(), modal: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock('../core/logger', () => ({ logger: { warn: mocks.warn, error: mocks.error } }));
vi.mock('../services/user-command-shared-state', () => ({ getUserCommandSharedState: vi.fn(), saveUserCommandSharedState: mocks.save, reconcileUserCommandSharedState: mocks.reconcile }));
vi.mock('../services/user-storage-resolution', () => ({ resolveUserStorageState: mocks.resolve }));
vi.mock('../services/cloud-reconcile-ui', () => ({ runCloudReconcileUi: vi.fn() }));
vi.mock('../services/modal-submit', () => ({ showModalAndAwaitSubmit: mocks.modal }));
vi.mock('../services/table-chart-render', () => ({ renderTableChartPng: vi.fn(async () => Buffer.from('offline')), renderConfigurableTablePng: vi.fn(async () => Buffer.from('offline')) }));
vi.mock('../services/command-share', () => ({ appendShareButtonRow: (rows: unknown) => rows, shareCurrentRender: vi.fn() }));
import { stoneCommand } from './stone';
import { getBotConfig } from '../config/bot-config';
const ids = getBotConfig().commands.stone.ids;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolve.mockResolvedValue({ storageUserId: 'synthetic', state: { weaponName: 'Golden Tower', selectedStats: [], startLevel: 0, targetLevel: 1 } });
  mocks.save.mockResolvedValue(undefined);
  mocks.reconcile.mockResolvedValue({});
});
async function session() {
  const collector = new EventEmitter();
  const interaction = {
    id: 'synthetic-private-id', createdTimestamp: Date.now(), isChatInputCommand: () => true, user: { id: 'synthetic', username: 'synthetic' },
    options: { getString: () => null, getInteger: () => null },
    deferReply: vi.fn().mockResolvedValue(undefined), editReply: vi.fn().mockResolvedValue(undefined),
    fetchReply: vi.fn().mockResolvedValue({ id: 'synthetic', createMessageComponentCollector: vi.fn(() => collector) }),
    client: { scopedInteractionSessions: { register: vi.fn(), unregister: vi.fn() } },
  };
  await stoneCommand.execute(interaction as unknown as Parameters<typeof stoneCommand.execute>[0]);
  return { interaction, collector };
}
function component(customId: string = ids.statSelect) {
  return { id: 'private-component', createdTimestamp: Date.now(), deferred: false, replied: false, customId, values: ['all'],
    isButton: () => false, isStringSelectMenu: () => true, deferUpdate: vi.fn().mockResolvedValue(undefined) };
}
it.each([ids.statSelect, ids.weaponSelect])('acknowledges %s before slow persistence and rendering', async id => {
  const { collector, interaction } = await session();
  const order: string[] = [];
  let release!: () => void;
  mocks.save.mockImplementation(() => { order.push('persist'); return new Promise<void>(resolve => { release = resolve; }); });
  const event = component(id);
  event.deferUpdate.mockImplementation(async () => { order.push('ack'); });
  collector.emit('collect', event);
  await vi.waitFor(() => expect(order).toEqual(['ack', 'persist']));
  expect(interaction.editReply).toHaveBeenCalledTimes(1);
  release();
  await vi.waitFor(() => expect(interaction.editReply).toHaveBeenCalledTimes(2));
});
it.each([10062, 40060, 'ECONNRESET', 50035])('contains callback failure %s and never persists/retries it', async code => {
  const { collector, interaction } = await session();
  const event = component();
  event.deferUpdate.mockRejectedValue(Object.assign(new Error('private payload and token'), { code }));
  collector.emit('collect', event);
  await vi.waitFor(() => expect(mocks.warn.mock.calls.length + mocks.error.mock.calls.length).toBe(1));
  expect(event.deferUpdate).toHaveBeenCalledOnce();
  expect(mocks.save).not.toHaveBeenCalled();
  expect(interaction.editReply).toHaveBeenCalledTimes(1);
  const logs = JSON.stringify([mocks.warn.mock.calls, mocks.error.mock.calls]);
  expect(logs).toContain('acknowledge-selection');
  expect(logs).not.toContain('private payload');
  expect(logs).not.toContain('private-component');
});
it('acknowledges a valid range modal before saving it', async () => {
  const { collector, interaction } = await session();
  const order: string[] = [];
  const submitted = { ...component(), fields: { getTextInputValue: () => '1' } };
  submitted.deferUpdate.mockImplementation(async () => { order.push('ack'); });
  mocks.modal.mockResolvedValue(submitted);
  mocks.save.mockImplementation(async () => { order.push('save'); });
  collector.emit('collect', { ...component(ids.setRange), isButton: () => true, isStringSelectMenu: () => false });
  await vi.waitFor(() => expect(interaction.editReply).toHaveBeenCalledTimes(2));
  expect(order).toEqual(['ack', 'save']);
});
it('contains reconcile and cleanup errors, and releases ownership on expiry', async () => {
  mocks.reconcile.mockRejectedValue(new Error('private'));
  const { collector, interaction } = await session();
  await vi.waitFor(() => expect(mocks.error).toHaveBeenCalledOnce());
  interaction.editReply.mockRejectedValue(new Error('private cleanup'));
  collector.emit('end');
  await vi.waitFor(() => expect(mocks.error).toHaveBeenCalledTimes(2));
  expect(interaction.client.scopedInteractionSessions.unregister).toHaveBeenCalledWith('stone:synthetic-private-id');
});
