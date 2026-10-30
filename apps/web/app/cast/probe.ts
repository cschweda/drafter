import { castOf } from '@drafter/cast';
import { linesPerPage } from '@drafter/outline';
import { useLayout } from '../editor/layout';
import { useEditor } from '../editor/session';
import { useOutline } from '../outline/use-outline';
import { useCast } from './use-cast';
import { useWordAnswers } from './words';

// For the browser tests only: a test build (`DRAFTER_TEST_MODULES=1`) puts this on `window`
// (cast/probe-hook.ts, from the page), so e2e/cast-budget.spec.ts can time `castOf` on the page and hold
// the cast as a view will, before any view does. No other build has it (scripts/check-build.mjs).

export interface CastProbe {
  /** Holds the cast, as a shown view does; `release` lets go. */
  need(): void;
  release(): void;
  /** How many casts the session has worked out since the page loaded. */
  computed(): number;
  /** The newest cast's characters; 0 before the first. */
  characters(): number;
  /** The last scene's page, or 0 while the pages aren't ready. */
  pages(): number;
  /** `castOf` on the script as it is, best of `runs` after a warm-up, in milliseconds. */
  time(runs: number): number;
}

export function installCastProbe(): void {
  let release: (() => void) | null = null;
  let computed = 0;
  let watching = false;
  const watch = () => {
    if (watching) return;
    watching = true;
    let last = useCast().cast.value;
    // A poll, not a watcher: the probe adds no work to the session it measures.
    setInterval(() => {
      const now = useCast().cast.value;
      if (now !== last && now !== null) computed++;
      last = now;
    }, 20);
  };
  const probe: CastProbe = {
    need() {
      watch();
      release ??= useCast().need();
    },
    release() {
      release?.();
      release = null;
    },
    computed: () => computed,
    characters: () => useCast().cast.value?.characters.length ?? 0,
    pages: () => {
      const index = useOutline().index.value;
      return index.scenes.at(-1)?.pages?.page ?? 0;
    },
    time(runs) {
      const index = useOutline().index.value;
      const editor = useEditor();
      const perPage = linesPerPage(useLayout().layout.value);
      const { isWord } = useWordAnswers();
      const run = () => castOf(index, editor.doc.value, editor.template.value, perPage, isWord);
      run();
      let best = Number.POSITIVE_INFINITY;
      for (let k = 0; k < runs; k++) {
        const start = performance.now();
        run();
        best = Math.min(best, performance.now() - start);
      }
      return best;
    },
  };
  (window as unknown as { drafterCastProbe: CastProbe }).drafterCastProbe = probe;
}
