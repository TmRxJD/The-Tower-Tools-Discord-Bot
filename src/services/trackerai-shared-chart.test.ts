import { describe, expect, it, vi } from 'vitest'
import { resolveTrackerAiSupportingChartPath, buildTrackerAiSupportingChartAttachment } from './trackerai-shared-chart'

const renderChartAttachment = vi.fn()

vi.mock('./chart-render/renderer', () => ({
  renderChartAttachment: (...args: unknown[]) => renderChartAttachment(...args),
}))

describe('trackerai-shared-chart', () => {
  it('selects the golden bot versus death wave uptime chart for sync questions', () => {
    const path = resolveTrackerAiSupportingChartPath('how do i sync gb and dw?')

    expect(path).not.toBeNull()
    expect(path?.id).toBe('ultimate-weapons:death-wave:gold-bot-vs-death-wave-uptime')
  })

  it('does not attach charts to plain definition prompts', () => {
    const path = resolveTrackerAiSupportingChartPath('what does black hole do?')

    expect(path).toBeNull()
  })

  it('builds a universal attachment payload for a rendered supporting chart', async () => {
    renderChartAttachment.mockResolvedValue({
      status: 'ok',
      rendererKey: 'gold-bot-vs-death-wave-uptime',
      attachment: {
        title: 'Golden Bot vs Death Wave Uptime',
        description: 'Use the chart to compare overlap windows.',
        fileName: 'gold-bot-vs-death-wave-uptime.png',
        color: 0x3b82f6,
        imageBuffer: Buffer.from('chart-bytes'),
      },
    })

    const result = await buildTrackerAiSupportingChartAttachment({
      prompt: 'how do i sync gb and dw?',
      userId: 'user-1',
    })

    expect(result).not.toBeNull()
    expect(result?.pathId).toBe('ultimate-weapons:death-wave:gold-bot-vs-death-wave-uptime')
    expect(result?.attachment.name).toBe('gold-bot-vs-death-wave-uptime.png')
    expect(result?.attachment.dataBase64).toBe(Buffer.from('chart-bytes').toString('base64'))
    expect(result?.attachment.embedImage).toBe(true)
  })
})