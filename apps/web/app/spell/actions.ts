import { EditorView } from '@codemirror/view';
import {
  ignoreHere,
  parsedDoc,
  type SpellMark,
  spellMarkAt,
  stepSpellMark,
  unmarkWord,
} from '@drafter/cm-fountain';
import { hasStrayBoneyard } from '@drafter/outline';
import { addToScriptDictionary } from '@drafter/spell';
import { applyTextChanges } from '../editor/apply-changes';
import type { DocumentKind } from '../markdown/kind';
import { useSettings } from '../settings/settings';
import { saySpell } from './notice';
import { useSpell } from './use-spell';

// What can be done with a misspelled word (Phase 2 design §12; Plan D, Calls 9, 10, 16, and 19):
// a suggestion in its place, the word in the script's dictionary or in My dictionary, or this one
// occurrence left alone. Each that edits the file is one undo step; each that can't do what it's
// asked changes nothing, and `whyNot` says why.

/**
 * The form a dictionary keeps: the word without a final 's, since a dictionary's words match as
 * possessives too (Call 6). The marks carry ’ read as ', so one rule covers both.
 */
const dictionaryForm = (word: string) => {
  const entry = word.trim();
  return /^.+'s$/i.test(entry) ? entry.slice(0, -2) : entry;
};

/** Unmarks the word and its possessive: both are known once the word is in a dictionary. */
const unmarkEffects = (entry: string) => [unmarkWord.of(entry), unmarkWord.of(`${entry}'s`)];

/** Whether `mark` is still a mark, where it was. */
function isCurrent(view: EditorView, mark: SpellMark): boolean {
  const now = spellMarkAt(view.state, mark.from);
  return !!now && now.from === mark.from && now.to === mark.to;
}

/**
 * Puts `suggestion` in place of the marked word, the whole of it (a `*` inside the word too), as
 * one undo step; the cursor goes after it. The edit drops the word's mark. False, changing
 * nothing, in a read-only tab or when the mark has gone.
 */
export function replaceWord(view: EditorView, mark: SpellMark, suggestion: string): boolean {
  if (suggestion === '' || !isCurrent(view, mark)) return false;
  return applyTextChanges(view, [{ from: mark.from, to: mark.to, insert: suggestion }], {
    selection: { anchor: mark.from + suggestion.length },
  });
}

/**
 * Adds the word to `dictionary` in the metadata block (keeping the block's other entries), and
 * unmarks every case of it, in one transaction: one undo takes the word out and puts its marks
 * back. False, changing nothing, in a Markdown document (no metadata block), a read-only tab,
 * with a stray `/*`, or when the word is in the dictionary already.
 */
export function addToScript(view: EditorView, word: string, kind: DocumentKind): boolean {
  if (kind === 'markdown' || view.state.readOnly) return false;
  const entry = dictionaryForm(word);
  const changes = addToScriptDictionary(view.state.field(parsedDoc), entry);
  if (changes.length === 0) return false;
  if (!applyTextChanges(view, changes, { effects: unmarkEffects(entry) })) return false;
  void saySpell(`Added “${entry}” to this script’s dictionary.`);
  return true;
}

/**
 * Add to this script's dictionary as the menu and the command run it: `addToScript`, or what
 * stops it said instead (`whyNot`, or the word is in the dictionary already).
 */
export function tryAddToScript(
  view: EditorView,
  word: string,
  kind: DocumentKind,
  readOnly: string | null,
): void {
  const why = whyNot(view, 'add-to-script', kind, readOnly);
  if (why) void saySpell(why);
  else if (!addToScript(view, word, kind)) {
    void saySpell(`“${dictionaryForm(word)}” is in this script’s dictionary already.`);
  }
}

/**
 * Adds the word to My dictionary (the setting, never the file: Call 9), then unmarks every case
 * of it. A word it has already, in any case, isn't added again. A read-only tab can do this.
 */
export async function addToMine(view: EditorView, word: string): Promise<void> {
  const entry = dictionaryForm(word);
  const { settings, set } = useSettings();
  const mine = settings.value.personalDictionary;
  const lower = entry.toLowerCase();
  if (!mine.some((w) => w.toLowerCase() === lower)) {
    await set('personalDictionary', [...mine, entry]);
  }
  view.dispatch({ effects: unmarkEffects(entry) });
  void saySpell(`Added “${entry}” to My dictionary.`);
}

/** Leaves this one occurrence unmarked for the visit (Call 10): nothing is saved. */
export function ignoreWordHere(view: EditorView, mark: SpellMark): void {
  view.dispatch({ effects: ignoreHere.of({ from: mark.from, to: mark.to }) });
}

/**
 * Why an action that edits the file is off, or null when it isn't: the tab is read-only (`readOnly`,
 * as the Outline gives it, or the editor's own state); for the script's dictionary, a Markdown
 * document (no metadata block) or a `/*` that isn't closed.
 */
export function whyNot(
  view: EditorView,
  action: 'replace' | 'add-to-script',
  kind: DocumentKind,
  readOnly: string | null,
): string | null {
  if (readOnly) return readOnly;
  if (view.state.readOnly) return 'This tab can’t edit the script now.';
  if (action === 'add-to-script') {
    if (kind === 'markdown') {
      return 'A Markdown document has no metadata block to keep a dictionary in; Add to my dictionary works.';
    }
    if (hasStrayBoneyard(view.state.field(parsedDoc))) {
      return 'A /* in this script isn’t closed by its own */, so its dictionary can’t be written until it is.';
    }
  }
  return null;
}

/**
 * Moves to the next (1) or previous (-1) misspelling, wrapping, and selects it; then says the word
 * and its first suggestion: "recieve. Suggestion: receive." or "recieve. No suggestions." False
 * when nothing is marked.
 */
export async function stepMisspelling(view: EditorView, direction: 1 | -1): Promise<boolean> {
  const mark = stepSpellMark(view.state, view.state.selection.main.head, direction);
  if (!mark) return false;
  view.dispatch({
    selection: { anchor: mark.from, head: mark.to },
    effects: EditorView.scrollIntoView(mark.from, { y: 'center' }),
  });
  const [first] = await useSpell().suggest(mark.word);
  void saySpell(`${mark.word}. ${first ? `Suggestion: ${first}.` : 'No suggestions.'}`);
  return true;
}
