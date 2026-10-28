// Keyed notes (Phase 2 design §5.3): `[[Head: body]]`. Reading is lenient (any case, extra
// spaces); writing is exact. Plan A reads only the keys it uses; Plan B's @drafter/notes takes
// the whole convention over.

/** The longest head that counts as one. */
const MAX_HEAD = 40;

/**
 * The head (lowercased) and body of a note's inner text, or null when it has no head: no colon,
 * nothing before it, a head longer than 40 characters, or one that spans lines.
 */
export function readKeyedNote(text: string): { key: string; body: string } | null {
  const colon = text.indexOf(':');
  if (colon < 0) return null;
  const head = text.slice(0, colon).trim();
  if (head === '' || head.length > MAX_HEAD || /[\r\n]/.test(head)) return null;
  return { key: head.toLowerCase(), body: text.slice(colon + 1).trim() };
}

/**
 * A body as Drafter writes it: on one line (breaks become ` / `), and never closing the note
 * (`]]` becomes `] ]`) or opening or closing a boneyard (`/*` and `*\/` get a space).
 */
export function safeBody(text: string): string {
  return safeLine(text).replaceAll(']]', '] ]');
}

/** One line of the writer's words, safe to put anywhere in Fountain: no line break, no note or boneyard opener. */
export function safeLine(text: string): string {
  return text
    .replace(/\s*\r?\n\s*/g, ' / ')
    .replaceAll('[[', '[ [')
    .replaceAll('/*', '/ *')
    .replaceAll('*/', '* /')
    .trim();
}
