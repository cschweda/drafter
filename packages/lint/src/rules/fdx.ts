import { importNote } from './import-notes';

// fdx-note (Phase 2 Plan FD): an import from Final Draft (`@drafter/fdx`'s `fromFdx`) keeps what
// Drafter has no element for as action with a `[[fdx: Type]]` note (a `Cast List` paragraph, a
// scene number Fountain can't hold, an unknown element). This lists every such note, as a to-do
// list with a jump to each. Advice, never counted as a problem. An omitted scene and hidden text
// from a shooting script are notes too, each with its own advice.

/**
 * What to do with the note. An omitted scene (`[[fdx: Omitted: …]]`) and hidden text
 * (`[[fdx: Hidden: …]]`) are the writer's own, kept unprinted as Final Draft kept them; a hidden
 * paragraph (`[[fdx: Hidden paragraph: …]]`, quoting it) prints, since its kind needs its text.
 * Any other label has no element in Drafter.
 */
function messageFor(label: string): string {
  if (/^Omitted:/.test(label))
    return "This is a scene Final Draft's shooting script omits, kept as a note so it doesn't print. To restore it, take off the note's marks, “[[fdx: Omitted:” and “]]”; to drop it, delete the note.";
  if (/^Hidden:/.test(label))
    return "Final Draft hid this text, so it doesn't print. To print it, take off the note's marks, “[[fdx: Hidden:” and “]]”; to drop it, delete the note.";
  if (/^Hidden paragraph:/.test(label))
    return "Final Draft hid all the text of the paragraph above this note that it quotes, so it didn't print there. Here it prints, so the paragraph keeps its kind: change or delete it if it shouldn't, then delete the note.";
  return `This came in from Final Draft as “${label}”, which Drafter has no element for. Check it, then delete the note.`;
}

export const fdxNote = importNote('fdx-note', 'fdx', 'Final Draft', messageFor);
