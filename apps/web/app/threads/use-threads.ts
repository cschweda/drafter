import { normalizeLabel, readThreadMetaMap, setThreadMeta, type ThreadMeta } from '@drafter/notes';
import {
  type NovelNode,
  removeNovelThread,
  renameNovelThread,
  setNovelThreadMeta,
  setPassageThreads,
} from '@drafter/novel';
import {
  describeThreads,
  type Lanes,
  lanesOf,
  linesPerPage,
  removeThread,
  renameThread,
  scriptUnits,
  setSceneThreads,
  type ThreadInfo,
  threadInfo,
} from '@drafter/outline';
import { effectScope, type Ref, shallowRef, watch } from 'vue';
import { useLayout } from '../editor/layout';
import { useEditor } from '../editor/session';
import { useNovel } from '../novel/use-novel';
import { useOutline } from '../outline/use-outline';
import { novelUnits } from './novel-units';

// The threads session (Threads design §5, §7.2–7.4): a script's scenes or a novel's passages as
// lanes, the threads' names and colors, and the edits a view makes. Computed only while something
// holds it, after typing pauses, as the strip is; every edit is one transaction (one undo) and
// says nothing itself, because the view announces.

export interface ThreadsSession {
  /** Null for plain Markdown, and before the first hold. */
  lanes: Readonly<Ref<Lanes | null>>;
  info: Readonly<Ref<ThreadInfo[]>>;
  /** Keeps `lanes` and `info` fresh until the function it returns is called. */
  hold(): () => void;
  /** Why nothing can be changed now, or null. */
  readOnly(): string | null;
  /** Puts the scene or passage `id` in exactly these threads. False, changing nothing, if it can't. */
  setUnitThreads(id: string, labels: string[]): boolean;
  /** Renames thread `from` everywhere, with its name and color; null, changing nothing, if it can't. */
  rename(from: string, to: string): { units: number; merged: boolean } | null;
  /** Takes the thread out of every unit; the count, or null, changing nothing, if it can't. */
  remove(label: string): number | null;
  setMeta(label: string, meta: ThreadMeta | null): boolean;
  go(id: string): void;
  noun: Readonly<Ref<'scene' | 'passage'>>;
}

/** How long typing must pause before the lanes are read again. */
const PAUSE = 250;

let session: ThreadsSession | undefined;

function create(): ThreadsSession {
  const editor = useEditor();
  const outline = useOutline();
  const novel = useNovel();
  const { layout } = useLayout();
  return effectScope(true).run(() => {
    const lanes = shallowRef<Lanes | null>(null);
    const info = shallowRef<ThreadInfo[]>([]);
    const noun = shallowRef<'scene' | 'passage'>('scene');
    const isNovel = () => editor.kind.value === 'markdown' && editor.novel.value === true;
    const isScript = () => editor.kind.value !== 'markdown';

    function compute() {
      if (isNovel()) {
        noun.value = 'passage';
        const tree = novel.tree.value;
        const facts = novel.facts.value;
        if (!tree) {
          lanes.value = null;
          info.value = [];
          return;
        }
        const units = novelUnits(tree, facts);
        lanes.value = lanesOf(units, 'words');
        const found = new Map<string, { label: string; units: number }>();
        for (const unit of units) {
          for (const label of unit.threads) {
            const key = normalizeLabel(label);
            const seen = found.get(key);
            if (!seen) found.set(key, { label, units: unit.inherited ? 0 : 1 });
            else if (!unit.inherited) seen.units++;
          }
        }
        info.value = describeThreads(found, readThreadMetaMap(facts.threads));
      } else if (isScript()) {
        noun.value = 'scene';
        const index = outline.index.value;
        const made = scriptUnits(index, linesPerPage(layout.value));
        lanes.value = lanesOf(made.units, made.unit);
        info.value = threadInfo(editor.doc.value, index);
      } else {
        noun.value = 'scene';
        lanes.value = null;
        info.value = [];
      }
    }

    let holds = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const cancel = () => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
    };
    const schedule = () => {
      if (holds === 0) return;
      cancel();
      timer = setTimeout(() => {
        timer = null;
        compute();
      }, PAUSE);
    };
    /** After an edit of its own: read again at once. */
    const now = () => {
      if (holds === 0) return;
      cancel();
      compute();
    };
    editor.onChange((changes) => {
      if (changes === null && holds > 0) now();
      else schedule();
    });
    // Exactly one hold on the novel while this is held and the document is a novel.
    let novelHold: (() => void) | null = null;
    const keepNovelHold = () => {
      const want = holds > 0 && isNovel();
      if (want && !novelHold) novelHold = novel.hold();
      else if (!want && novelHold) {
        novelHold();
        novelHold = null;
      }
    };
    watch([layout, editor.kind, editor.novel], () => {
      keepNovelHold();
      now();
    });

    function hold() {
      holds++;
      keepNovelHold();
      if (holds === 1) compute();
      let held = true;
      return () => {
        if (!held) return;
        held = false;
        holds--;
        keepNovelHold();
        if (holds === 0) cancel();
      };
    }

    const readOnly = () => (isNovel() ? novel.readOnly() : outline.readOnly.value);

    /** Runs an edit that may throw a RangeError for a label that isn't one. */
    function tried<T>(run: () => T, otherwise: T): T {
      try {
        return run();
      } catch (e) {
        if (e instanceof RangeError) return otherwise;
        throw e;
      }
    }

    function setUnitThreads(id: string, labels: string[]): boolean {
      if (readOnly() !== null) return false;
      return tried(() => {
        if (isNovel()) {
          const done = novel.setAllFacts(setPassageThreads(novel.current(), id, labels));
          now();
          return done;
        }
        const scene = outline.index.value.scenes.find((s) => `scene:${s.block}` === id);
        if (!scene) return false;
        const done = outline.apply(setSceneThreads(editor.doc.value, scene, labels));
        now();
        return done;
      }, false);
    }

    /** Whether passage `id`'s heading is still in the book: facts left behind are left alone. */
    function inBook(): (id: string) => boolean {
      const ids = new Set<string>();
      const walk = (list: readonly NovelNode[]) => {
        for (const node of list) {
          ids.add(node.id);
          walk(node.children);
        }
      };
      walk(novel.tree.value?.nodes ?? []);
      return (id) => ids.has(id);
    }

    function rename(from: string, to: string): { units: number; merged: boolean } | null {
      if (readOnly() !== null) return null;
      return tried(() => {
        if (isNovel()) {
          const done = renameNovelThread(novel.current(), from, to, inBook());
          if (!novel.setAllFacts(done.facts)) return null;
          now();
          return { units: done.passages, merged: done.merged };
        }
        const done = renameThread(editor.doc.value, outline.index.value, from, to);
        if (done.changes.length === 0 || !outline.apply(done.changes)) return null;
        now();
        return { units: done.scenes, merged: done.merged };
      }, null);
    }

    function remove(label: string): number | null {
      if (readOnly() !== null) return null;
      return tried(() => {
        if (isNovel()) {
          const done = removeNovelThread(novel.current(), label, inBook());
          if (!novel.setAllFacts(done.facts)) return null;
          now();
          return done.passages;
        }
        const done = removeThread(editor.doc.value, outline.index.value, label);
        if (done.changes.length === 0 || !outline.apply(done.changes)) return null;
        now();
        return done.scenes;
      }, null);
    }

    function setMeta(label: string, meta: ThreadMeta | null): boolean {
      if (readOnly() !== null || (!isNovel() && !isScript())) return false;
      return tried(() => {
        const done = isNovel()
          ? novel.setAllFacts(setNovelThreadMeta(novel.current(), label, meta))
          : outline.apply(setThreadMeta(editor.doc.value, label, meta));
        now();
        return done;
      }, false);
    }

    function go(id: string) {
      if (isNovel()) {
        novel.goto(id);
        return;
      }
      const scene = outline.index.value.scenes.find((s) => `scene:${s.block}` === id);
      if (scene) editor.goto(scene.span.from);
    }

    return {
      lanes,
      info,
      hold,
      readOnly,
      setUnitThreads,
      rename,
      remove,
      setMeta,
      go,
      noun,
    } satisfies ThreadsSession;
  }) as ThreadsSession;
}

/** The threads session, made on first use in the browser and kept for the visit. */
export function useThreads(): ThreadsSession {
  session ??= create();
  return session;
}
