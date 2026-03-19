const fs = require('fs')
const path = require('path')
const { createCanvas } = require('@napi-rs/canvas')
const {
  sharedChartRendererRegistry,
  getAllChartPaths,
  createChartRenderRequest,
  renderSharedChartPng,
} = require('@tmrxjd/platform/tools')

function slug(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function pickOnePerRendererKey() {
  const seen = new Set()
  const picked = []
  for (const definition of sharedChartRendererRegistry) {
    if (seen.has(definition.rendererKey)) continue
    seen.add(definition.rendererKey)
    picked.push(definition)
  }
  return picked
}

function buildPathLookup() {
  const lookup = new Map()
  const paths = getAllChartPaths()
  for (const chartPath of paths) {
    if (!lookup.has(chartPath.id)) {
      lookup.set(chartPath.id, chartPath)
    }
  }
  return lookup
}

async function main() {
  const outputArg = process.argv[2]
  const presetArg = process.argv[3] || 'default'
  const outputDir = outputArg
    ? path.resolve(outputArg)
    : path.resolve(__dirname, '../../../chart-review', `${new Date().toISOString().slice(0, 10)}-${presetArg}`)

  fs.mkdirSync(outputDir, { recursive: true })

  const runtime = {
    createCanvas(width, height) {
      return createCanvas(width, height)
    },
    toPngBytes(canvas) {
      return canvas.toBuffer('image/png')
    },
  }

  const selectedDefinitions = pickOnePerRendererKey()
  const pathLookup = buildPathLookup()
  const manifest = {
    generatedAt: new Date().toISOString(),
    chartPalettePreset: presetArg,
    outputDir,
    totalRequested: selectedDefinitions.length,
    rendered: [],
    failed: [],
  }

  for (const definition of selectedDefinitions) {
    const source = pathLookup.get(definition.pathId)
    if (!source || !source.category || !source.subcategory || !source.item) {
      manifest.failed.push({ pathId: definition.pathId, rendererKey: definition.rendererKey, error: 'Invalid pathId shape' })
      continue
    }

    const request = createChartRenderRequest(source)
    if (!request) {
      manifest.failed.push({ pathId: definition.pathId, rendererKey: definition.rendererKey, error: 'Render request unavailable' })
      continue
    }

    try {
      const pngBytes = await renderSharedChartPng(request.rendererKey, request.args, runtime, {
        chartPalettePreset: presetArg,
      })

      const fileName = `${String(manifest.rendered.length + 1).padStart(2, '0')}-${slug(request.path.category)}--${slug(request.path.subcategory)}--${slug(request.path.item)}.png`
      const filePath = path.join(outputDir, fileName)
      fs.writeFileSync(filePath, Buffer.from(pngBytes))

      manifest.rendered.push({
        fileName,
        rendererKey: request.rendererKey,
        pathId: request.path.id,
        category: request.path.category,
        subcategory: request.path.subcategory,
        item: request.path.item,
        args: [...request.args],
        bytes: Buffer.byteLength(Buffer.from(pngBytes)),
      })
      process.stdout.write(`Rendered: ${fileName}\n`)
    } catch (error) {
      manifest.failed.push({
        rendererKey: request.rendererKey,
        pathId: request.path.id,
        category: request.path.category,
        subcategory: request.path.subcategory,
        item: request.path.item,
        error: error instanceof Error ? error.message : String(error),
      })
      process.stdout.write(`FAILED: ${request.path.id}\n`)
    }
  }

  const manifestPath = path.join(outputDir, 'manifest.json')
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))

  process.stdout.write(`\nReview set generated in: ${outputDir}\n`)
  process.stdout.write(`Rendered: ${manifest.rendered.length}\n`)
  process.stdout.write(`Failed: ${manifest.failed.length}\n`)

  if (manifest.failed.length > 0) {
    process.exitCode = 1
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
