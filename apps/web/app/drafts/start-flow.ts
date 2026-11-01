import { type Ref, ref } from 'vue';

// Start new draft…'s question (drafts-and-cuts design §2.1, Call 2): when the text is the same as
// the last draft, the dialog asks "Start Draft 05 anyway?" before a new number. The check takes a
// moment (it hashes the text), so a submit waits for it: an Enter pressed at once never skips the
// question. A second submit, with the question shown, starts the draft.

export interface StartFlow {
  /** The last draft's number when the text is the same as it, once checked; else null. */
  same: Readonly<Ref<{ n: number } | null>>;
  /** The dialog opened: the check starts again. */
  open(): void;
  /** 'asked' when the question has just been shown instead; else what starting did. */
  submit(note: string): Promise<'asked' | 'started' | 'failed'>;
}

export function createStartFlow(deps: {
  sameAs(): Promise<{ n: number } | null>;
  start(note: string): Promise<boolean>;
}): StartFlow {
  const same = ref<{ n: number } | null>(null);
  let checking: Promise<{ n: number } | null> = Promise.resolve(null);
  let opened = 0;

  function open() {
    const mine = ++opened;
    same.value = null;
    checking = deps
      .sameAs()
      .catch(() => null)
      .then((last) => {
        const found = last ? { n: last.n } : null;
        if (mine === opened) same.value = found;
        return found;
      });
  }

  async function submit(note: string) {
    const shown = same.value !== null;
    const last = await checking;
    if (last && !shown) return 'asked' as const;
    return (await deps.start(note)) ? ('started' as const) : ('failed' as const);
  }

  return { same, open, submit };
}
