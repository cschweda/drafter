/**
 * A `mailto:` link for a contact the page may link (design §10.8): one `@`, neither first nor
 * last, and no space, control character, `?`, or `&` (which would add headers or a body to the
 * mail). Else null, and the page shows the contact as text.
 */
export function mailtoOf(contact: string): string | null {
  const at = contact.indexOf('@');
  if (at <= 0 || at !== contact.lastIndexOf('@') || at === contact.length - 1) return null;
  // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are refused.
  if (/[\s?&\u0000-\u001f\u007f]/.test(contact)) return null;
  return `mailto:${contact}`;
}
