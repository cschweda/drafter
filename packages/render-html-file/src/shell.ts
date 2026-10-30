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
  /**
   * The file's generated rules (`gridRules`, `pageRules`, `bandRules`, `colorRules`), or ''. They
   * go after the stylesheet, in the same `<style>`: the CSP allows no style attribute.
   */
  rules: string;
}

/** A language tag as BCP 47 spells one: letters, then letter-or-digit subtags. */
const LANG = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/;

/** `lang` when it is a BCP 47 tag in shape, else `en`. */
export const langOf = (lang: string) => (LANG.test(lang) ? lang : 'en');

/**
 * The policy: nothing from anywhere, but the one style and the one script by their hashes, fonts
 * and images from `data:` only, no `<base>`, and no form. No style attribute and no inline event
 * handler is allowed, and the file has none: what varies (a line's place, a page's size) is a
 * class with a generated rule in the one `<style>`.
 */
const policy = (style: string, script: string) =>
  [
    "default-src 'none'",
    `style-src ${cspHash(style)}`,
    `script-src ${cspHash(script)}`,
    'font-src data:',
    'img-src data:',
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');

/**
 * Generated CSS, refused if it holds `<` (which could end the style element) or a carriage return
 * (which HTML reads as a line feed before the browser hashes the text, so the CSP's hash, taken
 * here, would no longer match and the whole stylesheet would be dropped).
 */
function cssPart(css: string, what: string): string {
  if (css.includes('<')) throw new RangeError(`${what} may not hold "<": it would end the style.`);
  if (css.includes('\r')) throw new RangeError(`${what} may not hold a carriage return.`);
  return css;
}

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
  const style = [cssPart(input.fontFaces, 'Font rules'), STYLESHEET, cssPart(input.rules, 'Rules')]
    .filter(Boolean)
    .join('\n');
  const script = input.kind === 'script';
  const lang = langOf(input.lang);

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
