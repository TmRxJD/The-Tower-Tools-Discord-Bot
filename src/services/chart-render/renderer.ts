import {
  buildChartStudioPreviewDocument,
  createChartRenderRequest,
  type SharedChartPath,
} from '@tmrxjd/platform/tools'
import {
  buildRenderedChartAttachment,
} from './attachment'
import {
  logChartRenderFailure,
  normalizeChartRenderErrorMessage,
} from './logging'
import { type ChartRenderResult } from './result'
import { renderConfigurableTablePng } from '../table-chart-render'

export async function renderChartAttachment(
  path: SharedChartPath | null,
  discordUserId?: string,
  options?: { selectedStats?: string[] },
): Promise<ChartRenderResult> {
  const renderRequest = createChartRenderRequest(path)
  if (!renderRequest) return { status: 'unavailable' }

  try {
    const document = buildChartStudioPreviewDocument(renderRequest.path, {
      preferredStatNames: options?.selectedStats,
    })
    if (!document) {
      return { status: 'unavailable' }
    }

    const imageBuffer = await renderConfigurableTablePng(document, discordUserId)
    return {
      status: 'ok',
      attachment: buildRenderedChartAttachment(renderRequest, imageBuffer),
      rendererKey: renderRequest.rendererKey,
    }
  } catch (error) {
    const message = normalizeChartRenderErrorMessage(error)
    logChartRenderFailure(renderRequest.path.id, message)
    return {
      status: 'error',
      message,
    }
  }
}
