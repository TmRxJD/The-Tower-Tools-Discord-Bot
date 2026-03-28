import { getAppConfig } from '../config';
import { getBotConfig } from '../config/bot-config';
import {
  isCloudRateLimitResponse,
  isResponsesEndpoint,
  normalizeText,
  resolveAttemptModels,
  resolveChatCompletionsEndpoint,
  toNonEmptyText,
} from '@tmrxjd/platform/tools';

interface OpenAiChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ text?: string | null }> | null;
    };
  }>;
  output_text?: string;
  output?: Array<{
    content?: Array<{
      text?: string | null;
    }>;
  }>;
  model?: string;
}

interface OpenAiErrorResponse {
  error?: {
    message?: string;
    type?: string;
    code?: string;
  };
}

function stripCloudReasoningTrace(raw: unknown): string {
  const normalized = normalizeText(raw);
  if (!normalized) {
    return '';
  }

  const withoutClosedTags = normalized
    .replace(/<think>[\s\S]*?<\/think>/gi, ' ')
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, ' ')
    .trim();

  if (withoutClosedTags && !/^<(?:think|thinking)\b/i.test(withoutClosedTags)) {
    return withoutClosedTags;
  }

  if (/^<(?:think|thinking)\b/i.test(normalized)) {
    return '';
  }

  return withoutClosedTags;
}

function extractCloudReplyContent(payload: OpenAiChatCompletionResponse): string {
  if (typeof payload.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const choiceContent = payload.choices?.[0]?.message?.content;
  if (typeof choiceContent === 'string' && choiceContent.trim()) {
    return choiceContent.trim();
  }

  if (Array.isArray(choiceContent)) {
    const joined = choiceContent
      .map(item => String(item?.text || ''))
      .join('')
      .trim();
    if (joined) {
      return joined;
    }
  }

  if (Array.isArray(payload.output)) {
    const joined = payload.output
      .flatMap(item => Array.isArray(item?.content) ? item.content : [])
      .map(item => String(item?.text || ''))
      .join('')
      .trim();
    if (joined) {
      return joined;
    }
  }

  return '';
}

function createProviderSpecificRequestFields(model: string): Record<string, unknown> {
  const normalizedModel = String(model || '').trim().toLowerCase();
  if (normalizedModel.startsWith('qwen/')) {
    return {
      reasoning_effort: 'none',
    };
  }

  return {};
}

export async function getEightBallAiResponse(question: string, apiKey: string): Promise<string> {
  const aiConfig = getBotConfig().commands.eightBall.ai;
  const appConfig = getAppConfig();
  const endpoint = resolveChatCompletionsEndpoint(appConfig.ai.cloudEndpoint, aiConfig.endpoint);
  const model = toNonEmptyText(appConfig.ai.cloudReasoningModel) ?? aiConfig.model;
  const attemptModels = resolveAttemptModels(model, appConfig.ai.cloudFallbackReasoningModel);

  let lastError: Error | null = null;
  for (let index = 0; index < attemptModels.length; index += 1) {
    const attemptModel = attemptModels[index] || model;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), aiConfig.timeoutMs);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(isResponsesEndpoint(endpoint)
          ? {
              model: attemptModel,
              input: [
                { role: 'system', content: [{ type: 'input_text', text: aiConfig.systemPrompt }] },
                { role: 'user', content: [{ type: 'input_text', text: question }] },
              ],
              max_output_tokens: aiConfig.maxTokens,
              temperature: aiConfig.temperature,
            }
          : {
              model: attemptModel,
              messages: [
                { role: 'system', content: aiConfig.systemPrompt },
                { role: 'user', content: question },
              ],
              max_tokens: aiConfig.maxTokens,
              temperature: aiConfig.temperature,
              ...createProviderSpecificRequestFields(attemptModel),
            }),
        signal: controller.signal,
      });

      if (!response.ok) {
        let detail = response.statusText || 'Request failed';
        try {
          const errorPayload = (await response.json()) as OpenAiErrorResponse;
          const message = toNonEmptyText(errorPayload.error?.message);
          const type = toNonEmptyText(errorPayload.error?.type);
          const code = toNonEmptyText(errorPayload.error?.code);
          const parts = [message, type, code].filter(Boolean);
          if (parts.length > 0) {
            detail = parts.join(' | ');
          }
        } catch {
          try {
            const text = toNonEmptyText(await response.text());
            if (text) {
              detail = text;
            }
          } catch {
            // Keep fallback detail
          }
        }

        lastError = new Error(`Cloud chat request failed (${response.status}): ${detail}`);
        if (index < attemptModels.length - 1 && isCloudRateLimitResponse(response.status, detail)) {
          continue;
        }
        throw lastError;
      }

      const data = (await response.json()) as OpenAiChatCompletionResponse;
      const content = toNonEmptyText(stripCloudReasoningTrace(extractCloudReplyContent(data)));
      if (!content) {
        lastError = new Error('Cloud chat response was empty');
        if (index < attemptModels.length - 1) {
          continue;
        }
        throw lastError;
      }

      return content;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError ?? new Error('Cloud chat request failed before any attempt completed');
}
