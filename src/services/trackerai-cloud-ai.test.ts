import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAppConfig, resetConfig } from '../config';
import { runTrackerAiCloudAnswer } from './trackerai-cloud-ai';

function getRequestBody(fetchMock: ReturnType<typeof vi.fn>) {
  const [, init] = fetchMock.mock.calls[0] ?? [];
  const body = typeof init === 'object' && init && 'body' in init ? init.body : undefined;
  return JSON.parse(String(body ?? '{}')) as { model?: string; max_tokens?: number };
}

describe('trackerai-cloud-ai', () => {
  const originalEnv = {
    endpoint: process.env.TRACKERAI_CLOUD_AI_ENDPOINT,
    apiKey: process.env.TRACKERAI_CLOUD_AI_API_KEY,
    reasoningModel: process.env.TRACKERAI_CLOUD_REASONING_MODEL,
    deepReasoningModel: process.env.TRACKERAI_CLOUD_DEEP_REASONING_MODEL,
    fallbackModel: process.env.TRACKERAI_CLOUD_FALLBACK_REASONING_MODEL,
  };

  beforeEach(() => {
    process.env.TRACKERAI_CLOUD_AI_ENDPOINT = 'https://api.groq.test/openai/v1/chat/completions';
    process.env.TRACKERAI_CLOUD_AI_API_KEY = 'test-key';
    process.env.TRACKERAI_CLOUD_REASONING_MODEL = 'qwen/qwen3-32b';
    process.env.TRACKERAI_CLOUD_DEEP_REASONING_MODEL = 'openai/gpt-oss-120b';
    process.env.TRACKERAI_CLOUD_FALLBACK_REASONING_MODEL = 'openai/gpt-oss-20b';
    resetConfig();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    process.env.TRACKERAI_CLOUD_AI_ENDPOINT = originalEnv.endpoint;
    process.env.TRACKERAI_CLOUD_AI_API_KEY = originalEnv.apiKey;
    process.env.TRACKERAI_CLOUD_REASONING_MODEL = originalEnv.reasoningModel;
    process.env.TRACKERAI_CLOUD_DEEP_REASONING_MODEL = originalEnv.deepReasoningModel;
    process.env.TRACKERAI_CLOUD_FALLBACK_REASONING_MODEL = originalEnv.fallbackModel;
    resetConfig();
  });

  it('uses the deep reasoning model when deep reasoning is enabled', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        model: 'openai/gpt-oss-120b',
        choices: [{ message: { content: 'Detailed answer.' } }],
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await runTrackerAiCloudAnswer({
      prompt: 'explain chrono field sync',
      knowledgeContext: 'context',
      deepReasoning: true,
    });
    expect(result.text).toBe('Detailed answer.');
    expect(result.modelId).toBe('openai/gpt-oss-120b');

    const requestBody = getRequestBody(fetchMock);
    expect(requestBody.model).toBe(getAppConfig().ai.cloudDeepReasoningModel);
    expect(requestBody.max_tokens).toBe(2200);
  });

  it('uses the standard reasoning model when deep reasoning is disabled', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        model: 'qwen/qwen3-32b',
        choices: [{ message: { content: 'Standard answer.' } }],
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await runTrackerAiCloudAnswer({
      prompt: 'quick answer',
      knowledgeContext: 'context',
      deepReasoning: false,
    });
    expect(result.text).toBe('Standard answer.');

    const requestBody = getRequestBody(fetchMock);
    expect(requestBody.model).toBe(getAppConfig().ai.cloudReasoningModel);
    expect(requestBody.max_tokens).toBe(1400);
  });
});
