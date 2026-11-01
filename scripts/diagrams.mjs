// Renders the How it works diagrams (docs/diagrams/*.mmd, the Mermaid that docs/HOW-IT-WORKS.md
// shows on GitHub) to SVG for the What is Drafter page: one for the dark theme and one for the light,
// in apps/web/app/assets/diagrams/. The page shows them as images, so it never loads Mermaid (the
// content security policy, and the size of the offline app). Run it after changing a diagram, and
// commit the .mmd and the SVGs together; apps/web/test/diagrams.test.ts checks that each SVG was
// made from its .mmd as it is now (the source's SHA-256 is in the SVG).
//
//   pnpm diagrams       # fetches @mermaid-js/mermaid-cli (and its headless Chrome) the first time
//
// The colors are Drafter's tokens (apps/web/app/assets/css/tokens.css): boxes on --surface with a
// --border edge and --text words, lines in --muted, on a clear background, which the page's figure
// fills with --raised. Labels are SVG text, not HTML, so an <img> draws them; the font is one every
// system has the metrics of (Arial, Helvetica, Liberation Sans), so the words fit their boxes.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SOURCES = join(ROOT, 'docs/diagrams');
const OUT = join(ROOT, 'apps/web/app/assets/diagrams');
const MERMAID_CLI = '@mermaid-js/mermaid-cli@11.4.2';
const FONT = 'Arial, Helvetica, "Liberation Sans", sans-serif';

const THEMES = {
  dark: { surface: '#15171b', border: '#4a505b', text: '#e7e9ed', muted: '#9aa1ad' },
  light: { surface: '#ffffff', border: '#c9c6bf', text: '#1b1c20', muted: '#5d6372' },
};

/** Mermaid's settings for a theme: the base theme with Drafter's colors. */
function config(t) {
  return {
    theme: 'base',
    htmlLabels: false,
    flowchart: { htmlLabels: false, curve: 'basis', padding: 12, nodeSpacing: 28, rankSpacing: 36 },
    themeVariables: {
      fontFamily: FONT,
      fontSize: '15px',
      background: 'transparent',
      primaryColor: t.surface,
      primaryBorderColor: t.border,
      primaryTextColor: t.text,
      secondaryColor: t.surface,
      tertiaryColor: t.surface,
      mainBkg: t.surface,
      nodeBorder: t.border,
      nodeTextColor: t.text,
      textColor: t.text,
      lineColor: t.muted,
      edgeLabelBackground: t.surface,
      clusterBkg: t.surface,
      clusterBorder: t.border,
    },
  };
}

/** The SHA-256 of a diagram's source, as the SVG records it and the test checks it. */
export const sourceHash = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const scratch = mkdtempSync(join(tmpdir(), 'drafter-diagrams-'));
  /** Each diagram's drawn size, so the page shows it no larger than it was drawn. */
  const sizes = {};
  try {
    for (const file of readdirSync(SOURCES).filter((name) => name.endsWith('.mmd'))) {
      const id = file.slice(0, -'.mmd'.length);
      const source = readFileSync(join(SOURCES, file), 'utf8');
      for (const [theme, colors] of Object.entries(THEMES)) {
        const settings = join(scratch, `${theme}.json`);
        writeFileSync(settings, JSON.stringify(config(colors)));
        const svg = join(scratch, `${id}-${theme}.svg`);
        execFileSync(
          'npx',
          [
            '-y',
            MERMAID_CLI,
            ...['-i', join(SOURCES, file), '-o', svg, '-c', settings],
            ...['-b', 'transparent', '--svgId', `diagram-${id}-${theme}`],
          ],
          { stdio: ['ignore', 'ignore', 'inherit'] },
        );
        // Mermaid's own role and its empty title and description are left as they are: the page's
        // <img> carries the description. The source's hash goes first, for the test.
        const drawn = readFileSync(svg, 'utf8').replace(
          /^<svg /,
          `<svg data-source-sha256="${sourceHash(source)}" `,
        );
        writeFileSync(join(OUT, `${id}-${theme}.svg`), drawn);
        const box = /^<svg [^>]*viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(drawn);
        if (!box) throw new Error(`${id}-${theme}.svg has no viewBox.`);
        const size = { width: Math.ceil(Number(box[1])), height: Math.ceil(Number(box[2])) };
        sizes[id] = { ...sizes[id], [theme]: size };
        console.log(`apps/web/app/assets/diagrams/${id}-${theme}.svg`);
      }
    }
    writeFileSync(join(OUT, 'sizes.json'), `${JSON.stringify(sizes, null, 2)}\n`);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
