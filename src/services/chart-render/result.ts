import { type RenderedChartAttachment } from './attachment'
import type { SharedChartRendererKey } from '@tmrxjd/platform/tools'

export type ChartRenderSuccessResult = {
  status: 'ok'
  attachment: RenderedChartAttachment
  rendererKey: SharedChartRendererKey
}

export type ChartRenderUnavailableResult = {
  status: 'unavailable'
}

export type ChartRenderErrorResult = {
  status: 'error'
  message: string
}

export type ChartRenderResult =
  | ChartRenderSuccessResult
  | ChartRenderUnavailableResult
  | ChartRenderErrorResult

export function isChartRenderSuccess(result: ChartRenderResult): result is ChartRenderSuccessResult {
  return result.status === 'ok'
}

export function isChartRenderError(result: ChartRenderResult): result is ChartRenderErrorResult {
  return result.status === 'error'
}
