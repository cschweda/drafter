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
const FAVICON =
  `<defs>${gradient('g')}</defs><rect width="32" height="32" rx="7" fill="url(#g)"/>` +
  `<g fill="${INK}">` +
  '<rect x="6" y="8" width="8" height="2" rx="1"/><rect x="6" y="14" width="6" height="2" rx="1"/>' +
  '<rect x="6" y="20" width="8" height="2" rx="1"/><rect x="15" y="6" width="2" height="18" opacity="0.35"/>' +
  '<rect x="20" y="8" width="4" height="2" rx="1"/><rect x="18" y="14" width="8" height="2" rx="1"/>' +
  '<rect x="18" y="20" width="6" height="2" rx="1"/></g>';
files['favicon.svg'] = svg(32, 32, FAVICON, 'Drafter');

/**
 * The tab's icon while the script has unsaved changes (the web app swaps it in): the favicon with
 * a red dot in its top-right corner, ringed in ink so it reads on a light tab strip and a dark one.
 * The red is the app's --unsaved token (apps/web/app/assets/css/tokens.css).
 */
const UNSAVED = '#E03E44';
files['favicon-unsaved.svg'] = svg(
  32,
  32,
  `${FAVICON}<circle cx="24" cy="8" r="8" fill="${INK}"/><circle cx="24" cy="8" r="6" fill="${UNSAVED}"/>`,
  'Drafter, unsaved changes',
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
  // The two front cards: the same scene typed both ways (Classic Mode design §16, its words
  // verbatim). Fountain flush left with its marks showing, in the cherry of the revision pages so
  // the difference is seen; Classic with no marks, each element where a page puts it. The scene
  // has a mark in it on purpose: a plain scene looks alike both ways.
  const W = 7.8; // Courier Prime's advance at 13 px
  const card = (x, y, angle, label, lines) => {
    const width = 280;
    const height = 410;
    const left = x + 26;
    const body = lines
      .map(([row, column, words, options = {}]) => {
        const at = left + column * W;
        const top = y + 76 + row * 19;
        if (!options.mark) return courier(words, at, top, { size: 13, bold: options.bold });
        return (
          courier(options.mark, at, top, { size: 13, fill: REVISION.cherry }) +
          courier(words, at + options.mark.length * W, top, { size: 13 })
        );
      })
      .join('');
    const filler =
      bar(left, y + 262, 210) + bar(left, y + 278, 180) + bar(left + 10 * W, y + 312, 50);
    return (
      `<g transform="rotate(${angle} ${x + width / 2} ${y + height / 2})">` +
      `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="10" fill="${REVISION.white}"/>` +
      text(FONTS.semiBold, label, { x: left, y: y + 40, size: 14, fill: '#6B7080' }) +
      body +
      filler +
      '</g>'
    );
  };
  const fountainCard = card(578, 118, -4, 'Fountain', [
    [0, 0, 'INT. RADIO ROOM - NIGHT'],
    [2, 0, 'June works the dial.'],
    [4, 0, 'McGRAW', { mark: '@' }],
    [5, 0, '(on the radio)'],
    [6, 0, 'Say again?'],
    [8, 0, 'FADE OUT.', { mark: '>' }],
  ]);
  const classicCard = card(872, 142, 2, 'Classic', [
    [0, 0, 'INT. RADIO ROOM - NIGHT', { bold: true }],
    [2, 0, 'June works the dial.'],
    [4, 10, 'McGRAW'],
    [5, 6, '(on the radio)'],
    [6, 4, 'Say again?'],
    [8, 13, 'FADE OUT.'],
  ]);
  const sheets = [
    [-22, REVISION.cherry],
    [-19, REVISION.salmon],
    [-16, REVISION.buff],
    [-13, REVISION.goldenrod],
    [-10, REVISION.green],
    [-7, REVISION.yellow],
    [-4, REVISION.pink],
    [-1, REVISION.blue],
  ];
  const fan = sheets.map(([angle, color]) => page(angle, color)).join('');
  // The animated share image (og-image-animated.svg): the script starts as one page, then the
  // revision pages fan out behind it, once, and stay. Each page rests at its angle, so a viewer that
  // can't animate, or asks for less motion, sees the finished fan; CSS only, no script.
  const fanAnimated = sheets
    .map(
      ([, color], i) =>
        `<g class="p p${i}"><rect x="850" y="140" width="320" height="440" rx="10" fill="${color}"/></g>`,
    )
    .join('');
  const fanStyle =
    '<style>.p{transform-origin:1010px 720px;transform-box:view-box}' +
    sheets
      .map(
        ([angle], i) =>
          `.p${i}{transform:rotate(${angle}deg);animation:f${i} ${(0.7 + Math.abs(angle) * 0.03).toFixed(2)}s cubic-bezier(.2,.8,.2,1) .6s both}@keyframes f${i}{from{transform:rotate(2deg)}}`,
      )
      .join('') +
    '@media (prefers-reduced-motion:reduce){.p{animation:none}}</style>';
  const dots = [
    REVISION.blue,
    REVISION.pink,
    REVISION.yellow,
    REVISION.green,
    REVISION.goldenrod,
    REVISION.salmon,
  ]
    .map((color, i) => `<circle cx="${78 + i * 20}" cy="562" r="7" fill="${color}"/>`)
    .join('');
  const share = (fanMarkup, style = '') =>
    svg(
      1200,
      630,
      '<defs>' +
        '<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#121318"/><stop offset="1" stop-color="#0B0C0F"/></linearGradient>' +
        '<filter id="shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#000000" flood-opacity="0.45"/></filter>' +
        `${gradient('g')}</defs>` +
        '<rect width="1200" height="630" fill="url(#bg)"/>' +
        style +
        `<g filter="url(#shadow)">${fanMarkup}${fountainCard}${classicCard}</g>` +
        mark({ x: 76, y: 76, size: 48, id: 'g' }) +
        text(FONTS.extraBold, 'drafter', {
          x: 72,
          y: 296,
          size: 124,
          fill: '#FFFFFF',
          tracking: -5,
        }) +
        // Fountain or Classic, in the mark's colors: two ways of typing over one file (v0.25.0). Then
        // Fountain said plainly for anyone who hasn't met it, who it's for, and what the choice means.
        text(FONTS.extraBold, 'Fountain or Classic.', {
          x: 76,
          y: 356,
          size: 36,
          fill: 'url(#g)',
        }) +
        text(FONTS.semiBold, 'Fountain: a plain-text script format', {
          x: 76,
          y: 396,
          size: 25,
          fill: '#AEB4C0',
        }) +
        text(FONTS.semiBold, 'for screenplays and stage plays.', {
          x: 76,
          y: 430,
          size: 25,
          fill: '#AEB4C0',
        }) +
        text(FONTS.semiBold, 'Novels and notes in Markdown.', {
          x: 76,
          y: 464,
          size: 25,
          fill: '#AEB4C0',
        }) +
        text(FONTS.semiBold, 'Same file. Your choice of keys.', {
          x: 76,
          y: 513,
          size: 23,
          fill: '#E8EAEE',
        }) +
        dots +
        text(FONTS.semiBold, 'drafter.dev', { x: 198, y: 571, size: 24, fill: '#E8EAEE' }),
      'Drafter: Fountain or Classic. The same scene typed both ways, on two script pages: Fountain, a plain-text script format, with its marks showing, and Classic Mode, with no marks and each element where a page puts it. For screenplays and stage plays; novels and notes in Markdown. Same file, your choice of keys.',
    );
  files['og-image.svg'] = share(fan);
  files['og-image-animated.svg'] = share(fanAnimated, fanStyle);
}

/** Square art for launchers that mask icons themselves (iOS, Android's maskable icons). */
files['icon-square.svg'] = svg(
  512,
  512,
  `<defs>${gradient('g')}</defs>${mark({ size: 512, id: 'g', square: true, inset: 0.8 })}`,
);

/**
 * The macOS app icon: the tile on Apple's 1024-pixel grid (824 pixels, centred, with a soft shadow
 * below), so it sits in the Dock and Finder at the size of every other app's.
 */
files['icon-mac.svg'] = svg(
  1024,
  1024,
  `<defs>${gradient('g')}` +
    '<filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#000000" flood-opacity="0.3"/></filter></defs>' +
    `<g filter="url(#shadow)">${mark({ x: 100, y: 100, size: 824, id: 'g' })}</g>`,
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
png('icon-mac.svg', 1024, 'icon-mac-1024.png');

/**
 * A .ico of PNG images, from `{ size, source }` pairs: every current browser reads one, and so does
 * Windows (Vista on), whose 256-pixel entry has 0 for its width and height.
 */
function ico(entries) {
  const images = entries.map(({ size, source }) =>
    execFileSync('rsvg-convert', ['-w', String(size), '-h', String(size), here(source).pathname]),
  );
  const header = Buffer.alloc(6 + 16 * entries.length);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  let offset = header.length;
  entries.forEach(({ size }, i) => {
    const entry = 6 + i * 16;
    header.writeUInt8(size >= 256 ? 0 : size, entry);
    header.writeUInt8(size >= 256 ? 0 : size, entry + 1);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(images[i].length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += images[i].length;
  });
  return Buffer.concat([header, ...images]);
}

writeFileSync(
  here('favicon.ico'),
  ico([16, 32, 48].map((size) => ({ size, source: 'favicon.svg' }))),
);

/** The unsaved icon's raster twin, for a browser that picks the .ico over the SVG. */
writeFileSync(
  here('favicon-unsaved.ico'),
  ico([16, 32, 48].map((size) => ({ size, source: 'favicon-unsaved.svg' }))),
);

/**
 * The Windows app's icon: the taskbar, the Start menu, Explorer, the installer. The favicon's
 * pixel grid up to 32 pixels, so the bars stay sharp at 16, 24, and 32; the mark above that.
 */
writeFileSync(
  here('icon-windows.ico'),
  ico([
    ...[16, 24, 32].map((size) => ({ size, source: 'favicon.svg' })),
    ...[48, 64, 128, 256].map((size) => ({ size, source: 'mark.svg' })),
  ]),
);

console.log(
  `Wrote ${Object.keys(files).length} SVGs, 7 PNGs, favicon.ico, favicon-unsaved.ico, and icon-windows.ico to brand/.`,
);
