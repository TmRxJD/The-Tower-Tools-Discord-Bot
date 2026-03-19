import { type SharedChartRenderRequest } from '@tmrxjd/platform/tools'

export interface RenderedChartAttachment {
  title: string
  description: string
  fileName: string
  color: number
  imageBuffer: Buffer
  creatorCredit?: string
}

function parseHexColor(input: string): number {
  const normalized = input.replace('#', '')
  const parsed = Number.parseInt(normalized, 16)
  return Number.isFinite(parsed) ? parsed : 0x3b82f6
}

export function buildRenderedChartAttachment(
  renderRequest: SharedChartRenderRequest,
  imageBuffer: Buffer,
): RenderedChartAttachment {
  return {
    title: renderRequest.definition.title,
    description: renderRequest.definition.description,
    fileName: renderRequest.definition.fileName,
    color: parseHexColor(renderRequest.definition.colorHex),
    imageBuffer,
    creatorCredit: renderRequest.definition.creatorCredit,
  }
}
