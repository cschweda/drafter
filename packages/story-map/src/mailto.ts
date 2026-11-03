/** What a contact may never hold: spaces, controls, and anything that ends or reshapes a URL. */
// biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are refused.
const REFUSED = /[\s?&"<>:\\/,;%\u0000-\u001f\u007f]/;

/**
 * A `mailto:` link for a contact the page may link (design §10.8): one `@`, neither first nor
 * last; a dot in the part after it, with something on both sides of it; and no space, control
 * character, `?` or `&` (which would add headers or a body to the mail), comma, semicolon, or
 * `%` (which would add another address, plainly or encoded: red/blue audit, 2026-11-03), quote,
 * angle bracket, colon, or slash (which could end the attribute or make it another kind of link). Else null, and
 * the page shows the contact as text.
 */
export function mailtoOf(contact: string): string | null {
  const at = contact.indexOf('@');
  if (at <= 0 || at !== contact.lastIndexOf('@') || at === contact.length - 1) return null;
  if (REFUSED.test(contact)) return null;
  const domain = contact.slice(at + 1);
  const dot = domain.indexOf('.');
  if (dot <= 0 || domain.endsWith('.')) return null;
  return `mailto:${contact}`;
}
