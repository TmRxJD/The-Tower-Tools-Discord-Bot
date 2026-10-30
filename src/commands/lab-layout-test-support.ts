import { EventEmitter } from 'node:events';
import { beforeEach, afterEach, expect, vi } from 'vitest';
import { Client, InteractionWebhook, DiscordAPIError } from 'discord.js';
import { getBotConfig } from '../config/bot-config';
import { defaultSharedUserToolSettings, defaultUserLabSettings } from '@tmrxjd/platform/tools';
const testMocks = vi.hoisted(() => ({ save: vi.fn(), resolve: vi.fn(), reconcile: vi.fn(), modal: vi.fn(), render: vi.fn(), warn: vi.fn(), error: vi.fn() }));
export const mocks = testMocks;
vi.mock('../core/logger', () => ({ logger: { warn: testMocks.warn, error: testMocks.error, info: vi.fn(), debug: vi.fn() } }));
vi.mock('../services/user-lab-db', () => ({ getUserLabSettings: vi.fn(), saveUserLabSettings: testMocks.save, reconcileUserLabSettings: testMocks.reconcile }));
vi.mock('../services/user-shared-settings-db', () => ({ getUserSharedSettings: async () => defaultSharedUserToolSettings }));
vi.mock('../services/user-storage-resolution', () => ({ resolveUserStorageState: testMocks.resolve }));
vi.mock('../services/cloud-reconcile-ui', () => ({ runCloudReconcileUi: vi.fn() }));
vi.mock('../services/table-chart-render', () => ({ renderTableChartPng: testMocks.render }));
import { labCommand } from '../commands/lab';
export const ids = getBotConfig().commands.lab.ids;
export const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
let writeAttempts = 0;
export function issues(body: any) {
    const issues: Array<{
        path: string;
        rule: string;
        actual?: number;
    }> = [];
    const rows = body.components ?? [];
    if (rows.length > 5)
        issues.push({ path: 'components', rule: 'legacy-max-5-action-rows', actual: rows.length });
    const seen = new Set<string>();
    for (const [i, row] of rows.entries()) {
        const cs = row.components ?? [];
        if (cs.length < 1 || cs.length > 5)
            issues.push({ path: `components.${i}.components`, rule: 'row-child-count', actual: cs.length });
        if (cs.some((c: any) => c.type === 3) && cs.length !== 1)
            issues.push({ path: `components.${i}.components`, rule: 'select-must-have-own-row' });
        for (const [j, c] of cs.entries()) {
            const p = `components.${i}.components.${j}`;
            if (typeof c.custom_id !== 'string' || c.custom_id.length < 1 || c.custom_id.length > 100 || seen.has(c.custom_id))
                issues.push({ path: p + '.custom_id', rule: 'custom-id-length-or-duplicate' });
            seen.add(c.custom_id);
            if (c.label?.length > 80)
                issues.push({ path: p + '.label', rule: 'button-label-length' });
            if (c.placeholder?.length > 150)
                issues.push({ path: p + '.placeholder', rule: 'placeholder-length' });
            if (c.type === 3) {
                const opts = c.options ?? [];
                if (opts.length < 1 || opts.length > 25)
                    issues.push({ path: p + '.options', rule: 'option-count', actual: opts.length });
                if (opts.filter((o: any) => o.default).length > (c.max_values ?? 1))
                    issues.push({ path: p + '.options', rule: 'too-many-defaults' });
                const values = new Set<string>();
                for (const [k, o] of opts.entries()) {
                    if (o.label.length > 100 || o.value.length > 100 || values.has(o.value))
                        issues.push({ path: p + `.options.${k}`, rule: 'option-length-or-duplicate' });
                    values.add(o.value);
                }
            }
        }
    }
    for (const [i, e] of (body.embeds ?? []).entries()) {
        if ((e.fields ?? []).length > 25)
            issues.push({ path: `embeds.${i}.fields`, rule: 'embed-field-count' });
        if (e.title?.length > 256 || e.description?.length > 4096 || e.footer?.text?.length > 2048)
            issues.push({ path: `embeds.${i}`, rule: 'embed-text-length' });
        for (const [j, f] of (e.fields ?? []).entries())
            if (f.name.length > 256 || f.value.length > 1024)
                issues.push({ path: `embeds.${i}.fields.${j}`, rule: 'embed-field-length' });
    }
    const embedText = (body.embeds ?? []).reduce((n: any, e: any) => n + (e.title?.length ?? 0) + (e.description?.length ?? 0) + (e.footer?.text?.length ?? 0) + (e.author?.name?.length ?? 0) + (e.fields ?? []).reduce((m: any, f: any) => m + f.name.length + f.value.length, 0), 0);
    if (embedText > 6000)
        issues.push({ path: 'embeds', rule: 'aggregate-embed-text', actual: embedText });
    if ((body.embeds ?? []).length > 10)
        issues.push({ path: 'embeds', rule: 'max-10-embeds' });
    return issues;
}

// Test transport only: the real handler/builders/webhook serializer run; no client logs in.
const clients = new Set<Client>();
export async function session(enforce = true) {
    const client = new Client({ intents: [] });
    clients.add(client);
    const captures: any[] = [];
    let nextError: Error | null = null;
    let shownModal: any = null;
    let modalValues: Record<string, string> = {};
    vi.spyOn(client, 'login').mockRejectedValue(new Error('Discord login blocked'));
    for (const method of ['get', 'post', 'put', 'delete'] as const) {
        vi.spyOn(client.rest, method).mockImplementation(async () => {
            writeAttempts++;
            throw new Error('Unexpected Discord request blocked');
        });
    }
    vi.spyOn(client.rest, 'patch').mockImplementation(async (route: any, options: any) => {
        const body = options.body;
        const files = options.files ?? [];
        captures.push({ body, files, routeTemplate: '/webhooks/:applicationId/:token/messages/@original', method: 'PATCH' });
        if (!/\/messages\/(?:@original|%40original)$/.test(String(route))) throw new Error('Unexpected route blocked');
        if (nextError) {
            const error = nextError;
            nextError = null;
            throw error;
        }
        if (enforce && issues(body).length) {
            // Explicitly simulated API rejection at a blocked transport boundary.
            throw new DiscordAPIError({ code: 50035, message: 'Invalid Form Body', errors: {
                components: { _errors: [{ code: 'BASE_TYPE_MAX_LENGTH', message: 'Must be 5 or fewer in length.' }] },
            } } as any, 50035, 400, 'PATCH', 'https://discord.com/api/v10/webhooks/offline/offline/messages/@original', { body, files });
        }
        return {
            id: '100000000000000004', channel_id: '100000000000000005',
            author: { id: '100000000000000001', username: 'offline', discriminator: '0000', bot: true },
            timestamp: new Date().toISOString(), content: '', embeds: body.embeds ?? [],
            components: body.components ?? [], attachments: [], type: 20, flags: 64,
            mention_everyone: false, tts: false, pinned: false,
        };
    });
    const webhook = new InteractionWebhook(client as Client<true>, '100000000000000001', 'offline-token');
    const collector = new EventEmitter() as EventEmitter & { stop: () => void };
    collector.stop = () => { collector.emit('end'); };
    const interaction = {
        id: 'offline-interaction', deferred: true, replied: true, createdTimestamp: Date.now(),
        isChatInputCommand: () => true, user: { id: 'offline-user', username: 'offline-user' },
        deferReply: vi.fn(), editReply: vi.fn((payload: any) => webhook.editMessage('@original', payload)),
        fetchReply: vi.fn(async () => ({ id: '100000000000000004', createMessageComponentCollector: () => collector })),
        client: { scopedInteractionSessions: { register: vi.fn(), unregister: vi.fn() } },
    };
    await labCommand.execute(interaction as never);
    async function emit(customId: string, values: string[] = [], button = false) {
        const before = captures.length;
        const component = {
            id: 'offline-component', createdTimestamp: Date.now(), customId, values,
            user: interaction.user, deferred: false, replied: false,
            isButton: () => button, isStringSelectMenu: () => !button,
            deferUpdate: vi.fn(async () => { component.deferred = true; }), reply: vi.fn(),
            showModal: vi.fn(async (modal: any) => { shownModal = modal.toJSON(); }),
            awaitModalSubmit: vi.fn(async (options: any) => {
                const submitted = {
                    id: 'offline-modal', createdTimestamp: Date.now(), customId: shownModal.custom_id,
                    user: interaction.user, deferred: false, replied: false,
                    deferUpdate: vi.fn(async () => { submitted.deferred = true; }),
                    fields: { getTextInputValue: (key: string) => modalValues[key] ?? '1' },
                };
                expect(options.filter(submitted)).toBe(true);
                return submitted;
            }),
            update: vi.fn(async (payload: any) => { await interaction.editReply(payload); collector.stop(); }),
            channel: { send: vi.fn(() => { writeAttempts++; throw new Error('Public send blocked'); }) },
        };
        collector.emit('collect', component);
        await vi.waitFor(() => expect(captures.length).toBeGreaterThan(before), { interval: 1 });
        await new Promise(resolve => setTimeout(resolve, 0));
        return captures.at(-1);
    }
    return {
        interaction, collector, captures, emit,
        failNext: (error: Error) => { nextError = error; },
        setModalValues: (values: Record<string, string>) => { modalValues = values; },
        get modal() { return shownModal; },
    };
}

beforeEach(() => {
    writeAttempts = 0;
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('External network blocked'); }));
    testMocks.resolve.mockImplementation(async () => ({ storageUserId: 'offline-user', state: { ...defaultUserLabSettings, labLevels: {}, hideMaxedLabs: false } }));
    testMocks.save.mockResolvedValue(undefined);
    testMocks.reconcile.mockResolvedValue({});
    testMocks.render.mockResolvedValue(png);
});
afterEach(async () => {
    await Promise.all([...clients].map(client => client.destroy()));
    clients.clear();
    vi.unstubAllGlobals();
    expect(writeAttempts).toBe(0);
});
