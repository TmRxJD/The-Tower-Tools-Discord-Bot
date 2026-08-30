import { createCanvas } from '@napi-rs/canvas'
import {
  buildNapiRsCanvasChartRenderRuntime,
  defaultSharedUserToolSettings,
  getConfigurableTableHeaderRowIndex,
  renderConfiguredTableChartPng,
  type ChartPalettePresetId,
  type ChartDataAlignmentId,
  type ConfigurableCell,
  type ConfigurableMergeRange,
  type ConfigurableTableDocument,
  type SharedTableChartRenderInput,
  resolveChartThemeFromPreset,
} from '@tmrxjd/platform/tools'
import { getUserSharedSettings, type LocalSharedUserToolSettings } from './user-shared-settings-db'

const runtime = buildNapiRsCanvasChartRenderRuntime((width, height) => createCanvas(width, height))

async function resolveChartSettings(discordUserId?: string): Promise<LocalSharedUserToolSettings> {
  if (!discordUserId) {
    return defaultSharedUserToolSettings
  }

  try {
    return await getUserSharedSettings(discordUserId)
  } catch {
    return defaultSharedUserToolSettings
  }
}

function isHeaderLikeCell(cell: ConfigurableCell | undefined): boolean {
  if (!cell) return false
  const styleLink = String(cell.styleLink ?? '').toLowerCase()
  if (styleLink.includes('header')) return true
  return cell.style?.bold === true && cell.style?.wrap === true
}

function isMeaningfulCell(cell: ConfigurableCell | undefined): boolean {
  if (!cell) return false
  return String(cell.value ?? cell.formula ?? '').trim().length > 0
}

function resolveHeaderRowRange(rows: ConfigurableCell[][]): { start: number; endExclusive: number } {
  const start = getConfigurableTableHeaderRowIndex(rows)
  let endExclusive = start

  for (let rowIndex = start; rowIndex < rows.length; rowIndex += 1) {
    const meaningfulCells = (rows[rowIndex] ?? []).filter(isMeaningfulCell)
    if (meaningfulCells.length === 0) break
    if (!meaningfulCells.every(isHeaderLikeCell)) break
    endExclusive = rowIndex + 1
  }

  return {
    start,
    endExclusive: Math.max(start + 1, endExclusive),
  }
}

function applyBodyAlignment(rows: ConfigurableCell[][], alignment: ChartDataAlignmentId): ConfigurableCell[][] {
  const { endExclusive } = resolveHeaderRowRange(rows)
  return rows.map((row, rowIndex) => row.map(cell => {
    if (!cell) return cell
    if (rowIndex < endExclusive) return { ...cell, style: cell.style ? { ...cell.style } : undefined }
    if (isHeaderLikeCell(cell)) return { ...cell, style: cell.style ? { ...cell.style } : undefined }
    return {
      ...cell,
      style: {
        ...(cell.style ?? {}),
        align: alignment,
      },
    }
  }))
}

function applyStatGroupSeparators(document: ConfigurableTableDocument): ConfigurableTableDocument {
  if (!document.statGroups || document.statGroups.length === 0) {
    return document
  }

  const separatorWidth = 5
  const separatorPadding = 14
  const rows = document.rows.map(row => row.map(cell => (cell ? { ...cell, style: cell.style ? { ...cell.style } : undefined } : cell)))

  for (const group of document.statGroups) {
    const columns = [group.valueColumn, group.costColumn, group.totalColumn]
      .filter((value): value is number => value !== null && value !== undefined)
      .sort((left, right) => left - right)

    if (columns.length === 0) continue
    const firstColumn = columns[0]

    for (const row of rows) {
      if (firstColumn > 0 && row[firstColumn]) {
        row[firstColumn] = {
          ...row[firstColumn],
          style: {
            ...(row[firstColumn]?.style ?? {}),
            borderLeft: true,
            borderLeftWidth: separatorWidth,
            paddingX: Math.max(separatorPadding, Number(row[firstColumn]?.style?.paddingX ?? 0) || 0),
          },
        }
      }

      const previousColumn = firstColumn - 1
      if (previousColumn >= 0 && row[previousColumn]) {
        row[previousColumn] = {
          ...row[previousColumn],
          style: {
            ...(row[previousColumn]?.style ?? {}),
            paddingX: Math.max(separatorPadding, Number(row[previousColumn]?.style?.paddingX ?? 0) || 0),
          },
        }
      }
    }
  }

  return {
    ...document,
    rows,
  }
}

export async function renderTableChartPng(
  input: SharedTableChartRenderInput,
  discordUserId?: string,
): Promise<Buffer> {
  const settings = await resolveChartSettings(discordUserId)
  const chartTheme = resolveChartThemeFromPreset(settings.chartPalettePreset)
  const cellPaddingX = 6
  const footerLines = [
    ...(input.descriptionLines ?? []),
    ...(input.footerLines ?? []),
  ]
  const tableRows = [
    input.headers.map(header => ({ value: header, styleLink: 'header' })),
    ...input.rows.map(row => row.map(value => ({ value, styleLink: 'body' }))),
  ]

  const document: ConfigurableTableDocument = {
    title: input.title,
    rows: tableRows,
    rowHeights: [52],
    footerLines,
  }

  const bytes = await renderConfiguredTableChartPng(document, runtime, {
    linkedStyles: {
      header: {
        bold: true,
        align: 'center',
        verticalAlign: 'middle',
        wrap: true,
      },
      body: {
        align: settings.chartDataAlignment,
        verticalAlign: 'middle',
      },
    },
    cellDefaults: {
      align: settings.chartDataAlignment,
      verticalAlign: 'middle',
    },
    mode: 'configurable',
    margins: {
      top: 40,
      right: 36,
      bottom: 40,
      left: 36,
    },
    theme: {
      pageBackground: chartTheme.canvasBackground,
      tableBackground: chartTheme.cardBackground,
      border: chartTheme.borderColor,
      text: chartTheme.textPrimary,
      fontFamily: chartTheme.fontFamily,
      fontSize: chartTheme.bodyFontSize,
      titleColor: chartTheme.textPrimary,
      titleSize: chartTheme.titleFontSize,
      headerBackground: chartTheme.headerBackground,
      evenRowBackground: chartTheme.rowBackgroundPrimary,
      oddRowBackground: chartTheme.rowBackgroundSecondary,
      cellPaddingX,
    },
  })
  return Buffer.from(bytes)
}

export async function renderConfigurableTablePng(document: ConfigurableTableDocument, discordUserId?: string): Promise<Buffer> {
  const settings = await resolveChartSettings(discordUserId)
  const chartTheme = resolveChartThemeFromPreset(settings.chartPalettePreset)
  const cellPaddingX = 6
  const alignedDocument = applyStatGroupSeparators({
    ...document,
    rows: applyBodyAlignment(document.rows, settings.chartDataAlignment),
  })
  const bytes = await renderConfiguredTableChartPng(alignedDocument, runtime, {
    linkedStyles: {
      header: {
        bold: true,
        align: 'center',
        verticalAlign: 'middle',
        wrap: true,
      },
      allHeaders: {
        bold: true,
        align: 'center',
        verticalAlign: 'middle',
        wrap: true,
      },
    },
    cellDefaults: {
      align: settings.chartDataAlignment,
      verticalAlign: 'middle',
    },
    margins: {
      top: 40,
      right: 36,
      bottom: 40,
      left: 42,
    },
    theme: {
      pageBackground: chartTheme.canvasBackground,
      tableBackground: chartTheme.cardBackground,
      border: chartTheme.borderColor,
      text: chartTheme.textPrimary,
      fontFamily: chartTheme.fontFamily,
      fontSize: chartTheme.bodyFontSize,
      titleColor: chartTheme.textPrimary,
      titleSize: chartTheme.titleFontSize,
      headerBackground: chartTheme.headerBackground,
      evenRowBackground: chartTheme.rowBackgroundPrimary,
      oddRowBackground: chartTheme.rowBackgroundSecondary,
      cellPaddingX,
    },
  })
  return Buffer.from(bytes)
}
