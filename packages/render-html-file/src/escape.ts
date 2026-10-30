/**
 * Text as the file carries it, safe as an element's content or as a quoted attribute's value:
 * `&`, `<`, `>`, `"`, and `'` as references, and the characters a page can't hold replaced.
 * A control character other than a tab or a line feed is a space (as the Script tab and the PDF
 * print one), and a lone surrogate, or U+FFFE or U+FFFF, is U+FFFD, the replacement character:
 * none of them can be written as UTF-8 or read as XML, and an EPUB's pages are XML. One pass
 * over the text, by code unit.
 */
export function escapeHtml(text: string): string {
  let out = '';
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
    out += text.slice(from, i) + instead;
    from = i + 1;
  }
  return from === 0 ? text : out + text.slice(from);
}

/** An attribute's value: text, a number, or `true` for one that is there with no value. */
export type AttrValue = string | number | boolean | undefined;

/** Elements with no content, which close themselves. */
const VOID = new Set(['br', 'hr', 'img', 'meta', 'link', 'wbr', 'col', 'source']);

/** A name as the file's own code writes one; an optional prefix is for the EPUB's `epub:type`. */
const NAME = /^[a-z][a-z0-9-]*(?::[a-z][a-z0-9-]*)?$/;

/**
 * One element, as markup that reads the same as HTML and as XHTML: every value escaped and in
 * double quotes, a `true` attribute written with an empty value, `false` and `undefined` ones
 * left out, and a void element closed with ` />`. `content` is markup already, made by
 * `escapeHtml` or by `el`. The names are the code's, never the writer's, so a name outside the
 * expected shape is a mistake and throws, and so does an event handler (`on…`), which would be
 * script the file's CSP has no hash for.
 */
export function el(name: string, attributes: Record<string, AttrValue>, content = ''): string {
  if (!NAME.test(name)) throw new RangeError(`Not an element name: ${name}`);
  let out = `<${name}`;
  for (const [key, value] of Object.entries(attributes)) {
    if (!NAME.test(key) || key.startsWith('on')) {
      throw new RangeError(`Not an attribute name: ${key}`);
    }
    if (value === undefined || value === false) continue;
    out += ` ${key}="${value === true ? '' : escapeHtml(String(value))}"`;
  }
  if (VOID.has(name)) {
    if (content !== '') throw new RangeError(`<${name}> has no content`);
    return `${out} />`;
  }
  return `${out}>${content}</${name}>`;
}
