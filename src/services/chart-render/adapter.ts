import {
  createNapiRsCanvasChartRenderRuntime,
  renderSharedChartPng,
  type ChartPalettePresetId,
  type SharedChartRendererKey,
} from '@tmrxjd/platform/tools'
import { createCanvas } from '@napi-rs/canvas'

const runtime = createNapiRsCanvasChartRenderRuntime((width, height) => createCanvas(width, height))

export async function renderSharedChartByKey(
  rendererKey: SharedChartRendererKey,
  args: readonly string[],
  chartPalettePreset: ChartPalettePresetId,
): Promise<Buffer> {
  const bytes = await renderSharedChartPng(rendererKey, args, runtime, { chartPalettePreset })
  return Buffer.from(bytes)
}
