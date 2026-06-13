/**
 * Generates every favicon / PWA / social-share image from inline SVG masters.
 *
 *   npm run assets
 *
 * The SVG below is the single source of truth (version-controlled, on-brand with
 * styles/main.css). PNGs are rasterised by a headless Chromium (Edge or Chrome —
 * already on the machine), so we add **zero dependencies** and the binaries stay
 * fully reproducible. Run it whenever the brand mark changes.
 *
 * Outputs (all at repo root, so they serve from `/favicon.svg`, `/og-image.png`, …):
 *   favicon.svg  favicon.ico  favicon-16.png  favicon-32.png
 *   apple-touch-icon.png  icon-192.png  icon-512.png  icon-maskable-512.png
 *   og-image.png (1200×630 — Open Graph / Twitter large card)
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

// ── locate a Chromium ────────────────────────────────────────────────────────
const CANDIDATES = [
  process.env.CHROME,
  process.env.EDGE,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean) as string[];

function findBrowser(): string {
  for (const p of CANDIDATES) {
    try { readFileSync(p); return p; } catch { /* keep looking */ }
  }
  throw new Error(
    'No Chromium found. Set CHROME=/path/to/chrome (or EDGE=…) and re-run `npm run assets`.',
  );
}

// ── brand tokens (kept in sync with styles/main.css) ─────────────────────────
const INK = '#0c0e13';
const ASPHALT = '#171a21';
const AMBER = '#ffb454';
const FLAME = '#ff6a3d';
const EMBER = '#d6431a';
const SEAM = '#2a0f06';
const CHALK = '#f0ebe0';
const MINT = '#7ee8c7';

/** The basketball, centred at (0,0) with the given radius. */
const ball = (r: number, stroke: number) => `
  <g>
    <circle r="${r}" fill="url(#ball)"/>
    <g fill="none" stroke="${SEAM}" stroke-width="${stroke}" stroke-linecap="round" opacity="0.92">
      <path d="M0 ${-r}V${r}"/>
      <path d="M${-r} 0H${r}"/>
      <path d="M${-r * 0.72} ${-r * 0.72}c${r * 0.36} ${r * 0.29} ${r * 0.36} ${r * 1.15} 0 ${r * 1.44}"/>
      <path d="M${r * 0.72} ${-r * 0.72}c${-r * 0.36} ${r * 0.29} ${-r * 0.36} ${r * 1.15} 0 ${r * 1.44}"/>
    </g>
  </g>`;

const ballGradient = `
  <radialGradient id="ball" cx="38%" cy="32%" r="78%">
    <stop offset="0%" stop-color="${AMBER}"/>
    <stop offset="55%" stop-color="${FLAME}"/>
    <stop offset="100%" stop-color="${EMBER}"/>
  </radialGradient>`;

// ── SVG masters ──────────────────────────────────────────────────────────────

/** Tiny transparent mark — reads cleanly at 16px. Written to disk as favicon.svg. */
const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-32 -32 64 64" width="64" height="64" role="img" aria-label="SWIISHH">
  <defs>${ballGradient}</defs>
  ${ball(29, 3.4)}
</svg>`;

/** App icon: dark rounded tile + floodlit ball. `bleed`=true → maskable (no corners, more padding). */
const appIcon = (size: number, bleed = false) => {
  const r = bleed ? 122 : 150;
  const rx = bleed ? 0 : 112;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="${size}" height="${size}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${ASPHALT}"/><stop offset="1" stop-color="${INK}"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="28%" r="72%">
      <stop offset="0" stop-color="${AMBER}" stop-opacity="0.24"/>
      <stop offset="100%" stop-color="${AMBER}" stop-opacity="0"/>
    </radialGradient>
    ${ballGradient}
  </defs>
  <rect width="512" height="512" rx="${rx}" fill="url(#bg)"/>
  <rect width="512" height="512" rx="${rx}" fill="url(#glow)"/>
  <g transform="translate(256 256)">${ball(r, r / 10.7)}</g>
</svg>`;
};

/** 1200×630 social card (Open Graph / Twitter large image). */
const ogImage = () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#10131a"/><stop offset="1" stop-color="${INK}"/>
    </linearGradient>
    <radialGradient id="flood" cx="50%" cy="-8%" r="62%">
      <stop offset="0" stop-color="${AMBER}" stop-opacity="0.30"/>
      <stop offset="100%" stop-color="${AMBER}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="vig" cx="50%" cy="44%" r="72%">
      <stop offset="55%" stop-color="#000000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#03040a" stop-opacity="0.6"/>
    </radialGradient>
    ${ballGradient}
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect width="1200" height="630" fill="url(#flood)"/>

  <!-- chalk court lines, lower-left key -->
  <g fill="none" stroke="${CHALK}" stroke-opacity="0.09" stroke-width="3">
    <path d="M-40 588 H1240"/>
    <path d="M96 588 V456 H344 V588"/>
    <path d="M220 456 m-92 0 a92 92 0 0 0 184 0"/>
  </g>

  <g transform="translate(220 286)">${ball(150, 14)}</g>

  <!-- wordmark (textLength locks the width so Bungee can't overflow) -->
  <text x="410" y="270" font-size="118" font-family="'Bungee','Arial Black',Impact,sans-serif"
        fill="${CHALK}" textLength="680" lengthAdjust="spacingAndGlyphs">SWIISHH<tspan fill="${FLAME}">.</tspan></text>

  <g font-family="'IBM Plex Mono','Consolas',ui-monospace,monospace">
    <text x="412" y="336" font-size="28" fill="${CHALK}" fill-opacity="0.62" letter-spacing="2">hand-tracked streetball · no install</text>
    <line x1="412" y1="392" x2="1092" y2="392" stroke="${CHALK}" stroke-opacity="0.14" stroke-width="2"/>
    <text x="412" y="452" font-size="27" fill="${MINT}" letter-spacing="1">+3 SWISH</text>
    <text x="556" y="452" font-size="27" fill="${CHALK}" fill-opacity="0.55" letter-spacing="1">· pinch · aim · flick</text>
    <text x="412" y="520" font-size="25" fill="${AMBER}" letter-spacing="2">swiishh.sindbug.com</text>
  </g>
</svg>`;

// ── rasterise via headless Chromium ──────────────────────────────────────────
const browser = findBrowser();
const work = mkdtempSync(join(tmpdir(), 'swiishh-assets-'));
const profile = join(work, 'profile');

function render(svg: string, w: number, h: number, out: string, useWebFonts = false) {
  const fonts = useWebFonts
    ? `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Bungee&family=IBM+Plex+Mono:wght@400;600&display=block" rel="stylesheet">`
    : '';
  const html = `<!doctype html><html><head><meta charset="utf-8">${fonts}<style>*{margin:0;padding:0}html,body{overflow:hidden}svg{display:block}</style></head><body>${svg}</body></html>`;
  const page = join(work, 'page.html');
  writeFileSync(page, html);
  const args = [
    '--headless=new', '--disable-gpu', '--hide-scrollbars',
    '--no-first-run', '--no-default-browser-check',
    `--user-data-dir=${profile}`,
    '--force-device-scale-factor=1',
    '--default-background-color=00000000',
    `--window-size=${w},${h}`,
    `--virtual-time-budget=${useWebFonts ? 6000 : 1200}`,
    `--screenshot=${join(ROOT, out)}`,
    pathToFileURL(page).href,
  ];
  const res = spawnSync(browser, args, { stdio: 'ignore' });
  if (res.status !== 0 && res.error) throw res.error;
  const png = readFileSync(join(ROOT, out));
  if (png.slice(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error(`bad PNG: ${out}`);
  console.log(`  ✓ ${out.padEnd(24)} ${png.readUInt32BE(16)}×${png.readUInt32BE(20)}`);
}

/** Wrap a PNG (here 32×32) in a single-image .ico container. */
function icoFrom(pngPath: string, out: string) {
  const png = readFileSync(join(ROOT, pngPath));
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0);       // reserved
  header.writeUInt16LE(1, 2);       // type = icon
  header.writeUInt16LE(1, 4);       // image count
  header.writeUInt8(32, 6);         // width  (32px)
  header.writeUInt8(32, 7);         // height (32px)
  header.writeUInt8(0, 8);          // palette
  header.writeUInt8(0, 9);          // reserved
  header.writeUInt16LE(1, 10);      // colour planes
  header.writeUInt16LE(32, 12);     // bits per pixel
  header.writeUInt32LE(png.length, 14); // bytes of image data
  header.writeUInt32LE(22, 18);     // offset to image data
  writeFileSync(join(ROOT, out), Buffer.concat([header, png]));
  console.log(`  ✓ ${out.padEnd(24)} (embeds ${pngPath})`);
}

console.log(`Rasterising with: ${browser}\n`);
writeFileSync(join(ROOT, 'favicon.svg'), faviconSvg);
console.log('  ✓ favicon.svg');

render(faviconSvg, 16, 16, 'favicon-16.png');
render(faviconSvg, 32, 32, 'favicon-32.png');
render(appIcon(180), 180, 180, 'apple-touch-icon.png');
render(appIcon(192), 192, 192, 'icon-192.png');
render(appIcon(512), 512, 512, 'icon-512.png');
render(appIcon(512, true), 512, 512, 'icon-maskable-512.png');
render(ogImage(), 1200, 630, 'og-image.png', /* useWebFonts */ true);
icoFrom('favicon-32.png', 'favicon.ico');

rmSync(work, { recursive: true, force: true });
console.log('\nDone — all share/icon assets regenerated.');
