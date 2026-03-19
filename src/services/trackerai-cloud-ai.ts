import { getAppConfig } from '../config';

export type TrackerAiCloudAnswerOptions = {
  prompt: string;
  knowledgeContext: string;
  deepReasoning?: boolean;
};

export type TrackerAiCloudAnswerResult = {
  text: string;
  modelId: string;
};

type OpenAiChatCompletionResponse = {
  model?: string;
  output_text?: string;
  choices?: Array<{ message?: { content?: unknown } }>;
  output?: Array<{ content?: Array<{ text?: unknown }> }>;
  error?: { message?: string };
  detail?: string;
};

function getCloudEndpoint(): string {
  return String(getAppConfig().ai.cloudEndpoint || '').trim();
}

function getCloudApiKey(): string {
  return String(getAppConfig().ai.cloudApiKey || '').trim();
}

function getPrimaryModelId(): string {
  return String(getAppConfig().ai.cloudReasoningModel || '').trim();
}

function getFallbackModelId(): string {
  return String(getAppConfig().ai.cloudFallbackReasoningModel || '').trim();
}

function isResponsesEndpoint(endpoint: string): boolean {
  return /\/responses\/?$/i.test(String(endpoint || '').trim());
}

function stripReasoningTrace(raw: unknown): string {
  return String(raw || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, ' ')
    .replace(/^\s*(okay|alright|let me think)[\s,:-].*$/gim, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractReplyContent(payload: OpenAiChatCompletionResponse): string {
  if (typeof payload.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const choiceContent = payload.choices?.[0]?.message?.content;
  if (typeof choiceContent === 'string' && choiceContent.trim()) {
    return choiceContent.trim();
  }

  if (Array.isArray(choiceContent)) {
    const joined = choiceContent
      .map(item => typeof (item as { text?: unknown })?.text === 'string' ? String((item as { text?: unknown }).text) : '')
      .join('')
      .trim();
    if (joined) return joined;
  }

  if (Array.isArray(payload.output)) {
    const joined = payload.output
      .flatMap(item => Array.isArray(item?.content) ? item.content : [])
      .map(item => typeof item?.text === 'string' ? item.text : '')
      .join('')
      .trim();
    if (joined) return joined;
  }

  return '';
}

function buildSystemPrompt(knowledgeContext: string): string {
  return [
    'You are TowerAI for ToolsBot, answering questions about the mobile game The Tower.',
    'Use the provided local semantic knowledge context when it is relevant.',
    'Do not mention retrieval, context windows, embeddings, or internal pipelines.',
    'If the knowledge context is insufficient, say so plainly instead of inventing details.',
    'Prefer concise but complete answers in GitHub-flavored Markdown.',
    'Do not use Markdown tables.',
    knowledgeContext
      ? `Local semantic context:\n${knowledgeContext}`
      : 'Local semantic context: none provided.',
  ].join('\n\n');
}

async function executeCloudRequest(options: {
  endpoint: string;
  apiKey: string;
  modelId: string;
  prompt: string;
  knowledgeContext: string;
  deepReasoning?: boolean;
}): Promise<TrackerAiCloudAnswerResult> {
  const response = await fetch(options.endpoint, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${options.apiKey}`,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify(isResponsesEndpoint(options.endpoint)
      ? {
          model: options.modelId,
          input: [
            { role: 'system', content: [{ type: 'input_text', text: buildSystemPrompt(options.knowledgeContext) }] },
            { role: 'user', content: [{ type: 'input_text', text: options.prompt }] },
          ],
          max_output_tokens: options.deepReasoning === true ? 2200 : 1400,
          temperature: 0,
        }
      : {
          model: options.modelId,
          messages: [
            { role: 'system', content: buildSystemPrompt(options.knowledgeContext) },
            { role: 'user', content: options.prompt },
          ],
          max_tokens: options.deepReasoning === true ? 2200 : 1400,
          temperature: 0,
        }),
    signal: AbortSignal.timeout(options.deepReasoning === true ? 240_000 : 150_000),
  });

  const payload = await response.json().catch(() => null) as OpenAiChatCompletionResponse | null;
  if (!response.ok) {
    throw new Error(String(payload?.error?.message || payload?.detail || `Cloud reasoning failed with status ${response.status}`));
  }

  const text = stripReasoningTrace(extractReplyContent(payload || {}));
  if (!text) {
    throw new Error('Cloud reasoning returned an empty response.');
  }

  return {
    text,
    modelId: String(payload?.model || options.modelId),
  };
}

export async function runTrackerAiCloudAnswer(options: TrackerAiCloudAnswerOptions): Promise<TrackerAiCloudAnswerResult> {
  const endpoint = getCloudEndpoint();
  const apiKey = getCloudApiKey();
  const primaryModelId = getPrimaryModelId();
  const fallbackModelId = getFallbackModelId();

  if (!endpoint || !apiKey || !primaryModelId) {
    throw new Error('Cloud reasoning is not configured for ToolsBot.');
  }

  try {
    return await executeCloudRequest({
      endpoint,
      apiKey,
      modelId: primaryModelId,
      prompt: options.prompt,
      knowledgeContext: options.knowledgeContext,
      deepReasoning: options.deepReasoning,
    });
  } catch (error) {
    if (!fallbackModelId || fallbackModelId === primaryModelId) {
      throw error;
    }

    return await executeCloudRequest({
      endpoint,
      apiKey,
      modelId: fallbackModelId,
      prompt: options.prompt,
      knowledgeContext: options.knowledgeContext,
      deepReasoning: options.deepReasoning,
    });
  }
}