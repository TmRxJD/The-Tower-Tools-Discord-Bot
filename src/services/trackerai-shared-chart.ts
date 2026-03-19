import {
  resolveTrackerAiSupportingSharedChartPath as resolveSharedTrackerAiSupportingChartPath,
  type SharedChartPath,
} from '@tmrxjd/platform/tools'
import { logger } from '../core/logger'
import { renderChartAttachment } from './chart-render/renderer'
import type { UniversalCommandAttachment } from './universal-command-schema'

export type TrackerAiSupportingChartMatch = {
  path: SharedChartPath
  pathId: string
  title: string
  description: string
}

export type TrackerAiSupportingChartAttachment = TrackerAiSupportingChartMatch & {
  attachment: UniversalCommandAttachment
}

export function resolveTrackerAiSupportingChartPath(prompt: string, knowledgeContext = ''): SharedChartPath | null {
  return resolveSharedTrackerAiSupportingChartPath(prompt, knowledgeContext)
}

export async function buildTrackerAiSupportingChartAttachment(options: {
  prompt: string
  knowledgeContext?: string
  userId?: string
}): Promise<TrackerAiSupportingChartAttachment | null> {
  const path = resolveTrackerAiSupportingChartPath(options.prompt, options.knowledgeContext ?? '')
  if (!path) {
    return null
  }

  const renderResult = await renderChartAttachment(path, options.userId)
  if (renderResult.status !== 'ok') {
    logger.warn('TrackerAI supporting chart render was unavailable.', {
      pathId: path.id,
      status: renderResult.status,
      message: 'message' in renderResult ? renderResult.message : undefined,
    })
    return null
  }

  return {
    path,
    pathId: path.id,
    title: renderResult.attachment.title,
    description: renderResult.attachment.description,
    attachment: {
      name: renderResult.attachment.fileName,
      contentType: 'image/png',
      dataBase64: renderResult.attachment.imageBuffer.toString('base64'),
      description: renderResult.attachment.description,
      embedImage: true,
    },
  }
}