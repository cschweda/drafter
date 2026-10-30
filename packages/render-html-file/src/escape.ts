/**
 * Text as the file carries it, safe as an element's content or as a quoted attribute's value:
 * `&`, `<`, `>`, `"`, and `'` as references, and the characters a page can't hold replaced.
 * A control character other than a tab or a line feed is a space (as the Script tab and the PDF
 * print one), and a lone surrogate is U+FFFD, the replacement character, since it can't be
 * written as UTF-8. So are U+FFFE and U+FFFF, two noncharacters: HTML holds them, but XML
 * refuses them, and an EPUB's pages are XML. One pass over the text, by code unit.
 */
export function escapeHtml(text: string): string {
  // Pieces joined once at the end: appending to one string grew faster than the text did, past
  // a few megabytes of markup.
  const parts: string[] = [];
  let from = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    let instead: string;
    if (c >= 0x20 && c < 0x7f) {
      if (c === 0x26) instead = '&amp;';
      else if (c === 0x3c) instead = '&lt;';
      else if (c === 0x3e) instead = '&gt;';
      else if (c === 0x22) instead = '&quot;';
      else if (c === 0x27) instead = '&#39;';
      else continue;
    } else if (c === 0x09 || c === 0x0a) {
      continue;
    } else if (c < 0x20 || (c >= 0x7f && c <= 0x9f)) {
      instead = ' ';
    } else if (c >= 0xd800 && c <= 0xdbff) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        i++;
        continue;
      }
      instead = '�';
    } else if ((c >= 0xdc00 && c <= 0xdfff) || c === 0xfffe || c === 0xffff) {
      instead = '�';
    } else {
      continue;
    }
    if (i > from) parts.push(text.slice(from, i));
    parts.push(instead);
    from = i + 1;
  }
  if (from === 0) return text;
  parts.push(text.slice(from));
  return parts.join('');
}

/** An attribute's value: text, a number, or `true` for one that is there with no value. */
export type AttrValue = string | number | boolean | undefined;

/** Elements with no content, which close themselves. */
const VOID = new Set(['br', 'hr', 'img', 'meta', 'link', 'wbr', 'col', 'source']);

/** A name as the file's own code writes one; an optional prefix is for the EPUB's `epub:type`. */
const NAME = /^[a-z][a-z0-9-]*(?::[a-z][a-z0-9-]*)?$/;

/**
 * Attributes never written: an event handler (`on…`, matched separately) or `formaction` would be
 * script or a request the CSP doesn't cover, `style` would be inline style it has no hash for, and
 * `srcdoc` is a whole document. `srcset` and `ping` hold more than one URL, which `safeHref`
 * doesn't read.
 */
const REFUSED = new Set(['style', 'srcdoc', 'formaction', 'srcset', 'ping']);

/** Attributes whose value is a URL, each checked by `safeHref`. */
const URL_ATTRIBUTES = new Set([
  'href',
  'src',
  'xlink:href',
  'action',
  'poster',
  'cite',
  'background',
  'longdesc',
  'manifest',
  'data',
  'codebase',
]);

/** The schemes a link may have: the writer's own links out, which open in a new tab. */
const LINK_SCHEMES = new Set(['http:', 'https:', 'mailto:']);

/**
 * `url` when the file may point at it, else undefined: an anchor in the file (`#…`), or an
 * absolute `http:`, `https:`, or `mailto:` URL as `new URL` reads it, which is how a browser reads
 * it too (leading spaces and controls, and tabs and line breaks inside, are dropped before the
 * scheme is read, so `java\tscript:` is not mistaken for something else). With `image`, a
 * `data:image/…` URL too, for an `<img>`'s `src`, where nothing in it can run. Anything relative,
 * and every other scheme (`javascript:`, `data:` elsewhere, `vbscript:`, `file:`), is refused.
 */
export function safeHref(url: string, image = false): string | undefined {
  if (url.startsWith('#')) return url;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  if (LINK_SCHEMES.has(parsed.protocol)) return url;
  if (image && parsed.protocol === 'data:' && /^data:image\//i.test(url.trim())) return url;
  return undefined;
}

/**
 * One element, as markup that reads the same as HTML and as XHTML: every value escaped and in
 * double quotes, a `true` attribute written with an empty value (an `aria-…` one as "true", the
 * only spelling ARIA reads), `false` and `undefined` ones left out, and a void element closed
 * with ` />`. `content` is markup already, made by `escapeHtml` or by `el`; a `<script>`'s or a
 * `<style>`'s is raw text, which may not hold `</`. The names are the code's, never the writer's,
 * so a name outside the expected shape is a mistake and throws, and so does an attribute in
 * `REFUSED`, an event handler, or a URL that `safeHref` refuses (`data:` only for an `<img>`'s
 * `src`).
 */
export function el(name: string, attributes: Record<string, AttrValue>, content = ''): string {
  if (!NAME.test(name)) throw new RangeError(`Not an element name: ${name}`);
  let out = `<${name}`;
  for (const [key, value] of Object.entries(attributes)) {
    if (!NAME.test(key) || key.startsWith('on') || REFUSED.has(key)) {
      throw new RangeError(`Not an attribute the file writes: ${key}`);
    }
    if (value === undefined || value === false) continue;
    let text: string;
    if (value === true) text = key.startsWith('aria-') ? 'true' : '';
    else text = String(value);
    if (URL_ATTRIBUTES.has(key) && safeHref(text, name === 'img' && key === 'src') === undefined) {
      throw new RangeError(`Not a URL the file may hold, in ${key}: ${text.slice(0, 40)}`);
    }
    out += ` ${key}="${escapeHtml(text)}"`;
  }
  if (VOID.has(name)) {
    if (content !== '') throw new RangeError(`<${name}> has no content`);
    return `${out} />`;
  }
  if ((name === 'script' || name === 'style') && content.includes('</')) {
    throw new RangeError(`<${name}> may not hold "</": it would end the element early`);
  }
  return `${out}>${content}</${name}>`;
}
