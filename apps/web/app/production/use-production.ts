import { metadataSpan } from '@drafter/fountain';
import {
  decodeBaseline,
  type Production,
  type ProductionSet,
  readProduction,
} from '@drafter/production';
import { type ComputedRef, computed, effectScope, type ShallowRef, shallowRef, watch } from 'vue';
import { useEditor } from '../editor/session';

// A locked script's production, as the web app reads it (production design §6.3, §6.3a): the
// `production` key of the script's `/* drafter */` block, with the open set's baseline decoded.
// Reading happens when the block changes, never when only the script's text does, and a baseline
// is decoded once per baseline string, so starting a set decodes again and typing never does.

/** A readable production with its open set's baseline text. */
export type ProductionState = Production & { baselineText: string };

/** What the status bar says when a block's production can't be read, or its baseline can't be decoded. */
export const DAMAGED_MESSAGE = "Revision marks can't be shown: the block is damaged";

export interface ProductionSession {
  /** The locked script's production; null when it isn't locked, or its block can't be read. */
  state: Readonly<ShallowRef<ProductionState | null>>;
  locked: ComputedRef<boolean>;
  /** The open revision set (the last); null while unlocked. */
  openSet: ComputedRef<ProductionSet | null>;
  /** The block has a production that can't be read, or whose baseline can't be decoded. */
  damaged: Readonly<ShallowRef<boolean>>;
  /** `DAMAGED_MESSAGE` while damaged, else ''. */
  problem: ComputedRef<string>;
}

let session: ProductionSession | undefined;

function create(): ProductionSession {
  const { doc } = useEditor();
  const state = shallowRef<ProductionState | null>(null);
  const damaged = shallowRef(false);

  /** The block last read, as text, so typing elsewhere is one string compare. */
  let block: string | null = null;
  /** The last baseline decoded: its encoded string and its text (null when it couldn't be). */
  let decoded: { encoded: string; text: string | null } | null = null;
  /** The newest read, so an older decode that finishes late is dropped. */
  let reading = 0;

  const settle = (next: ProductionState | null, broken: boolean) => {
    state.value = next;
    damaged.value = broken;
  };

  effectScope(true).run(() => {
    watch(
      doc,
      async (now) => {
        const span = metadataSpan(now);
        const text = span ? now.source.slice(span.from, span.to) : null;
        if (text === block) return;
        block = text;
        const mine = ++reading;
        const raw = now.meta?.production;
        if (raw === undefined) return settle(null, false);
        const production = readProduction(now.meta);
        if (!production) return settle(null, true);
        if (decoded?.encoded !== production.baseline) {
          const encoded = production.baseline;
          const baselineText = await decodeBaseline(encoded);
          if (mine !== reading) return;
          decoded = { encoded, text: baselineText };
        }
        if (decoded.text === null) return settle(null, true);
        settle({ ...production, baselineText: decoded.text }, false);
      },
      { immediate: true },
    );
  });

  return {
    // Not `readonly()`: that would hand out deep proxies, which a worker's message can't carry.
    state,
    locked: computed(() => state.value !== null),
    openSet: computed(() => state.value?.sets.at(-1) ?? null),
    damaged,
    problem: computed(() => (damaged.value ? DAMAGED_MESSAGE : '')),
  };
}

/** The script's production: made on first use and kept for the visit. */
export function useProduction(): ProductionSession {
  session ??= create();
  return session;
}
