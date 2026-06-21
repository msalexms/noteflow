#!/usr/bin/env node
// Generates public/icon.icns (macOS app icon) from public/icon.png.
// Cross-platform: uses sharp to render each required size and packs them into a
// valid ICNS container (PNG-encoded entries). No macOS tooling required.
//
//   node scripts/gen-icons.cjs
//
// The 512x512 master is upscaled to 1024 for the ic10 (retina) slot; everything
// else is downscaled. Run this whenever public/icon.png changes, then commit the
// resulting public/icon.icns.

const fs = require('fs')
const path = require('path')
const sharp = require('sharp')

const SRC = path.join(__dirname, '..', 'public', 'icon.png')
const OUT = path.join(__dirname, '..', 'public', 'icon.icns')

// OSType -> pixel size. These are the PNG-capable types modern macOS reads.
const ENTRIES = [
  ['ic07', 128],
  ['ic08', 256],
  ['ic09', 512],
  ['ic10', 1024], // 512@2x
  ['ic11', 32],   // 16@2x
  ['ic12', 64],   // 32@2x
  ['ic13', 256],  // 128@2x
  ['ic14', 512],  // 256@2x
]

async function main() {
  if (!fs.existsSync(SRC)) {
    console.error(`Source icon not found: ${SRC}`)
    process.exit(1)
  }

  const chunks = []
  for (const [osType, size] of ENTRIES) {
    const png = await sharp(SRC)
      .resize(size, size, { fit: 'contain', kernel: 'lanczos3' })
      .png()
      .toBuffer()
    const header = Buffer.alloc(8)
    header.write(osType, 0, 'ascii')
    header.writeUInt32BE(png.length + 8, 4)
    chunks.push(header, png)
  }

  const body = Buffer.concat(chunks)
  const fileHeader = Buffer.alloc(8)
  fileHeader.write('icns', 0, 'ascii')
  fileHeader.writeUInt32BE(body.length + 8, 4)

  fs.writeFileSync(OUT, Buffer.concat([fileHeader, body]))
  console.log(`Wrote ${OUT} (${(fs.statSync(OUT).size / 1024).toFixed(1)} KB, ${ENTRIES.length} sizes)`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
