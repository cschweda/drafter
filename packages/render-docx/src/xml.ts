// Text as XML: everything a writer types reaches the Word file through here, so a title, a contact
// line, or a paragraph that looks like markup (`<w:fldChar/>`, `]]>`, `&amp;`) prints as those
// characters and can never become an element, an attribute, or a field.

/**
 * Whether XML 1.0 allows a code point: tab, LF, CR, and everything from space up but the
 * surrogates, U+FFFE, and U+FFFF.
 */
function allowed(cp: number): boolean {
  return (
    cp === 0x9 ||
    cp === 0xa ||
    cp === 0xd ||
    (cp >= 0x20 && cp <= 0xd7ff) ||
    (cp >= 0xe000 && cp <= 0xfffd) ||
    (cp >= 0x10000 && cp <= 0x10ffff)
  );
}

const ENTITIES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

/**
 * Text escaped for an XML element or a quoted attribute: `& < > " '` as entities, and the
 * characters XML 1.0 forbids (most control characters, U+FFFE, U+FFFF, and a lone surrogate)
 * dropped, since no parser would read the part past them. Tab, line feed, and carriage return stay.
 */
export function xmlText(text: string): string {
  let out = '';
  // `for…of` walks code points: a surrogate pair is one character, a lone surrogate is itself.
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    if (!allowed(cp)) continue;
    out += ENTITIES[ch] ?? ch;
  }
  return out;
}
