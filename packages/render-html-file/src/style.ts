/** The colors of one palette, each a `#rrggbb` the stylesheet sets as a CSS variable. */
export interface Palette {
  /** The frame behind everything. */
  bg: string;
  /** The bar, the band's blocks, a note, and code. */
  panel: string;
  /** Thin rules and borders that only separate; nothing depends on seeing them. */
  line: string;
  /** Text. */
  ink: string;
  /** Quieter text (the kind line, extensions, parentheticals, transitions) and the switches' edges. */
  dim: string;
  /** Scene headings, links, the pressed switch, and the focus ring. */
  accent: string;
  /** Text and marks drawn on the accent. */
  onAccent: string;
  /** A printed page's paper, the same in both palettes, as the PDF's is. */
  page: string;
  /** A printed page's ink. */
  pageInk: string;
}

/**
 * The two palettes. Dark is the Studio mockup's; light is paper-white with dark ink and the
 * amber taken down until it reads on white. `test/palette.test.ts` measures every text and
 * background pair in both against WCAG AA and records the figures.
 */
export const PALETTES: Readonly<Record<'dark' | 'light', Readonly<Palette>>> = {
  dark: {
    bg: '#0e1116',
    panel: '#161b22',
    line: '#262d36',
    ink: '#e6e9ee',
    dim: '#8b95a3',
    accent: '#f2b84b',
    onAccent: '#0e1116',
    page: '#ffffff',
    pageInk: '#111111',
  },
  light: {
    bg: '#fbfaf7',
    panel: '#f0eee9',
    line: '#d9d5cc',
    ink: '#1b1f24',
    dim: '#59616b',
    accent: '#8a5800',
    onAccent: '#ffffff',
    page: '#ffffff',
    pageInk: '#111111',
  },
};

const vars = (p: Palette, scheme: string) =>
  `color-scheme: ${scheme};
  --bg: ${p.bg};
  --panel: ${p.panel};
  --line: ${p.line};
  --ink: ${p.ink};
  --dim: ${p.dim};
  --accent: ${p.accent};
  --on-accent: ${p.onAccent};
  --page: ${p.page};
  --page-ink: ${p.pageInk};`;

/** The reader's own interface face; nothing is embedded for it (design §2, Call). */
const SANS =
  'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", "Noto Sans", Arial, sans-serif';
/** Courier Prime when the file carries it; else, glyph by glyph, the reader's monospace. */
const MONO =
  '"Courier Prime", ui-monospace, Menlo, Consolas, "Liberation Mono", "Courier New", monospace';

/**
 * The file's one stylesheet, the same text in every file, so its hash in the CSP is known before
 * anything is written; the fonts a script carries go in front of it in the same `<style>`. Plain
 * ASCII with no `</`, no `url(`, and no `@import`: nothing here can reach outside the file.
 *
 * The palette is chosen by `data-theme` on `<html>`, dark unless the reader has asked for light;
 * print always takes the light one. The view is chosen by the `hidden` attribute on the two
 * sections of a script's `<main>`, so with the script off, Pages shows and Reading doesn't.
 */
export const STYLESHEET = `:root,
:root[data-theme="dark"] {
  ${vars(PALETTES.dark, 'dark')}
}
:root[data-theme="light"] {
  ${vars(PALETTES.light, 'light')}
}
@media (prefers-reduced-motion: no-preference) {
  :root { scroll-behavior: smooth; }
}
*, *::before, *::after { box-sizing: border-box; }
[hidden] { display: none !important; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--ink);
  font: 16px/1.6 ${SANS};
  -webkit-text-size-adjust: 100%;
  text-size-adjust: 100%;
}
[id] { scroll-margin-top: 4.5rem; }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
a { color: var(--accent); }
.vh {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}
.skip {
  position: absolute;
  left: 1rem;
  top: -4rem;
  z-index: 2;
  padding: 0.5rem 0.75rem;
  background: var(--accent);
  color: var(--on-accent);
  border-radius: 0.375rem;
}
.skip:focus { top: 0.5rem; }

/* The bar: the title, and the switches the script shows. */
.bar {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 1rem;
  min-height: 3.25rem;
  padding: 0.5rem max(1rem, calc((100% - 60rem) / 2 + 1.25rem));
  background: var(--panel);
  border-bottom: 1px solid var(--line);
}
.bar-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dim);
  font-size: 0.875rem;
}
.switches { display: flex; flex-wrap: wrap; gap: 0.5rem 1.25rem; }
.pair { display: inline-flex; align-items: center; gap: 0.5rem; font-size: 0.875rem; }
.pair-off { color: var(--dim); }
.switch {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 2rem;
  margin: 0;
  padding: 0.25rem 0.75rem 0.25rem 0.375rem;
  border: 1px solid var(--dim);
  border-radius: 999px;
  background: transparent;
  color: var(--ink);
  font: inherit;
  cursor: pointer;
}
.knob {
  position: relative;
  width: 1.75rem;
  height: 1rem;
  border: 1px solid var(--dim);
  border-radius: 999px;
}
.knob::after {
  content: "";
  position: absolute;
  top: 2px;
  left: 2px;
  width: 0.625rem;
  height: 0.625rem;
  border-radius: 50%;
  background: var(--dim);
}
.switch[aria-pressed="true"] .knob { background: var(--accent); border-color: var(--accent); }
.switch[aria-pressed="true"] .knob::after { left: auto; right: 2px; background: var(--on-accent); }

/* The header: the kind line, the title, and who wrote it. */
.head { max-width: 60rem; margin: 0 auto; padding: 3rem 1.25rem 1.5rem; }
.kind {
  margin: 0 0 0.5rem;
  color: var(--dim);
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.title {
  margin: 0;
  font-size: clamp(2rem, 6vw, 3.25rem);
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: -0.02em;
  overflow-wrap: anywhere;
}
.byline { margin: 0.5rem 0 0; color: var(--dim); }

/* The band: a script's acts or scenes, each as wide as its share of the pages (a generated .gN
   class sets its flex-grow) and edged in its color (a generated class sets --c). */
.band { max-width: 60rem; margin: 0 auto 2.5rem; padding: 0 1.25rem; }
.band ol { display: flex; gap: 3px; margin: 0; padding: 0; list-style: none; }
.band li { flex: 1 1 0; min-width: 6px; }
.band a {
  display: block;
  overflow: hidden;
  padding: 0.625rem 0.5rem 0.5rem;
  border-top: 4px solid var(--c, var(--accent));
  border-radius: 2px;
  background: var(--panel);
  color: var(--ink);
  font-size: 0.75rem;
  text-decoration: none;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.band a:hover { background: var(--line); }

/* A document's links to its sections, in place of the band. */
.sections { max-width: 60rem; margin: 0 auto 2.5rem; padding: 0 1.25rem; }
.sections ol { display: flex; flex-wrap: wrap; gap: 0.5rem; margin: 0; padding: 0; list-style: none; }
.sections a {
  display: block;
  padding: 0.25rem 0.75rem;
  border: 1px solid var(--dim);
  border-radius: 999px;
  color: var(--ink);
  font-size: 0.875rem;
  text-decoration: none;
}

main { max-width: 60rem; margin: 0 auto; padding: 0 1.25rem 5rem; }

/* Pages: each a paper card on the Script tab's grid, 1ch by 1em of 12pt type (1in/6), in Courier
   Prime. A page's size and a line's place are classes whose rules the file generates (rules.ts);
   on a narrow screen the page's class shrinks its type against the width of .pages, the
   container, and every place shrinks with it. */
.pages {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.5rem;
  overflow-x: auto;
  container-type: inline-size;
}
.page {
  position: relative;
  flex: none;
  background: var(--page);
  color: var(--page-ink);
  font-family: ${MONO};
  font-size: 12pt;
  line-height: 1;
  border: 1px solid var(--line);
  border-radius: 2px;
}
.page .ln {
  position: absolute;
  white-space: pre;
}
.b { font-weight: 700; }
.i { font-style: italic; }
.u { text-decoration: underline; }

/* Reading: the script reflowed for a screen. */
.reading { max-width: 46rem; margin: 0 auto; font-size: 1.0625rem; line-height: 1.65; }
.reading h2 { margin: 3rem 0 1rem; font-size: 1.5rem; line-height: 1.25; }
.reading p { margin: 0 0 1rem; }
.sh {
  margin: 2.5rem 0 0.75rem;
  color: var(--accent);
  font-family: ${MONO};
  font-size: 0.9375rem;
  font-weight: 700;
  letter-spacing: 0.04em;
}
.speech { display: grid; grid-template-columns: 9rem 1fr; gap: 1.25rem; margin: 0 0 1rem; }
.who {
  margin: 0;
  padding-top: 0.15rem;
  color: var(--c, var(--ink));
  font-size: 0.8125rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-align: right;
  overflow-wrap: anywhere;
}
.ext { color: var(--dim); font-weight: 400; }
.paren { margin: 0; color: var(--dim); font-size: 0.875rem; }
.dual { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; }
.dual .speech { grid-template-columns: 6rem 1fr; }
.tr { color: var(--dim); text-align: right; }
.ct { text-align: center; }
.ly { font-style: italic; }
.note {
  margin: 0 0 1rem;
  padding: 0.5rem 0.75rem;
  border-left: 3px solid var(--accent);
  background: var(--panel);
  font-size: 0.9375rem;
}
@media (max-width: 40rem) {
  .speech, .dual .speech { grid-template-columns: 1fr; gap: 0.125rem; }
  .who { text-align: left; }
  .dual { grid-template-columns: 1fr; gap: 0; }
}

/* A Markdown document, as the Preview draws it, in the Studio type. */
.document { max-width: 46rem; font-size: 1.0625rem; line-height: 1.7; }
.document h1, .document h2, .document h3, .document h4, .document h5, .document h6 {
  margin: 2.25rem 0 0.75rem;
  line-height: 1.25;
}
.document code, .document pre {
  font-family: ui-monospace, Menlo, Consolas, "Liberation Mono", monospace;
  font-size: 0.9em;
  background: var(--panel);
  border-radius: 4px;
}
.document code { padding: 0.1em 0.3em; }
.document pre { padding: 0.75rem 1rem; overflow-x: auto; border: 1px solid var(--line); }
.document pre code { padding: 0; background: none; }
.document blockquote { margin: 0 0 1rem; padding: 0 0 0 1rem; border-left: 3px solid var(--dim); color: var(--dim); }
.document hr { border: 0; border-top: 1px solid var(--line); margin: 2rem 0; }
.document table { border-collapse: collapse; margin: 0 0 1rem; }
.document th, .document td { padding: 0.375rem 0.75rem; border: 1px solid var(--line); text-align: left; }
.document img { max-width: 100%; }
.footnotes { font-size: 0.9375rem; }

/* Print: the light palette always, and no bar. A script in Pages prints its cards alone, a card to
   a sheet with no margin, each at the top left of a sheet of its paper (the size is generated:
   pageRules' companion, paperRule); the header and the band are the screen's, so they stay off.
   Reading and a document print as a flow on the browser's own page, the header kept and the band
   read rather than clicked. */
@page card { margin: 0; }
@media print {
  :root,
  :root[data-theme] {
    ${vars(PALETTES.light, 'light')}
  }
  .bar, .skip { display: none !important; }
  .band a { pointer-events: none; }
  body:has(> main[data-view="pages"]) > .head,
  body:has(> main[data-view="pages"]) > .band { display: none !important; }
  main[data-view="pages"] { max-width: none; margin: 0; padding: 0; }
  .pages { display: block; overflow: visible; container-type: normal; }
  .page {
    page: card;
    margin: 0;
    overflow: hidden;
    border: 0;
    border-radius: 0;
    break-after: page;
    break-inside: avoid;
  }
  .page:last-child { break-after: auto; }
  .pages .page { font-size: 12pt; }
  .speech, .note, .sh { break-inside: avoid; }
  .sh { break-after: avoid; }
}
`;
