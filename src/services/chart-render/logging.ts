import { logger } from '../../core/logger'

export function normalizeChartRenderErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown chart renderer error'
}

export function logChartRenderFailure(pathId: string, message: string): void {
  logger.error(`[chart] Failed to render ${pathId}: ${message}`)
}
