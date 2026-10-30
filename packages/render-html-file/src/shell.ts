import { CLIENT_SCRIPT } from './client';
import { el, escapeHtml } from './escape';
import { cspHash } from './sha256';
import { STYLESHEET } from './style';

/** What goes into the frame. Every markup field is the caller's, already escaped. */
export interface ShellInput {
  /** The page's `<title>` and the bar's title, as plain text. */
  title: string;
  /** The script's or document's language, a BCP 47 tag; anything else is read as `en`. */
  lang: string;
  /** Who made the file, for `<meta name="generator">`, e.g. "Drafter 0.21.0". */
  generator: string;
  /** A script has the Pages and Reading views and their switch; a document has neither. */
  kind: 'script' | 'document';
  /** The header's content, markup: `headerHtml` makes it. */
  header: string;
  /** The band (a script's) or the section links (a document's), a whole `<nav>`, or ''. */
  nav: string;
  /**
   * What `<main>` holds, markup. A script's is `<section class="pages">` and then
   * `<section class="reading" hidden="">`; `<main>` itself is the shell's.
   */
  body: string;
  /** `@font-face` rules with `data:` URLs, or ''. They go in front of the stylesheet. */
  fontFaces: string;
}

/** A language tag as BCP 47 spells one: letters, then letter-or-digit subtags. */
const LANG = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/;

/**
 * The policy: nothing from anywhere, but the one style and the one script by their hashes, fonts
 * and images from `data:` only, no `<base>`, and no form. Style attributes are allowed, since a
 * printed line's place on the page is one (`--row`, `--col`), and they can't reach out: a `url(`
 * in one is still held to `data:` by `img-src` and `font-src`. A browser too old for
 * `style-src-attr` falls back to the hash and drops them; the text is all there, unplaced.
 */
const policy = (style: string, script: string) =>
  [
    "default-src 'none'",
    `style-src ${cspHash(style)}`,
    "style-src-attr 'unsafe-inline'",
    `script-src ${cspHash(script)}`,
    'font-src data:',
    'img-src data:',
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');

/** One switch: what it means when off, said beside it, and the button that turns it on. */
const pair = (toggle: string, off: string, on: string) =>
  el(
    'span',
    { class: 'pair' },
    el('span', { class: 'pair-off', 'aria-hidden': 'true' }, off) +
      el(
        'button',
        { type: 'button', class: 'switch', 'data-toggle': toggle, 'aria-pressed': 'false' },
        el('span', { class: 'knob', 'aria-hidden': 'true' }) + on,
      ),
  );

/**
 * A header's content as escaped markup: the small kind line (left out when empty), the title as
 * the page's one `<h1>`, then a line each for the rest (the author, a draft date).
 */
export function headerHtml(kind: string, title: string, lines: readonly string[]): string {
  return (
    (kind ? el('p', { class: 'kind' }, escapeHtml(kind)) : '') +
    el('h1', { class: 'title' }, escapeHtml(title)) +
    lines.map((line) => el('p', { class: 'byline' }, escapeHtml(line))).join('')
  );
}

/**
 * The whole file around a body: the head with its CSP, the one style and the one script, then the
 * bar, the header, the band or section links, and `<main>`. It opens dark (`data-theme="dark"`)
 * and, for a script, in Pages (`data-view="pages"`); the script changes either only when the
 * reader has. The switches start hidden, since they need the script, which shows them.
 */
export function htmlShell(input: ShellInput): string {
  if (input.fontFaces.includes('<')) {
    throw new RangeError('Font rules may not hold "<": they would end the style element.');
  }
  const style = input.fontFaces ? `${input.fontFaces}\n${STYLESHEET}` : STYLESHEET;
  const script = input.kind === 'script';
  const lang = LANG.test(input.lang) ? input.lang : 'en';

  const head =
    el('meta', { charset: 'utf-8' }) +
    el('meta', {
      'http-equiv': 'Content-Security-Policy',
      content: policy(style, CLIENT_SCRIPT),
    }) +
    el('meta', { name: 'viewport', content: 'width=device-width, initial-scale=1' }) +
    el('meta', { name: 'generator', content: input.generator }) +
    el('title', {}, escapeHtml(input.title)) +
    el('style', {}, style) +
    el('script', {}, CLIENT_SCRIPT);

  const switches =
    (script ? pair('view', 'Pages', 'Reading') : '') + pair('theme', 'Dark', 'Light');
  const bar = el(
    'div',
    { class: 'bar' },
    el('p', { class: 'bar-title', 'aria-hidden': 'true' }, escapeHtml(input.title)) +
      el(
        'div',
        { class: 'switches', role: 'group', 'aria-label': 'Display', hidden: true },
        switches,
      ),
  );

  const body =
    el(
      'a',
      { class: 'skip', href: '#main' },
      script ? 'Skip to the script' : 'Skip to the document',
    ) +
    bar +
    el('header', { class: 'head' }, input.header) +
    input.nav +
    el(
      'main',
      { id: 'main', class: input.kind, 'data-view': script ? 'pages' : undefined },
      input.body,
    );

  return `<!DOCTYPE html>\n${el(
    'html',
    { lang, 'data-theme': 'dark' },
    `\n${el('head', {}, head)}\n${el('body', {}, body)}\n`,
  )}\n`;
}
