'use strict';

// Genera todos los iconos para NoteFlow desktop y mobile desde el SVG fuente.
// Uso: node scripts/generate-icons.js
// Ejecutar desde la raíz del proyecto desktop (noteflow/).

const path = require('path');
const fs   = require('fs');
const sharp = require('sharp');

const SVG_SOURCE    = 'C:/Users/yagoi/Downloads/noteflow-icon-bold.svg';
const DESKTOP_PUBLIC = path.resolve(__dirname, '../public');
const MOBILE_ASSETS  = path.resolve(__dirname, '../../noteflow-mobile/assets/images');
const TMP           = path.resolve(__dirname, '../.tmp-icons');

// ── SVG variants ──────────────────────────────────────────────────────────────

function getSvgFull() {
  return fs.readFileSync(SVG_SOURCE, 'utf8');
}

function getSvgForeground() {
  // Elimina el rect de fondo (con fill="#0d0d0f") → fondo transparente
  return getSvgFull().replace(
    /[ \t]*<!--[^>]*Background[^>]*-->\s*\n?\s*<rect[^>]*fill="#0d0d0f"[^/]*\/>/,
    ''
  );
}

function getSvgMonochrome() {
  // Todos los fills → blanco (para adaptive icon monocromático de Android 13+)
  return getSvgForeground().replace(/fill="#[0-9a-fA-F]{3,6}"/g, 'fill="#ffffff"');
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function rasterize(svgString, size, destPath) {
  await sharp(Buffer.from(svgString))
    .resize(size, size)
    .png()
    .toFile(destPath);
  console.log(`  ✓ ${destPath}`);
}

async function solidPng(color, size, destPath) {
  await sharp({
    create: { width: size, height: size, channels: 4, background: color }
  })
  .png()
  .toFile(destPath);
  console.log(`  ✓ ${destPath}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  fs.mkdirSync(TMP, { recursive: true });
  fs.mkdirSync(DESKTOP_PUBLIC, { recursive: true });
  fs.mkdirSync(MOBILE_ASSETS, { recursive: true });

  const svgFull = getSvgFull();
  const svgFg   = getSvgForeground();
  const svgMono = getSvgMonochrome();

  // ── Desktop ────────────────────────────────────────────────────────────────
  console.log('\n[Desktop]');

  await rasterize(svgFull, 512, path.join(DESKTOP_PUBLIC, 'icon.png'));
  await rasterize(svgFull, 256, path.join(DESKTOP_PUBLIC, 'tray-icon.png'));

  // ICO multi-size — png-to-ico necesita rutas de archivo, no buffers
  const icoSizes = [16, 32, 48, 64, 128, 256];
  const tmpPaths = [];
  for (const sz of icoSizes) {
    const tmpFile = path.join(TMP, `icon-${sz}.png`);
    await rasterize(svgFull, sz, tmpFile);
    tmpPaths.push(tmpFile);
  }

  const { default: pngToIco } = await import('png-to-ico');
  const icoBuffer = await pngToIco(tmpPaths);
  const icoPath = path.join(DESKTOP_PUBLIC, 'icon.ico');
  fs.writeFileSync(icoPath, icoBuffer);
  console.log(`  ✓ ${icoPath}`);

  for (const f of tmpPaths) fs.unlinkSync(f);
  fs.rmdirSync(TMP);

  // ── Mobile ─────────────────────────────────────────────────────────────────
  console.log('\n[Mobile]');

  await rasterize(svgFull, 1024, path.join(MOBILE_ASSETS, 'icon.png'));
  await rasterize(svgFull, 1024, path.join(MOBILE_ASSETS, 'splash-icon.png'));
  await rasterize(svgFull,   48, path.join(MOBILE_ASSETS, 'favicon.png'));
  await rasterize(svgFg,    512, path.join(MOBILE_ASSETS, 'android-icon-foreground.png'));
  await solidPng({ r: 9, g: 9, b: 9, alpha: 1 }, 512,
    path.join(MOBILE_ASSETS, 'android-icon-background.png'));
  await rasterize(svgMono,  432, path.join(MOBILE_ASSETS, 'android-icon-monochrome.png'));

  console.log('\nDone.');
}

main().catch(err => {
  console.error('\nError:', err.message);
  process.exit(1);
});
