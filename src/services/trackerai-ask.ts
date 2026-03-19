import {
  preloadTrackerAiNodeSemanticRuntime,
  searchTrackerAiKnowledgeBase,
  type TrackerAiNodeKbSearchResult,
} from '@tmrxjd/platform/node';
import {
  buildTrackerAiSupportingSharedChartCandidates,
  summarizeCanonicalToolDataset,
} from '@tmrxjd/platform/tools';
import type { UniversalCommandResponse } from './universal-command-schema';
import { logger } from '../core/logger';
import { loadTrackerAiKbArtifactBundle } from './trackerai-kb-artifact';
import { runTrackerAiCloudAnswer } from './trackerai-cloud-ai';
import { runDirectTrackerAiCalculatorCommand } from './trackerai-direct-calculator';
import { buildTrackerAiSupportingChartAttachment } from './trackerai-shared-chart';

type RunTrackerAiAskCommandOptions = {
  message: string;
  deepReasoning?: boolean;
  userId?: string;
  username?: string;
};

function createEmbedResponse(options: {
  description: string;
  artifactVersion?: string | null;
  embeddingModelId?: string | null;
  route?: string;
  matches?: number;
  tier?: string;
  relevantChartTitle?: string | null;
  relevantChartPathId?: string | null;
  attachments?: UniversalCommandResponse['attachments'];
}): UniversalCommandResponse {
  return {
    command: 'ask',
    tier: options.tier || 'bot-local-kb',
    answer: options.description,
    ui: {
      type: 'embed',
      title: 'TowerAI',
      description: options.description,
    },
    attachments: options.attachments,
  };
}

function buildUnsupportedRouteMessage(route: string): string {
  if (route === 'tool_execution' || route === 'calculator_request' || route === 'hybrid') {
    return 'Bot-side tools and calculators are not enabled yet. I can answer Tower knowledge-base questions directly right now.';
  }

  return 'Ask a specific Tower question and I can answer it directly.';
}

function buildDeterministicFallback(searchResult: TrackerAiNodeKbSearchResult): string {
  const topChunks = searchResult.chunks.slice(0, 2);
  if (topChunks.length === 0) {
    return 'I could not find enough grounded context to answer that confidently.';
  }

  return topChunks
    .map(chunk => `**${chunk.title}**\n${chunk.text}`)
    .join('\n\n');
}

function buildAugmentedKnowledgeContext(options: {
  prompt: string;
  knowledgeContext: string;
}): string {
  const baseContext = String(options.knowledgeContext || '').trim();
  const candidates = buildTrackerAiSupportingSharedChartCandidates(
    options.prompt,
    '',
    3,
    baseContext,
  );

  if (candidates.length === 0) {
    return baseContext;
  }

  const candidatesBlock = candidates.map(candidate => {
    const datasetSummary = summarizeCanonicalToolDataset(candidate.rendererKey, candidate.args);
    const previewColumns = candidate.previewColumns.length > 0
      ? candidate.previewColumns.join(' | ')
      : 'none';
    const previewRows = candidate.previewSampleRows.length > 0
      ? candidate.previewSampleRows.map((row, index) => `row ${index + 1}: ${row.join(' | ')}`).join('\n')
      : 'none';
    const datasetOverview = datasetSummary?.overview ?? 'none';
    const datasetAxis = datasetSummary?.axisSummary ?? 'none';
    const datasetColumns = datasetSummary?.columnSummaries.length
      ? datasetSummary.columnSummaries.map(summary => summary.summary).join('\n')
      : 'none';

    return [
      `<candidate id="${candidate.pathId}">`,
      `<title>${candidate.title}</title>`,
      `<category>${candidate.category}</category>`,
      `<subcategory>${candidate.subcategory}</subcategory>`,
      `<item>${candidate.item}</item>`,
      `<description>${candidate.description || 'none'}</description>`,
      `<renderer_key>${candidate.rendererKey || 'none'}</renderer_key>`,
      `<preview_title>${candidate.previewTitle || 'none'}</preview_title>`,
      `<preview_columns>${previewColumns}</preview_columns>`,
      `<preview_row_count>${candidate.previewRowCount}</preview_row_count>`,
      `<preview_rows>\n${previewRows}\n</preview_rows>`,
      `<dataset_overview>${datasetOverview}</dataset_overview>`,
      `<dataset_axis>${datasetAxis}</dataset_axis>`,
      `<dataset_columns>\n${datasetColumns}\n</dataset_columns>`,
      `</candidate>`,
    ].join('\n');
  }).join('\n\n');

  return [
    baseContext,
    '<supporting_shared_chart_candidates>',
    candidatesBlock,
    '</supporting_shared_chart_candidates>',
  ].filter(Boolean).join('\n\n');
}

export async function runTrackerAiAskCommand(options: RunTrackerAiAskCommandOptions): Promise<UniversalCommandResponse> {
  const message = String(options.message || '').trim();
  if (!message) {
    return createEmbedResponse({
      description: 'Please enter a message.',
      route: 'clarification_needed',
      matches: 0,
    });
  }

  const bundle = await loadTrackerAiKbArtifactBundle(false);
  const searchResult = await searchTrackerAiKnowledgeBase({
    bundle,
    prompt: message,
    maxChunks: options.deepReasoning === true ? 8 : 6,
  });

  if (searchResult.route !== 'knowledge_answer') {
    if (searchResult.route === 'calculator_request') {
      const directCalculatorResponse = await runDirectTrackerAiCalculatorCommand({
        message,
        userId: options.userId,
      });
      if (directCalculatorResponse) {
        return directCalculatorResponse;
      }
    }

    return createEmbedResponse({
      description: buildUnsupportedRouteMessage(searchResult.route),
      artifactVersion: searchResult.artifactVersion,
      embeddingModelId: searchResult.embeddingModelId,
      route: searchResult.route,
      matches: searchResult.matches,
    });
  }

  if (!searchResult.context || searchResult.matches === 0) {
    return createEmbedResponse({
      description: 'I could not find enough grounded context to answer that confidently.',
      artifactVersion: searchResult.artifactVersion,
      embeddingModelId: searchResult.embeddingModelId,
      route: searchResult.route,
      matches: searchResult.matches,
    });
  }

  const supportingChart = await buildTrackerAiSupportingChartAttachment({
    prompt: message,
    knowledgeContext: searchResult.context,
    userId: options.userId,
  });
  const augmentedKnowledgeContext = buildAugmentedKnowledgeContext({
    prompt: message,
    knowledgeContext: searchResult.context,
  });

  try {
    const cloudResult = await runTrackerAiCloudAnswer({
      prompt: message,
      knowledgeContext: augmentedKnowledgeContext,
      deepReasoning: options.deepReasoning,
    });

    return createEmbedResponse({
      description: cloudResult.text,
      artifactVersion: searchResult.artifactVersion,
      embeddingModelId: searchResult.embeddingModelId,
      route: searchResult.route,
      matches: searchResult.matches,
      tier: 'bot-local-kb-cloud-reasoning',
      relevantChartTitle: supportingChart?.title ?? null,
      relevantChartPathId: supportingChart?.pathId ?? null,
      attachments: supportingChart ? [supportingChart.attachment] : undefined,
    });
  } catch (error) {
    logger.warn('TowerAI cloud reasoning failed; falling back to deterministic KB summary.', {
      userId: options.userId,
      username: options.username,
      error,
    });

    return createEmbedResponse({
      description: buildDeterministicFallback(searchResult),
      artifactVersion: searchResult.artifactVersion,
      embeddingModelId: searchResult.embeddingModelId,
      route: searchResult.route,
      matches: searchResult.matches,
      tier: 'bot-local-kb-fallback',
      relevantChartTitle: supportingChart?.title ?? null,
      relevantChartPathId: supportingChart?.pathId ?? null,
      attachments: supportingChart ? [supportingChart.attachment] : undefined,
    });
  }
}

let prewarmInFlight: Promise<void> | null = null;

export async function prewarmTrackerAiAskRuntime(): Promise<void> {
  if (prewarmInFlight) {
    return prewarmInFlight;
  }

  prewarmInFlight = (async () => {
    try {
      await Promise.all([
        loadTrackerAiKbArtifactBundle(false),
        preloadTrackerAiNodeSemanticRuntime(),
      ]);
      logger.info('TowerAI bot-local KB runtime prewarmed.');
    } catch (error) {
      logger.warn('TowerAI bot-local KB runtime prewarm failed.', error);
    }
  })().finally(() => {
    prewarmInFlight = null;
  });

  return prewarmInFlight;
}