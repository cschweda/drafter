// Builds Drafter's brand files: the share image, the logo, and the icons.
// Every letter is converted to an outline with fontkit, so the SVGs need no
// fonts to render the same everywhere, GitHub's README included. The PNGs are
// rendered from the SVGs with rsvg-convert (librsvg).
//
//   node brand/build.mjs          (from the repository root, after pnpm install)

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const here = (path) => new URL(path, import.meta.url);
const repo = (path) => new URL(`../${path}`, import.meta.url);

// fontkit comes with @drafter/render-pdf, which embeds Courier Prime with it.
const fontkit = createRequire(repo('packages/render-pdf/package.json'))('@pdf-lib/fontkit');
const font = (url) => fontkit.create(readFileSync(url));
const FONTS = {
  extraBold: font(here('fonts/InterTight-ExtraBold.ttf')),
  semiBold: font(here('fonts/InterTight-SemiBold.ttf')),
  courier: font(repo('packages/render-pdf/fonts/CourierPrime-Regular.ttf')),
  courierBold: font(repo('packages/render-pdf/fonts/CourierPrime-Bold.ttf')),
};

/** Industry revision-page colors, in the order a script goes through them. */
const REVISION = {
  white: '#FFFFFF',
  blue: '#8DB8E8',
  pink: '#F5A9C0',
  yellow: '#F6E07A',
  green: '#9BD3A0',
  goldenrod: '#E5B04A',
  buff: '#EBD7A9',
  salmon: '#F49C84',
  cherry: '#D9466B',
};
const INK = '#111216';

// --- Lettering -------------------------------------------------------------

const round = (d) => d.replace(/-?\d*\.\d+/g, (n) => String(Math.round(Number(n) * 100) / 100));

/** How wide a line of text sets, in pixels, with `tracking` added between letters. */
function measure(face, string, size, tracking = 0) {
  const run = face.layout(string);
  const scale = size / face.unitsPerEm;
  return (
    run.positions.reduce((w, p) => w + p.xAdvance * scale, 0) + tracking * (run.glyphs.length - 1)
  );
}

/** A line of text as one outlined path. `x` is where `anchor` falls; `y` is the baseline. */
function text(face, string, { x, y, size, fill, tracking = 0, anchor = 'start' }) {
  const run = face.layout(string);
  const scale = size / face.unitsPerEm;
  const width = measure(face, string, size, tracking);
  let pen = anchor === 'end' ? x - width : anchor === 'middle' ? x - width / 2 : x;
  const outlines = [];
  run.glyphs.forEach((glyph, i) => {
    const at = run.positions[i];
    const d = glyph.path
      .scale(scale, -scale)
      .translate(pen + at.xOffset * scale, y - at.yOffset * scale)
      .toSVG();
    if (d) outlines.push(d);
    pen += at.xAdvance * scale + tracking;
  });
  return `<path fill="${fill}" d="${round(outlines.join(''))}"/>`;
}

/** The baseline that centers a word's ink on `middle`. */
function baselineFor(face, string, size, middle) {
  const { minY, maxY } = face.layout(string).bbox;
  return middle + ((minY + maxY) / 2) * (size / face.unitsPerEm);
}

// --- The mark: source on the left of the line, script on the right ----------

const gradient = (id) =>
  `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">` +
  `<stop offset="0" stop-color="${REVISION.blue}"/>` +
  `<stop offset="0.5" stop-color="${REVISION.pink}"/>` +
  `<stop offset="1" stop-color="${REVISION.yellow}"/></linearGradient>`;

/** The seven bars of the mark, on a 56-unit tile. */
const BARS =
  '<rect x="11" y="17" width="13" height="4" rx="2"/>' +
  '<rect x="11" y="26" width="9" height="4" rx="2"/>' +
  '<rect x="11" y="35" width="13" height="4" rx="2"/>' +
  '<rect x="27.25" y="13" width="1.5" height="30" opacity="0.35"/>' +
  '<rect x="35" y="17" width="9" height="4" rx="2"/>' +
  '<rect x="32" y="26" width="15" height="4" rx="2"/>' +
  '<rect x="32" y="35" width="13" height="4" rx="2"/>';

/** The mark at `size` pixels: a rounded tile, or a full square that a launcher masks itself. */
function mark({ x = 0, y = 0, size = 56, id, square = false, inset = 1 }) {
  const s = size / 56;
  const bars =
    inset === 1
      ? BARS
      : `<g transform="translate(28 28) scale(${inset}) translate(-28 -28)">${BARS}</g>`;
  return (
    `<g transform="translate(${x} ${y}) scale(${s})">` +
    `<rect width="56" height="56" rx="${square ? 0 : 14}" fill="url(#${id})"/>` +
    `<g fill="${INK}">${bars}</g></g>`
  );
}

const svg = (width, height, body, title) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"${
    title ? ' role="img"' : ' aria-hidden="true"'
  }>${title ? `<title>${title}</title>` : ''}${body}</svg>\n`;

// --- Files ------------------------------------------------------------------

const files = {};

files['mark.svg'] = svg(56, 56, `<defs>${gradient('g')}</defs>${mark({ id: 'g' })}`, 'Drafter');

/** Drawn on a 32-pixel grid so it stays crisp at 32 and 16 pixels. */
files['favicon.svg'] = svg(
  32,
  32,
  `<defs>${gradient('g')}</defs><rect width="32" height="32" rx="7" fill="url(#g)"/>` +
    `<g fill="${INK}">` +
    '<rect x="6" y="8" width="8" height="2" rx="1"/><rect x="6" y="14" width="6" height="2" rx="1"/>' +
    '<rect x="6" y="20" width="8" height="2" rx="1"/><rect x="15" y="6" width="2" height="18" opacity="0.35"/>' +
    '<rect x="20" y="8" width="4" height="2" rx="1"/><rect x="18" y="14" width="8" height="2" rx="1"/>' +
    '<rect x="18" y="20" width="6" height="2" rx="1"/></g>',
  'Drafter',
);

/** The navbar logo: the mark and the wordmark, for dark and for light backgrounds. */
for (const [name, color] of [
  ['logo-dark.svg', '#FFFFFF'],
  ['logo-light.svg', INK],
]) {
  const size = 44;
  const tracking = -1.8;
  const gap = 14;
  const width = Math.ceil(56 + gap + measure(FONTS.extraBold, 'drafter', size, tracking));
  const baseline = baselineFor(FONTS.extraBold, 'drafter', size, 28);
  files[name] = svg(
    width,
    56,
    `<defs>${gradient('g')}</defs>${mark({ id: 'g' })}` +
      text(FONTS.extraBold, 'drafter', { x: 56 + gap, y: baseline, size, fill: color, tracking }),
    'Drafter',
  );
}

/** The share image (og:image) and the top of the README: 1200 × 630. */
{
  const page = (angle, color, content = '') =>
    `<g transform="rotate(${angle} 1010 720)"><rect x="850" y="140" width="320" height="440" rx="10" fill="${color}"/>${content}</g>`;
  const courier = (string, x, y, options = {}) =>
    text(options.bold ? FONTS.courierBold : FONTS.courier, string, {
      x,
      y,
      size: options.size ?? 15,
      fill: options.fill ?? '#1C1C1C',
      anchor: options.anchor,
    });
  const bar = (x, y, width) =>
    `<rect x="${x}" y="${y}" width="${width}" height="6" rx="3" fill="#ECECEC"/>`;
  const script =
    courier('1.', 1146, 176, { size: 12, fill: '#888888', anchor: 'end' }) +
    courier('INT. KITCHEN - NIGHT', 878, 214, { bold: true }) +
    courier("The phone doesn't ring.", 878, 248) +
    courier('MARGARET', 962, 290) +
    courier('(quietly)', 936, 309) +
    courier("You said you'd call.", 912, 328) +
    bar(878, 366, 230) +
    bar(878, 382, 200) +
    bar(962, 416, 70) +
    bar(912, 432, 170);
  const fan = [
    [-22, REVISION.cherry],
    [-19, REVISION.salmon],
    [-16, REVISION.buff],
    [-13, REVISION.goldenrod],
    [-10, REVISION.green],
    [-7, REVISION.yellow],
    [-4, REVISION.pink],
    [-1, REVISION.blue],
  ]
    .map(([angle, color]) => page(angle, color))
    .join('');
  const dots = [
    REVISION.blue,
    REVISION.pink,
    REVISION.yellow,
    REVISION.green,
    REVISION.goldenrod,
    REVISION.salmon,
  ]
    .map((color, i) => `<circle cx="${78 + i * 20}" cy="548" r="7" fill="${color}"/>`)
    .join('');
  files['og-image.svg'] = svg(
    1200,
    630,
    '<defs>' +
      '<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#121318"/><stop offset="1" stop-color="#0B0C0F"/></linearGradient>' +
      '<filter id="shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#000000" flood-opacity="0.45"/></filter>' +
      `${gradient('g')}</defs>` +
      '<rect width="1200" height="630" fill="url(#bg)"/>' +
      `<g filter="url(#shadow)">${fan}${page(2, REVISION.white, script)}</g>` +
      mark({ x: 76, y: 76, size: 48, id: 'g' }) +
      text(FONTS.extraBold, 'drafter', {
        x: 72,
        y: 318,
        size: 124,
        fill: '#FFFFFF',
        tracking: -5,
      }) +
      text(FONTS.semiBold, 'Screenplays and stage plays,', {
        x: 76,
        y: 384,
        size: 32,
        fill: '#AEB4C0',
      }) +
      text(FONTS.semiBold, 'written in plain text.', { x: 76, y: 426, size: 32, fill: '#AEB4C0' }) +
      dots +
      text(FONTS.semiBold, 'drafter.dev', { x: 198, y: 557, size: 24, fill: '#E8EAEE' }),
    'Drafter: screenplays and stage plays, written in plain text',
  );
}

/** Square art for launchers that mask icons themselves (iOS, Android's maskable icons). */
files['icon-square.svg'] = svg(
  512,
  512,
  `<defs>${gradient('g')}</defs>${mark({ size: 512, id: 'g', square: true, inset: 0.8 })}`,
);

for (const [name, content] of Object.entries(files)) writeFileSync(here(name), content);

// --- PNGs and the .ico ----------------------------------------------------------

const png = (source, size, out, height = size) =>
  execFileSync('rsvg-convert', [
    '-w',
    String(size),
    '-h',
    String(height),
    '-o',
    here(out).pathname,
    here(source).pathname,
  ]);

png('og-image.svg', 1200, 'og-image.png', 630);
png('favicon.svg', 32, 'favicon-32.png');
png('mark.svg', 192, 'icon-192.png');
png('mark.svg', 512, 'icon-512.png');
png('icon-square.svg', 180, 'apple-touch-icon.png');
png('icon-square.svg', 512, 'icon-maskable-512.png');

/** A .ico holding PNG images, which every current browser reads. */
const sizes = [16, 32, 48];
const images = sizes.map((size) =>
  execFileSync('rsvg-convert', [
    '-w',
    String(size),
    '-h',
    String(size),
    here('favicon.svg').pathname,
  ]),
);
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
sizes.forEach((size, i) => {
  const entry = 6 + i * 16;
  header.writeUInt8(size, entry);
  header.writeUInt8(size, entry + 1);
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(images[i].length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += images[i].length;
});
writeFileSync(here('favicon.ico'), Buffer.concat([header, ...images]));

console.log(`Wrote ${Object.keys(files).length} SVGs, 6 PNGs, and favicon.ico to brand/.`);
