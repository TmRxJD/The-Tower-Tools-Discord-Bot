import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runTrackerAiAskCommand } from './trackerai-ask';

const searchTrackerAiKnowledgeBase = vi.fn();
const loadTrackerAiKbArtifactBundle = vi.fn();
const runTrackerAiCloudAnswer = vi.fn();
const runDirectTrackerAiCalculatorCommand = vi.fn();
const buildTrackerAiSupportingChartAttachment = vi.fn();

vi.mock('@tmrxjd/platform/node', () => ({
  searchTrackerAiKnowledgeBase: (...args: unknown[]) => searchTrackerAiKnowledgeBase(...args),
}));

vi.mock('./trackerai-kb-artifact', () => ({
  loadTrackerAiKbArtifactBundle: (...args: unknown[]) => loadTrackerAiKbArtifactBundle(...args),
}));

vi.mock('./trackerai-cloud-ai', () => ({
  runTrackerAiCloudAnswer: (...args: unknown[]) => runTrackerAiCloudAnswer(...args),
}));

vi.mock('./trackerai-direct-calculator', () => ({
  runDirectTrackerAiCalculatorCommand: (...args: unknown[]) => runDirectTrackerAiCalculatorCommand(...args),
}));

vi.mock('./trackerai-shared-chart', () => ({
  buildTrackerAiSupportingChartAttachment: (...args: unknown[]) => buildTrackerAiSupportingChartAttachment(...args),
}));

describe('trackerai-ask', () => {
  beforeEach(() => {
    loadTrackerAiKbArtifactBundle.mockResolvedValue({
      contractVersion: 'trackerai-kb-artifact-cache-v1',
      version: 'kb-v1',
      metadata: {},
      chunks: {},
      index: {},
      syncedAtIso: '2026-03-18T00:00:00.000Z',
    });
    buildTrackerAiSupportingChartAttachment.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('returns a narrow unsupported response for calculator-style routes', async () => {
    runDirectTrackerAiCalculatorCommand.mockResolvedValue(null);
    searchTrackerAiKnowledgeBase.mockResolvedValue({
      route: 'calculator_request',
      artifactVersion: 'kb-v1',
      embeddingModelId: 'Xenova/gte-base',
      context: '',
      matches: 0,
      topScore: 0,
      chunks: [],
    });

    const result = await runTrackerAiAskCommand({
      message: 'calculate black hole stone cost',
    });

    expect(result.tier).toBe('bot-local-kb');
    expect(result.ui?.description).toContain('tools and calculators are not enabled yet');
    expect(result.ui?.fields).toBeUndefined();
    expect(runDirectTrackerAiCalculatorCommand).toHaveBeenCalled();
    expect(runTrackerAiCloudAnswer).not.toHaveBeenCalled();
  });

  it('returns a direct calculator response when the bot can execute the prompt locally', async () => {
    runDirectTrackerAiCalculatorCommand.mockResolvedValue({
      command: 'ask',
      tier: 'bot-direct-calculator',
      answer: 'Golden Bot cooldown from level 1 to max costs 123 medals.',
      ui: {
        type: 'embed',
        title: 'TowerAI',
        description: 'Golden Bot cooldown from level 1 to max costs 123 medals.',
        fields: [{ name: 'Values Used', value: 'Bot: Golden Bot | Stat: Cooldown | Start: 1 | Target: max | Cooldown Lab: 5 | Duration Lab: 4' }],
      },
    });
    searchTrackerAiKnowledgeBase.mockResolvedValue({
      route: 'calculator_request',
      artifactVersion: 'kb-v1',
      embeddingModelId: 'Xenova/gte-small',
      context: '',
      matches: 0,
      topScore: 0,
      chunks: [],
    });

    const result = await runTrackerAiAskCommand({
      message: 'how many medals to max gb cooldown',
      userId: 'user-1',
    });

    expect(result.tier).toBe('bot-direct-calculator');
    expect(result.ui?.fields?.some(field => field.name === 'Values Used')).toBe(true);
    expect(runTrackerAiCloudAnswer).not.toHaveBeenCalled();
  });

  it('falls back to deterministic KB chunk text when cloud reasoning fails', async () => {
    searchTrackerAiKnowledgeBase.mockResolvedValue({
      route: 'knowledge_answer',
      artifactVersion: 'kb-v2',
      embeddingModelId: 'Xenova/gte-base',
      context: '<kb>\n#1 Black Hole\nCategory: ultimate-weapons\nBlack Hole freezes enemies and increases coin gains.\n</kb>',
      matches: 1,
      topScore: 21,
      chunks: [
        {
          id: 'bh',
          title: 'Black Hole',
          category: 'ultimate-weapons',
          text: 'Black Hole freezes enemies and increases coin gains.',
          score: 21,
        },
      ],
    });
    runTrackerAiCloudAnswer.mockRejectedValue(new Error('cloud down'));

    const result = await runTrackerAiAskCommand({
      message: 'what does black hole do',
    });

    expect(result.tier).toBe('bot-local-kb-fallback');
    expect(result.ui?.description).toContain('**Black Hole**');
    expect(result.ui?.description).toContain('Black Hole freezes enemies');
  });

  it('attaches a relevant supporting chart to knowledge answers when one is inferred', async () => {
    searchTrackerAiKnowledgeBase.mockResolvedValue({
      route: 'knowledge_answer',
      artifactVersion: 'kb-v3',
      embeddingModelId: 'Xenova/gte-small',
      context: '<kb>gold-bot-vs-death-wave-uptime</kb>',
      matches: 2,
      topScore: 27,
      chunks: [
        {
          id: 'gb-dw-sync',
          title: 'Golden Bot vs Death Wave Uptime',
          category: 'ultimate-weapons',
          text: 'Use linger offset comparisons to line up overlap windows.',
          score: 27,
        },
      ],
    });
    buildTrackerAiSupportingChartAttachment.mockResolvedValue({
      pathId: 'ultimate-weapons:death-wave:gold-bot-vs-death-wave-uptime',
      title: 'Golden Bot vs Death Wave Uptime',
      description: 'Use linger offset comparisons to line up overlap windows.',
      attachment: {
        name: 'gold-bot-vs-death-wave-uptime.png',
        contentType: 'image/png',
        dataBase64: Buffer.from('png-bytes').toString('base64'),
        embedImage: true,
      },
    });
    runTrackerAiCloudAnswer.mockResolvedValue({
      text: 'Use the uptime comparison chart to check where the overlap windows are strongest.',
    });

    const result = await runTrackerAiAskCommand({
      message: 'how do i sync gb and dw?',
      userId: 'user-1',
    });

    expect(result.tier).toBe('bot-local-kb-cloud-reasoning');
    expect(result.attachments).toHaveLength(1);
    expect(result.attachments?.[0]?.name).toBe('gold-bot-vs-death-wave-uptime.png');
    expect(result.ui?.fields).toBeUndefined();
  });

  it('passes shared chart preview data into cloud reasoning context for dataset-backed questions', async () => {
    searchTrackerAiKnowledgeBase.mockResolvedValue({
      route: 'knowledge_answer',
      artifactVersion: 'kb-v4',
      embeddingModelId: 'Xenova/gte-small',
      context: '<kb>Death Wave cooldown can be reduced with stones.</kb>',
      matches: 3,
      topScore: 31,
      chunks: [
        {
          id: 'dw',
          title: 'Death Wave',
          category: 'ultimate-weapons',
          text: 'Death Wave cooldown can be reduced with stones.',
          score: 31,
        },
      ],
    });
    runTrackerAiCloudAnswer.mockResolvedValue({
      text: 'Death Wave cooldown levels are shown in the chart data.',
    });

    await runTrackerAiAskCommand({
      message: 'what are the death wave cooldown levels?',
    });

    expect(runTrackerAiCloudAnswer).toHaveBeenCalled();
    const cloudArgs = runTrackerAiCloudAnswer.mock.calls[0]?.[0];
    expect(String(cloudArgs?.knowledgeContext || '')).toContain('<supporting_shared_chart_candidates>');
    expect(String(cloudArgs?.knowledgeContext || '')).toContain('Ultimate Weapon Stone Costs: Death Wave');
    expect(String(cloudArgs?.knowledgeContext || '')).toContain('<preview_columns>');
    expect(String(cloudArgs?.knowledgeContext || '')).toContain('<preview_rows>');
    expect(String(cloudArgs?.knowledgeContext || '')).toContain('<dataset_axis>');
    expect(String(cloudArgs?.knowledgeContext || '')).toContain('Primary row axis Level spans numeric values');
    expect(String(cloudArgs?.knowledgeContext || '')).toContain('Cooldown ranges from');
  });
});