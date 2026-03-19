import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getEightBallAiResponse } from './eight-ball-ai';
import { resetConfig } from '../config';

describe('eight-ball-ai', () => {
  const originalEnv = {
    endpoint: process.env.TRACKERAI_CLOUD_AI_ENDPOINT,
    model: process.env.TRACKERAI_CLOUD_REASONING_MODEL,
    fallbackModel: process.env.TRACKERAI_CLOUD_FALLBACK_REASONING_MODEL,
  };

  beforeEach(() => {
    process.env.TRACKERAI_CLOUD_AI_ENDPOINT = 'https://api.groq.test/openai/v1/chat/completions';
    process.env.TRACKERAI_CLOUD_REASONING_MODEL = 'qwen/qwen3-32b';
    process.env.TRACKERAI_CLOUD_FALLBACK_REASONING_MODEL = 'openai/gpt-oss-20b';
    resetConfig();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    process.env.TRACKERAI_CLOUD_AI_ENDPOINT = originalEnv.endpoint;
    process.env.TRACKERAI_CLOUD_REASONING_MODEL = originalEnv.model;
    process.env.TRACKERAI_CLOUD_FALLBACK_REASONING_MODEL = originalEnv.fallbackModel;
    resetConfig();
  });

  it('returns direct chat completion content from the configured model', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'The odds are against you. As usual.' } }],
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getEightBallAiResponse('should i ascend?', 'test-key')).resolves.toBe('The odds are against you. As usual.');

    const firstCall = fetchMock.mock.calls[0];
    expect(firstCall).toBeDefined();
    const [url, init] = firstCall as unknown as [string, RequestInit];
    expect(url).toBe('https://api.groq.test/openai/v1/chat/completions');
    const body = JSON.parse(String(init.body)) as { model: string; max_tokens: number };
    expect(body.model).toBe('qwen/qwen3-32b');
    expect(body.max_tokens).toBe(100);
  });

  it('retries with the fallback model after a rate limit response', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        json: async () => ({ error: { message: 'rate limit hit' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          model: 'openai/gpt-oss-20b',
          choices: [{ message: { content: 'Do it. Regret builds character.' } }],
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    await expect(getEightBallAiResponse('should i reroll today?', 'test-key')).resolves.toBe('Do it. Regret builds character.');

    const firstBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body || '{}')) as { model: string };
    const secondBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body || '{}')) as { model: string };
    expect(firstBody.model).toBe('qwen/qwen3-32b');
    expect(secondBody.model).toBe('openai/gpt-oss-20b');
  });

  it('supports providers that expose the responses endpoint', async () => {
    process.env.TRACKERAI_CLOUD_AI_ENDPOINT = 'https://api.groq.test/openai/v1/responses';
    resetConfig();
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        output_text: 'Signs point to yes. Unfortunately for everyone involved.',
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getEightBallAiResponse('should i push to milestone?', 'test-key')).resolves.toBe('Signs point to yes. Unfortunately for everyone involved.');

    const firstCall = fetchMock.mock.calls[0];
    expect(firstCall).toBeDefined();
    const [url, init] = firstCall as unknown as [string, RequestInit];
    expect(url).toBe('https://api.groq.test/openai/v1/responses');
    const body = JSON.parse(String(init.body)) as { model: string; max_output_tokens: number; input: Array<{ role: string }> };
    expect(body.model).toBe('qwen/qwen3-32b');
    expect(body.max_output_tokens).toBe(100);
    expect(body.input.map(item => item.role)).toEqual(['system', 'user']);
  });
});