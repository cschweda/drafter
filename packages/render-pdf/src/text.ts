const REPLACEMENT = String.fromCharCode(0xfffd);

/**
 * Text pdf-lib can draw on one line: control characters (which it would treat
 * as line breaks) become spaces, and unpaired surrogates become `unpaired`
 * (U+FFFD unless the caller asks otherwise). Each replacement takes one
 * column, as the character did. Shared by the script and document renderers.
 */
export function drawable(s: string, unpaired: string = REPLACEMENT): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    const next = s.charCodeAt(i + 1);
    if (c < 0x20 || c === 0x7f || c === 0x85 || c === 0x2028 || c === 0x2029) {
      out += ' ';
    } else if (c >= 0xd800 && c <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) {
      out += s.slice(i, i + 2);
      i++;
    } else {
      out += c >= 0xd800 && c <= 0xdfff ? unpaired : s.charAt(i);
    }
  }
  return out;
}
