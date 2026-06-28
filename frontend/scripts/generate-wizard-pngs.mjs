import sharp from 'sharp'
import { mkdirSync, readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUTPUT_DIR = resolve(__dirname, '../src/assets/wizards')

function extractWizards(source) {
  const lines = source.split('\n')

  // Extract palettes: find all const PREFIX_PALETTE blocks
  const palettes = {}
  for (let i = 0; i < lines.length; i++) {
    const pm = lines[i].match(/const (\w+)_PALETTE\s*:\s*WizardPalette\s*=\s*\{/)
    if (!pm) continue
    const prefix = pm[1]
    const palette = {}
    i++
    while (i < lines.length && lines[i].trim() !== '}') {
      const em = lines[i].match(/(\w+)\s*:\s*'([^']+)'/)
      if (em) palette[em[1]] = em[2]
      i++
    }
    palettes[prefix] = palette
  }

  // Extract pixels
  const wizards = []
  for (let i = 0; i < lines.length; i++) {
    const pm = lines[i].match(/const (\w+_PIXELS) = \[/)
    if (!pm) continue
    const name = pm[1].replace(/_PIXELS$/, '')
    i++
    const rows = []
    while (i < lines.length && lines[i].trim() !== ']') {
      const t = lines[i].trim()
      if (t.startsWith("'") && (t.endsWith("',") || t.endsWith("'"))) {
        rows.push(t.replace(/^'/, '').replace(/,$/, '').replace(/'$/, ''))
      }
      i++
    }
    const palette = palettes[name]
    if (palette && rows.length > 0) {
      wizards.push({ id: name.toLowerCase(), palette, pixels: rows })
    }
  }

  return wizards
}

function renderSvg(wizard) {
  const cols = wizard.pixels[0].length
  const rows = wizard.pixels.length
  const P = 2
  const SCALE = 8

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${cols * SCALE}" height="${rows * SCALE}" viewBox="0 0 ${cols * P} ${rows * P}" style="image-rendering:pixelated">\n`

  for (let y = 0; y < rows; y++) {
    const row = wizard.pixels[y]
    for (let x = 0; x < row.length; x++) {
      const ch = row[x]
      if (ch === '.') continue
      const color = wizard.palette[ch]
      if (!color) continue
      svg += `  <rect x="${x * P}" y="${y * P}" width="${P}" height="${P}" fill="${color}" />\n`
    }
  }

  svg += '</svg>'
  return svg
}

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true })

  const source = readFileSync(resolve(__dirname, '../src/lib/gamification/wizards.ts'), 'utf-8')
  const wizards = extractWizards(source)

  if (wizards.length === 0) {
    console.error('No wizards extracted! Check extraction logic.')
    process.exit(1)
  }

  for (const wiz of wizards) {
    const svgContent = renderSvg(wiz)
    const svgBuffer = Buffer.from(svgContent)

    const filename = `wizard-${wiz.id}.png`
    const outPath = resolve(OUTPUT_DIR, filename)

    const meta = await sharp(svgBuffer).png().toFile(outPath)
    console.log(`✓ ${filename}  ${meta.width}×${meta.height}  (${wiz.pixels[0].length}×${wiz.pixels.length})`)
  }

  console.log('\n✓ All wizard PNGs in:', OUTPUT_DIR)
}

main().catch(console.error)
