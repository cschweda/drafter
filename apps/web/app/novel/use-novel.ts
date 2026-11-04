import { isolateHistory } from '@codemirror/commands';
import { ChangeSet, EditorSelection } from '@codemirror/state';
import {
  carryFacts,
  type Facts,
  findNode,
  MAX_SYNOPSIS,
  moveNode,
  type NovelFacts,
  type NovelNode,
  type NovelTarget,
  type NovelTree,
  novelStructure,
  readFacts,
} from '@drafter/novel';
import { effectScope, type Ref, shallowRef, watch } from 'vue';
import { useEditor } from '../editor/session';
import { appChange } from '../editor/typewriter';
import { sayOutline } from '../outline/notice';
import { useScript } from '../storage/script';
import { factsChange, novelFacts, sameFacts } from './carry';
import { focusedPassage } from './focus';

// The Outline's model for a novel (the Novel design, goal 3): the book's parts, chapters, and
// sections, the facts kept beside them, and the edits the Outline makes. Each edit is one
// transaction and one undo step, and writes its own facts (so `carry.ts` leaves it alone).

export interface NovelSession {
  /** The book's structure, or null when the open document is not a novel. */
  tree: Readonly<Ref<NovelTree | null>>;
  facts: Readonly<Ref<NovelFacts>>;
  /** The id of the node the last move put in place (ids can renumber in a move), or null. */
  moved: Readonly<Ref<string | null>>;
  /** Why nothing can be changed from the Outline now, or null when it can. */
  readOnly(): string | null;
  /** Writes `facts` as the facts of node `id`, in one undo step. Empty facts take them away. */
  setFacts(id: string, facts: Facts): void;
  /** Moves node `id` to `target` with its text and its facts, in one undo step. */
  move(id: string, target: NovelTarget): boolean;
  /** Puts the cursor at node `id`'s heading and shows it in the Source. */
  goto(id: string): void;
}

const emptyFacts = (): NovelFacts => ({ nodes: Object.create(null) as Record<string, Facts> });

let session: NovelSession | undefined;

function create(): NovelSession {
  const editor = useEditor();
  const script = useScript();
  return effectScope(true).run(() => {
    const tree = shallowRef<NovelTree | null>(null);
    const facts = shallowRef<NovelFacts>(emptyFacts());
    const moved = shallowRef<string | null>(null);

    /** Reads the book again, now. */
    function refresh() {
      cancel();
      if (editor.kind.value !== 'markdown' || !editor.novel.value) {
        tree.value = null;
        facts.value = emptyFacts();
        return;
      }
      const text = editor.view.state.doc.toString();
      tree.value = novelStructure(text);
      const next = readFacts(text);
      if (!sameFacts(next, facts.value)) facts.value = next;
    }

    // One read a frame, however many changes came in it.
    let frame: number | null = null;
    const raf =
      typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame
        : (run: () => void) => setTimeout(run, 16) as unknown as number;
    const unraf =
      typeof cancelAnimationFrame === 'function'
        ? cancelAnimationFrame
        : (id: number) => clearTimeout(id);
    function cancel() {
      if (frame !== null) unraf(frame);
      frame = null;
    }
    function schedule() {
      if (frame !== null) return;
      frame = raf(() => {
        frame = null;
        refresh();
      });
    }
    editor.onChange(schedule);
    watch([editor.kind, editor.novel], refresh);
    refresh();

    const readOnly = () => {
      if (editor.locked.value) return 'This novel is open for editing in another tab.';
      if (script.fileLocked.value) return 'Drafter is checking this novel’s file first.';
      if (editor.view.state.readOnly) return 'This novel can’t be changed here.';
      return null;
    };

    /** Dispatches `changes` as an edit of the Outline's own: one undo step, its facts written. */
    function dispatch(changes: ChangeSet, selection?: EditorSelection) {
      editor.view.dispatch({
        changes,
        ...(selection && { selection }),
        userEvent: 'input',
        annotations: [isolateHistory.of('full'), appChange.of(true), novelFacts.of(true)],
      });
      refresh();
    }

    function setFacts(id: string, next: Facts) {
      const why = readOnly();
      if (why) {
        void sayOutline(why);
        return;
      }
      const state = editor.view.state;
      const text = state.doc.toString();
      const all = readFacts(text);
      const kept: Facts = {};
      if (next.status) kept.status = next.status;
      const synopsis = capSynopsis(next.synopsis?.trim() ?? '');
      if (synopsis) kept.synopsis = synopsis;
      if (next.target) kept.target = next.target;
      if (Object.keys(kept).length > 0) all.nodes[id] = kept;
      else delete all.nodes[id];
      const change = factsChange(text, all);
      if (!change) return;
      dispatch(state.changes(change));
    }

    function move(id: string, target: NovelTarget): boolean {
      moved.value = null;
      const why = readOnly();
      if (why) {
        void sayOutline(why);
        return false;
      }
      const state = editor.view.state;
      const text = state.doc.toString();
      const before = novelStructure(text);
      const done = moveNode(text, before, id, target);
      if (!done) return false;
      const moveSet = state.changes(done.changes);
      const out = moveSet.apply(state.doc).toString();
      const after = novelStructure(out);
      // The facts follow their headings, and the comment stays last: one change set, one undo.
      const old = readFacts(text);
      const carried = carryFacts(old, before, after, done.mapPos);
      const change = sameFacts(carried, old) ? null : factsChange(out, carried);
      const all = change ? moveSet.compose(ChangeSet.of([change], out.length)) : moveSet;
      // While a passage is focused, the cursor travels with the text it is in, so a move of the
      // focused passage keeps the cursor in it, and the focus with it (focus.ts).
      const selection = focusedPassage(state)
        ? EditorSelection.create(
            state.selection.ranges.map((r) =>
              EditorSelection.range(done.mapPos(r.anchor), done.mapPos(r.head)),
            ),
            state.selection.mainIndex,
          )
        : undefined;
      dispatch(all, selection);
      moved.value = findAt(after.nodes, done.at)?.id ?? null;
      return true;
    }

    function goto(id: string) {
      const node = findNode(novelStructure(editor.view.state.doc.toString()), id);
      if (node) editor.goto(node.heading.from);
    }

    return { tree, facts, moved, readOnly, setFacts, move, goto } satisfies NovelSession;
  }) as NovelSession;
}

/** A synopsis no longer than the package keeps (`MAX_SYNOPSIS`), never cut inside a surrogate pair. */
export function capSynopsis(text: string): string {
  if (text.length <= MAX_SYNOPSIS) return text;
  const cut = text.slice(0, MAX_SYNOPSIS);
  const last = cut.charCodeAt(cut.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? cut.slice(0, -1) : cut;
}

function findAt(list: NovelNode[], at: number): NovelNode | null {
  for (const node of list) {
    if (node.heading.from === at) return node;
    const found = findAt(node.children, at);
    if (found) return found;
  }
  return null;
}

/** The novel's Outline model, made on first use in the browser and kept for the visit. */
export function useNovel(): NovelSession {
  session ??= create();
  return session;
}
