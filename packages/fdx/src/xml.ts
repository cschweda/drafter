// A strict XML reader and a small writer, for Final Draft files. An imported file is untrusted
// (technical design §11), so the reader is deliberately narrower than XML: it has no DTD and so
// no entity expansion, it refuses what it does not understand rather than guessing, and it makes
// one pass over the string with an explicit stack, so neither a long file nor a deep one can
// cost more than its size or overflow the call stack.

/** A parsed element. Attribute order is not kept; the maps are plain records. */
export interface XmlElement {
  name: string;
  attrs: Record<string, string>;
  children: XmlNode[];
}

/** A child of an element: another element, or a run of text (CDATA included, already merged). */
export type XmlNode = XmlElement | string;

/** Why a document was refused, and the string offset (in UTF-16 units) where the reader stopped. */
export class XmlError extends Error {
  readonly offset: number;
  constructor(message: string, offset: number) {
    super(`${message} (at offset ${offset})`);
    this.name = 'XmlError';
    this.offset = offset;
  }
}

/** The most text the reader takes: the open path's 5 MB, counted in characters, which never exceed bytes. */
export const MAX_XML_CHARS = 5 * 1024 * 1024;

/** The deepest nesting the reader allows, the root being depth 1. */
export const MAX_XML_DEPTH = 64;

// Name characters stop short of the surrogates and U+FFFE/U+FFFF, which XML never allows.
const NAME_START = /[A-Za-z_:\u00C0-\uD7FF\uE000-\uFFFD]/;
const NAME_CHAR = /[A-Za-z0-9_:.\-\u00B7\u00C0-\uD7FF\uE000-\uFFFD]/;

const isSpace = (c: string) => c === ' ' || c === '\t' || c === '\n' || c === '\r';

/** Whether a code point is a character XML 1.0 allows in a document. */
function validCodePoint(cp: number): boolean {
  return (
    cp === 0x9 ||
    cp === 0xa ||
    cp === 0xd ||
    (cp >= 0x20 && cp <= 0xd7ff) ||
    (cp >= 0xe000 && cp <= 0xfffd) ||
    (cp >= 0x10000 && cp <= 0x10ffff)
  );
}

/** A name as an error message shows it: at most 40 characters, so a hostile name can't fill an alert. */
const short = (name: string) => (name.length > 40 ? `${name.slice(0, 40)}…` : name);

const NAMED: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

/** Reads one XML document. Whitespace-only text between elements is kept; callers ignore it. */
export function readXml(text: string): XmlElement {
  if (text.length > MAX_XML_CHARS) throw new XmlError('The file is larger than 5 MB', 0);
  // XML treats CRLF and a lone CR as a line feed; do it once so the scan never has to.
  const src = text.includes('\r') ? text.replace(/\r\n?/g, '\n') : text;
  const n = src.length;
  let i = src.charCodeAt(0) === 0xfeff ? 1 : 0;

  const fail = (message: string, at = i): never => {
    throw new XmlError(message, at);
  };

  // Reads a name at `i`.
  const readName = (): string => {
    const start = i;
    if (i >= n || !NAME_START.test(src[i] as string)) fail('Expected a name');
    i++;
    while (i < n && NAME_CHAR.test(src[i] as string)) i++;
    return src.slice(start, i);
  };

  const skipSpace = () => {
    while (i < n && isSpace(src[i] as string)) i++;
  };

  // Decodes the text in [from, to): the five named entities and numeric references, and refuses
  // every other `&`, a stray `<` where one is not allowed, and characters XML does not allow.
  const decode = (from: number, to: number, inAttr: boolean): string => {
    let out = '';
    let run = from;
    for (let k = from; k < to; k++) {
      const c = src.charCodeAt(k);
      if (c === 0x26) {
        out += src.slice(run, k);
        const semi = src.indexOf(';', k);
        if (semi < 0 || semi >= to) fail('An & with no ; after it', k);
        const body = src.slice(k + 1, semi);
        if (body.startsWith('#')) {
          const hex = body.startsWith('#x');
          const digits = body.slice(hex ? 2 : 1);
          if (!(hex ? /^[0-9A-Fa-f]{1,6}$/ : /^[0-9]{1,7}$/).test(digits))
            fail('A malformed character reference', k);
          const cp = Number.parseInt(digits, hex ? 16 : 10);
          if (!validCodePoint(cp)) fail('A character reference to a character XML forbids', k);
          out += String.fromCodePoint(cp);
        } else if (Object.hasOwn(NAMED, body)) {
          out += NAMED[body];
        } else {
          fail(`The entity &${body.slice(0, 20)}; is not allowed`, k);
        }
        k = semi;
        run = semi + 1;
      } else if (c === 0x3e) {
        // Checked here rather than with a search, which would rescan the rest of the file each time.
        if (
          !inAttr &&
          k - 2 >= from &&
          src.charCodeAt(k - 1) === 0x5d &&
          src.charCodeAt(k - 2) === 0x5d
        )
          fail('A ]]> in text', k - 2);
      } else if (c === 0x3c) {
        if (inAttr) fail('A < inside an attribute value', k);
      } else if (c < 0x20 ? c !== 0x9 && c !== 0xa : c >= 0xd800) {
        // Control characters, and anything from the surrogate range up, need a closer look.
        if (c < 0x20) fail('A control character XML forbids', k);
        const cp = src.codePointAt(k) as number;
        if (!validCodePoint(cp)) fail('A character XML forbids', k);
        if (cp > 0xffff) k++;
      }
    }
    return out + src.slice(run, to);
  };

  let root: XmlElement | undefined;
  const stack: XmlElement[] = [];
  let seenRoot = false;

  // Adds text to the open element, merging with a text node already last (CDATA beside text).
  const addText = (s: string) => {
    if (s === '') return;
    const kids = (stack[stack.length - 1] as XmlElement).children;
    const last = kids.length - 1;
    if (typeof kids[last] === 'string') kids[last] += s;
    else kids.push(s);
  };

  // A leading XML declaration is the one processing instruction allowed, and only first of all.
  if (src.startsWith('<?xml', i) && (isSpace(src[i + 5] ?? '') || src.startsWith('?>', i + 5))) {
    const end = src.indexOf('?>', i);
    if (end < 0) fail('The XML declaration is not closed');
    const decl = src.slice(i + 5, end);
    if (decl.includes('<') || decl.includes('&')) fail('A malformed XML declaration');
    i = end + 2;
  }

  while (i < n) {
    if (stack.length === 0) {
      // Outside the root only whitespace and comments may appear.
      const c = src[i] as string;
      if (isSpace(c)) {
        i++;
        continue;
      }
      if (c !== '<')
        fail(seenRoot ? 'Text after the root element' : 'Text before the root element');
    }
    const lt = src.indexOf('<', i);
    const textEnd = lt < 0 ? n : lt;
    if (textEnd > i) {
      // Text inside an element, up to the next markup. `]]>` is not allowed in text.
      addText(decode(i, textEnd, false));
      i = textEnd;
      continue;
    }

    // `src[i]` is `<`.
    if (src.startsWith('<!--', i)) {
      const end = src.indexOf('-->', i + 4);
      if (end < 0) fail('A comment is not closed');
      if (src.slice(i + 4, end).includes('--')) fail('A -- inside a comment');
      i = end + 3;
    } else if (src.startsWith('<![CDATA[', i)) {
      if (stack.length === 0) fail('CDATA outside the root element');
      const end = src.indexOf(']]>', i + 9);
      if (end < 0) fail('A CDATA section is not closed');
      addText(cdata(i + 9, end));
      i = end + 3;
    } else if (src.startsWith('<!', i)) {
      fail(
        src.startsWith('<!DOCTYPE', i)
          ? 'A DOCTYPE is not allowed'
          : 'A declaration is not allowed',
      );
    } else if (src.startsWith('<?', i)) {
      fail('A processing instruction is not allowed');
    } else if (src.startsWith('</', i)) {
      if (stack.length === 0) fail('A closing tag with nothing open');
      const at = i;
      i += 2;
      const name = readName();
      skipSpace();
      if (src[i] !== '>') fail('Expected > to end a closing tag');
      i++;
      const open = stack.pop() as XmlElement;
      if (open.name !== name) fail(`</${short(name)}> closes <${short(open.name)}>`, at);
      if (stack.length === 0) {
        root = open;
        seenRoot = true;
      }
    } else {
      if (seenRoot) fail('A second root element');
      i++;
      const name = readName();
      const el: XmlElement = { name, attrs: {}, children: [] };
      for (;;) {
        const hadSpace = i < n && isSpace(src[i] as string);
        skipSpace();
        const c = src[i];
        if (c === '>' || c === '/') break;
        if (i >= n) fail(`The tag <${short(name)}> is not closed`);
        if (!hadSpace) fail('Expected a space before an attribute');
        const attr = readName();
        skipSpace();
        if (src[i] !== '=') fail(`Expected = after the attribute ${short(attr)}`);
        i++;
        skipSpace();
        const q = src[i];
        if (q !== '"' && q !== "'") fail('Expected a quoted attribute value');
        const close = src.indexOf(q, i + 1);
        if (close < 0) fail('An attribute value is not closed');
        if (Object.hasOwn(el.attrs, attr)) fail(`The attribute ${short(attr)} appears twice`);
        // defineProperty keeps an attribute named `__proto__` an ordinary key instead of a prototype.
        Object.defineProperty(el.attrs, attr, {
          value: decode(i + 1, close, true),
          enumerable: true,
          writable: true,
          configurable: true,
        });
        i = close + 1;
      }
      const selfClosing = src[i] === '/';
      if (selfClosing) {
        i++;
        if (src[i] !== '>') fail('Expected > after /');
      }
      i++;
      // An element sits one level below everything open, a self-closing one included.
      if (stack.length >= MAX_XML_DEPTH) fail(`Elements nest deeper than ${MAX_XML_DEPTH}`);
      const parent = stack[stack.length - 1];
      if (parent) parent.children.push(el);
      if (selfClosing) {
        if (!parent) {
          root = el;
          seenRoot = true;
        }
      } else {
        stack.push(el);
      }
    }
  }

  if (stack.length > 0)
    fail(`<${short((stack[stack.length - 1] as XmlElement).name)}> is never closed`, n);
  if (!root) fail('The file has no root element', n);
  return root as XmlElement;

  // CDATA is literal text, so only its characters are checked, not its `&`s.
  function cdata(from: number, to: number): string {
    for (let k = from; k < to; k++) {
      const c = src.charCodeAt(k);
      if (c < 0x20 ? c !== 0x9 && c !== 0xa : c >= 0xd800) {
        if (c < 0x20) fail('A control character XML forbids', k);
        const cp = src.codePointAt(k) as number;
        if (!validCodePoint(cp)) fail('A character XML forbids', k);
        if (cp > 0xffff) k++;
      }
    }
    return src.slice(from, to);
  }
}

/** Escapes text for element content or an attribute value; tabs and line breaks in attributes become references so they survive. */
function escapeXml(s: string, attr: boolean): string {
  let out = '';
  let run = 0;
  for (let k = 0; k < s.length; k++) {
    const c = s.charCodeAt(k);
    let rep: string | undefined;
    if (c === 0x26) rep = '&amp;';
    else if (c === 0x3c) rep = '&lt;';
    else if (c === 0x3e) rep = '&gt;';
    else if (c === 0xd) rep = '&#13;';
    else if (attr && c === 0x22) rep = '&quot;';
    else if (attr && c === 0x9) rep = '&#9;';
    else if (attr && c === 0xa) rep = '&#10;';
    else if (c < 0x20 ? c !== 0x9 && c !== 0xa : c >= 0xd800) {
      if (c < 0x20) throw new XmlError('Text holds a control character XML forbids', k);
      const cp = s.codePointAt(k) as number;
      if (!validCodePoint(cp)) throw new XmlError('Text holds a character XML forbids', k);
      if (cp > 0xffff) k++;
    }
    if (rep) {
      out += s.slice(run, k) + rep;
      run = k + 1;
    }
  }
  return out + s.slice(run);
}

const DECLARATION = '<?xml version="1.0" encoding="UTF-8" standalone="no" ?>';

/**
 * Writes a tree as an XML document: the declaration, then the elements, indented two spaces.
 * An element that holds text is written on one line with its content exactly as it is, since
 * indenting inside text would change it; only elements that hold nothing but elements are indented.
 */
export function writeXml(root: XmlElement): string {
  const out: string[] = [DECLARATION, '\n'];
  const inline = (el: XmlElement) => {
    out.push('<', el.name, attrText(el), '>');
    for (const child of el.children) {
      if (typeof child === 'string') out.push(escapeXml(child, false));
      else inline(child);
    }
    out.push('</', el.name, '>');
  };
  const block = (el: XmlElement, depth: number) => {
    const pad = '  '.repeat(depth);
    if (el.children.length === 0) {
      out.push(pad, '<', el.name, attrText(el), '/>\n');
    } else if (el.children.some((c) => typeof c === 'string')) {
      out.push(pad);
      inline(el);
      out.push('\n');
    } else {
      out.push(pad, '<', el.name, attrText(el), '>\n');
      for (const child of el.children) block(child as XmlElement, depth + 1);
      out.push(pad, '</', el.name, '>\n');
    }
  };
  block(root, 0);
  return out.join('');
}

function attrText(el: XmlElement): string {
  let s = '';
  for (const [k, v] of Object.entries(el.attrs)) s += ` ${k}="${escapeXml(v, true)}"`;
  return s;
}
