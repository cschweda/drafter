import { isolateHistory } from '@codemirror/commands';
import { setMeta } from '@drafter/fountain';
import { type ComputedRef, computed } from 'vue';
import type { DocumentKind } from '../markdown/kind';
import { withNovel } from '../novel/kind';
import { useScript } from '../storage/script';
import { askToUseMarkdown } from './markdown-question';
import type { SampleKind } from './sample-kinds';
import { useEditor } from './session';
import {
  type DocumentType,
  isBuiltIn,
  type TemplateId,
  templateIdOf,
  unknownTemplateOf,
} from './template';
import { appChange } from './typewriter';

// The switcher is apart from `template.ts` because that file is plain data and functions, which
// storage and the tests import without the editor; this one needs the session.

export interface TemplateChoice {
  /** The template the script is in; the screenplay when `meta.template` is missing or unknown. */
  id: Readonly<ComputedRef<TemplateId>>;
  /** What the document is: Fountain, or Markdown (which has no template). */
  kind: Readonly<ComputedRef<DocumentKind>>;
  /** Whether `choose` can write: not in a read-only tab, and not while a `/*` is unclosed. */
  canChoose: Readonly<ComputedRef<boolean>>;
  /**
   * One undoable change to the metadata block, through `setMeta`. It is its own undo step, never
   * joined to typing before it. Nothing happens when the script already has that template, or when
   * `canChoose` is false. The session follows the new text (the layout, the lint) as for any edit.
   */
  choose(id: TemplateId): void;
  /**
   * Whether `type` is what the script is now: the template its block names, the screenplay when it
   * names none, or Markdown. A script whose block names a template Drafter doesn't have is shown as a
   * screenplay but is none of them, so Screenplay stays one the writer can choose (it replaces the name).
   */
  isCurrent(type: DocumentType): boolean;
  /**
   * Whether `chooseType(type)` can do anything now. Markdown also needs a script of the writer's
   * own (a sample stays a screenplay or a stage play), and going back to a template from
   * Markdown needs a writable block only if the template is to be written into it.
   */
  canChooseType(type: DocumentType): boolean;
  /**
   * Makes the script a `type` document. A template of a Fountain script is `choose`. Markdown
   * asks first (Fountain's formatting stops applying, and undo does not reverse it), then changes
   * the project's kind. A template chosen in a Markdown document turns Fountain back on, keeping
   * the text, then `choose`s. Resolves when it is done; nothing happens if the writer says no.
   */
  chooseType(type: DocumentType): Promise<void>;
}

export function useTemplate(): TemplateChoice {
  const { view, doc, locked, kind, novel } = useEditor();
  const script = useScript();
  const id = computed(() => templateIdOf(doc.value));
  // `setMeta` writes nothing after an unclosed boneyard: its own `*/` would close the writer's `/*`.
  const regionsClosed = () => doc.value.regions.every((r) => r.closed);
  const canChoose = computed(() => !locked.value && regionsClosed());

  /** Whether choosing `next` would change the block. An unknown name in it is replaced too, even by the screenplay it falls back to. */
  function changesBlock(next: TemplateId): boolean {
    const current = doc.value;
    return !(
      current.meta?.template === next ||
      (current.meta?.template === undefined && next === id.value)
    );
  }

  function choose(next: TemplateId) {
    if (!canChoose.value || !isBuiltIn(next) || view.state.readOnly) return;
    const current = doc.value;
    if (!changesBlock(next)) return;
    // The parse reads every line break as `\n`; the editor's own may be `\r\n`.
    const changes = setMeta(current, { ...current.meta, template: next }).map((change) => ({
      ...change,
      insert: change.insert.replace(/\r?\n/g, view.state.lineBreak),
    }));
    if (changes.length === 0) return;
    view.dispatch({
      changes,
      userEvent: 'input',
      annotations: [isolateHistory.of('full'), appChange.of(true)],
    });
    // A first document's blank text names the template it was made with: the offer ends here.
    script.forgetBlank();
  }

  function isCurrent(type: DocumentType): boolean {
    if (type.kind === 'markdown') {
      // A novel is a Markdown document that names its template; plain Markdown is one that doesn't.
      return kind.value === 'markdown' && novel.value === (type.id === 'novel');
    }
    return (
      kind.value === 'fountain' &&
      type.id === id.value &&
      unknownTemplateOf(doc.value) === undefined
    );
  }

  /**
   * A sample is the example it is, so it never changes kind: a type of the other kind (Markdown on
   * the screenplay sample, a template on the Markdown sample) opens that type's own sample instead.
   */
  function sampleFor(type: DocumentType): SampleKind | null {
    const sample = script.project.value?.sample;
    if (!sample) return null;
    // Between two templates of a script the sample takes the block, as it always has.
    if (type.kind === 'fountain' && kind.value === 'fountain') return null;
    const wanted: SampleKind =
      type.kind === 'markdown'
        ? type.id === 'novel'
          ? 'novel'
          : 'markdown'
        : type.id === 'stage-play-standard'
          ? 'stage-play'
          : 'screenplay';
    return wanted === sample ? null : wanted;
  }

  /**
   * Makes the Markdown document a novel, or plain Markdown again: one undoable change to the
   * metadata comment, which keeps every other fact in it (`template` is the one key this writes).
   * Plain Markdown with nothing else in the comment drops the comment.
   */
  function writeMarkdownTemplate(novelOn: boolean) {
    if (view.state.readOnly || novel.value === novelOn) return;
    const text = view.state.doc.toString();
    const next = withNovel(text, novelOn);
    let from = 0;
    while (from < text.length && from < next.length && text[from] === next[from]) from++;
    let end = text.length;
    let nextEnd = next.length;
    while (end > from && nextEnd > from && text[end - 1] === next[nextEnd - 1]) {
      end--;
      nextEnd--;
    }
    if (from === end && nextEnd === from) return;
    view.dispatch({
      changes: { from, to: end, insert: next.slice(from, nextEnd) },
      userEvent: 'input',
      annotations: [isolateHistory.of('full'), appChange.of(true)],
    });
    script.forgetBlank();
  }

  function canChooseType(type: DocumentType): boolean {
    if (locked.value) return false;
    if (sampleFor(type)) return true;
    if (type.kind === 'markdown') return true;
    if (kind.value === 'fountain') return canChoose.value;
    // From Markdown: the kind changes either way; the block is written only for a template that isn't the default.
    return !changesBlock(type.id) || regionsClosed();
  }

  async function chooseType(type: DocumentType) {
    if (!canChooseType(type)) return;
    const sample = sampleFor(type);
    if (sample) {
      await script.openSample(sample);
      return;
    }
    if (type.kind === 'markdown') {
      if (kind.value === 'markdown') {
        // Already a Markdown document: a novel, or plain, is a change of its comment.
        writeMarkdownTemplate(type.id === 'novel');
        return;
      }
      // The app's keys still work under the question, so another script may be open by the time
      // it is answered: the answer is about the one it was asked about, or nothing changes.
      const asked = script.project.value?.id;
      if (!(await askToUseMarkdown()) || !canChooseType(type)) return;
      if (script.project.value?.id !== asked) return;
      await script.setKind('markdown');
      // Nothing changed (a switch began, or the tab became read-only): no comment is written.
      if (type.id === 'novel' && (kind.value as DocumentKind) === 'markdown') {
        writeMarkdownTemplate(true);
      }
      return;
    }
    if (kind.value === 'markdown') {
      await script.setKind('fountain');
      // Nothing changed (a switch began, or the tab became read-only): no block is written into Markdown.
      if ((kind.value as DocumentKind) !== 'fountain') return;
    }
    choose(type.id);
  }

  return {
    id,
    kind: computed(() => kind.value),
    canChoose,
    choose,
    isCurrent,
    canChooseType,
    chooseType,
  };
}
