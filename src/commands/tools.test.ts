import type { ChatInputCommandInteraction } from 'discord.js';
import { buildBotToolsHubDescription, sharedToolsCatalog } from '@tmrxjd/platform/tools';
import { describe, expect, it, vi } from 'vitest';
import { getBotConfig } from '../config/bot-config';
import { getCommandSiteUrl } from '../services/command-embed-branding';
import { toolsCommand } from './tools';

const siteOrigin = 'https://the-tower-run-tracker.com';
// Audited against the production site's route map and Tools Hub dialog registry.
const expectedToolPaths: Record<string, string> = {
  tracker: '/',
  leaderboard: '/leaderboard',
  charts: '/tools/chart',
  'cph-calculator': '/tools?dialog=cph-calculator',
  'tournament-checklist': '/tools?dialog=tournament-checklist',
  'creator-codes': '/tools?dialog=creator-codes',
  'define-acronyms': '/tools?dialog=define-acronyms',
  reminders: '/tools?dialog=remind',
  'thorns-calculator': '/calculators/thorns',
  'lab-tracker': '/trackers/labs',
  'module-tracker': '/trackers/modules',
  'workshop-calculator': '/calculators/workshop',
  'workshop-tracker': '/trackers/workshop',
  'shard-splitter': '/calculators/shard-splitter',
  'bot-medal-splitter': '/calculators/bot-medal-splitter',
  'ultimate-weapons-tracker': '/trackers/uw',
  'bots-tracker': '/trackers/bots',
  'guardians-tracker': '/trackers/guardians',
  'vault-tracker': '/trackers/vault',
  'relics-tracker': '/trackers/relics',
  'lifetime-stats': '/trackers/lifetime',
  'damage-reduction': '/calculators/damage-reduction',
  'enemy-stats': '/calculators/enemy-stats',
  'enemy-drops': '/calculators/enemy-drops',
  'dissonance-calculator': '/calculators/dissonance',
  'effective-paths': '/calculators/effective-paths',
  'labs-calculator': '/calculators/labs',
  'modules-calculator': '/calculators/modules',
  'uptime-calculator': '/calculators/uptime',
  'bots-calculator': '/calculators/bots',
  'guardians-calculator': '/calculators/guardians',
  'cards-tracker': '/trackers/cards',
  'uw-calculator': '/calculators/uw',
};

describe('tools hub URLs', () => {
  it('keeps every browser-linked tool on its audited destination', () => {
    expect(getBotConfig().common.toolsHub.siteUrl).toBe(siteOrigin);
    const linkedTools = sharedToolsCatalog.filter(tool => tool.includeInBotHub !== false && tool.includeInSiteHub !== false);
    expect(Object.fromEntries(linkedTools.map(tool => [tool.id, tool.path]))).toEqual(expectedToolPaths);
    const description = buildBotToolsHubDescription(getBotConfig().common.toolsHub.siteUrl);
    const links = [...description.matchAll(/\]\((https?:[^)]+)\)/g)].map(match => match[1]);
    expect(links).toHaveLength(Object.keys(expectedToolPaths).length + 1);
    expect(new Set(links)).toEqual(new Set(['/tools', ...Object.values(expectedToolPaths)].map(path => siteOrigin + path)));
    expect(description).not.toContain('https://www.');
    expect(description).toContain('[**Modules**](' + siteOrigin + '/calculators/modules)');
    expect(description).toContain('**Ask TowerAI (Experimental)** **/ask**');
    expect(description).toContain('**Battle Conditions** **/battle_conditions**');
    expect(description).toContain('**Magic 8-Ball** **/8ball**');
  });

  it.each([
    [undefined, '1343406545920196608/1373107292547055718'],
    ['850137217828388904', '850137217828388904/1343679564966002779'],
  ])('renders the actual command embed with the correct host and feedback link for %s', async (guildId, feedbackPath) => {
    const reply = vi.fn();
    await toolsCommand.execute({ isChatInputCommand: () => true, guildId, reply } as unknown as ChatInputCommandInteraction);
    const embed = reply.mock.calls[0][0].embeds[0].toJSON();
    expect(embed.url).toBe(siteOrigin + '/tools');
    expect(embed.description).toBe(buildBotToolsHubDescription(siteOrigin, guildId));
    expect(embed.description).toContain('https://discord.com/channels/' + feedbackPath);
    expect(embed.description).not.toContain('https://www.');
  });

  it.each([
    ['bots', '/calculators/bots'],
    ['chart', '/tools/chart'],
    ['cph', '/tools?dialog=cph-calculator'],
    ['guardian', '/calculators/guardians'],
    ['lab', '/calculators/labs'],
    ['module', '/calculators/modules'],
    ['shard', '/calculators/shard-splitter'],
    ['stone', '/calculators/uw'],
    ['thorns', '/calculators/thorns'],
    ['workshop', '/calculators/workshop'],
    ['enemy_stats', '/calculators/enemy-stats'],
    ['unknown', '/tools'],
  ])('brands /%s with the working host and correct route', (command, path) => {
    expect(getCommandSiteUrl(command)).toBe(siteOrigin + path);
  });
});
