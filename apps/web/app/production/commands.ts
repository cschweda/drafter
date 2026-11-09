import { isolateHistory } from '@codemirror/commands';
import type { EditorView } from '@codemirror/view';
import { parsedDoc } from '@drafter/cm-fountain';
import { type Block, type DrafterMeta, parse, type TextChange } from '@drafter/fountain';
import {
  clearMarks,
  lock,
  nextSetName,
  numbersScenes,
  omitScene,
  type Production,
  readProduction,
  startNextSet,
  unlock,
  writeSceneNumbers,
} from '@drafter/production';
import type { Template } from '@drafter/templates';
import { ref } from 'vue';
import type { Behavior } from '../commands/behavior';
import { checkedChanges } from '../editor/apply-changes';
import type { DocumentKind } from '../markdown/kind';

// The writer's production actions (production design §5, §6.4, §7), as commands and as what the
// Production tab, its dialogs, and the scene menus call. Each action works out its text changes
// against the text as it is when it starts (`@drafter/production`, which waits on compression), so
// before they are put in, the text is checked to be the same; when the writer typed meanwhile, the
// action runs once more on the new text, and after that says so. The changes go in as one
// transaction, one undo step of their own, and not as an app change (`appChange`): the lock and the
// sets are the writer's own doing. They carry no user event either, so the hidden block's filter
// (`metadataKept`), which keeps typing out of the block, lets the block's own change through.

/** The question the Production tab's confirmation is asking, while it is up. */
export type ProductionQuestion = 'unlock' | 'clear-marks';
export const productionAsking = ref<ProductionQuestion | null>(null);

/** Scene numbers start at (production design §5): the number the lock gives the first scene. */
export const firstSceneNumber = ref(1);

/** What the last action said, success or not: the Production tab shows it in a status line. */
export const productionMessage = ref('');

/** An action is under way: no other starts until it is done. */
export const productionWorking = ref(false);

/** The snapshots the actions take before they change the text. */
export type ProductionSnapshot = 'before-unlock' | 'before-clear-marks' | 'before-omit';

/** What the actions need from the app. */
export interface ProductionDeps {
  view: EditorView;
  kind(): DocumentKind;
  template(): Template;
  firstScene(): number;
  /** Today, the local date, as `YYYY-MM-DD`. */
  today(): string;
  /** The id `freeze` will give `text`'s draft (its hash). */
  draftId(text: string): Promise<string>;
  /**
   * Freezes `text` as a draft with `note` (Drafts), once its action has gone in: the script text
   * the action left, without the block, whose id the block records (Ruling 28).
   */
  freeze(text: string, note: string): Promise<void>;
  /**
   * Takes a snapshot of the text as it is now, just before a change goes in (only when one will);
   * `detail` is Omit's scene number.
   */
  snapshot(reason: ProductionSnapshot, detail?: string): void;
  say(message: string): void;
  /** Why the script can't be changed now, or null; without it, the editor's read-only state says. */
  readOnlyWhy?(): string | null;
  /** Shows the Production tab. */
  show(): void;
}

export interface ProductionActions {
  lock(): Promise<boolean>;
  nextSet(): Promise<boolean>;
  writeNumbers(): Promise<boolean>;
  /** Omits scene `sceneIndex` (0-based, counting scene headings). */
  omit(sceneIndex: number): Promise<boolean>;
  clearMarks(): Promise<boolean>;
  unlock(): Promise<boolean>;
  /** Whether Omit scene applies to scene `sceneIndex`: a locked screenplay, a numbered scene. */
  canOmit(sceneIndex: number): boolean;
  /** The scene heading holding the cursor, as its index among the headings; null before the first. */
  sceneAtCursor(): number | null;
  /** The production as the text says now, or null; `damaged` when its block's production can't be read. */
  read(): { production: Production | null; damaged: boolean };
  /** Why the script can't be changed now, or null. */
  readOnlyWhy(): string | null;
  /** The name the next revision set will have: "Pink" after Blue. */
  nextName(): string;
  behaviors: Record<string, Behavior>;
}

/** Said when the writer kept typing through both tries. */
export const CHANGED_MEANWHILE =
  'The script changed while that was being worked out. Nothing was changed; try it again.';
export const NOT_FOUNTAIN = 'Production is for screenplays and stage plays.';
export const NOT_LOCKED = 'The script isn’t locked. Lock pages and scene numbers first.';
export const ALREADY_LOCKED = 'The script is already locked.';
export const NOT_SCREENPLAY = 'A stage play’s scenes aren’t numbered.';
export const READ_ONLY = 'The script can’t be changed now.';
export const NO_SCENE = 'The cursor isn’t in a numbered scene.';
export const BUSY = 'Another Production change is still being made.';
export const NOTHING_CHANGED = 'Nothing needed changing.';
export const NO_MARKS = 'There were no marks to clear.';
export const LOCKED =
  'Pages and scene numbers are locked. Changes from now on are marked in the Blue revision.';
export const NUMBERS_WRITTEN = 'The new scenes’ numbers are written into their headings.';
export const ALL_NUMBERED = 'Every scene already has its number written.';
export const MARKS_CLEARED = 'Every revision’s marks are cleared. The script is still locked.';
export const UNLOCKED = 'Pages and scene numbers are unlocked. The text is as it was.';
export const sceneGone = (number: string) =>
  `Scene ${number} isn’t in the script any more, so nothing was omitted.`;

/** Today, the local date, as `YYYY-MM-DD`. */
export function localDate(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

type Heading = Extract<Block, { kind: 'scene_heading' }>;

/** A heading Omit scene already made: `.OMITTED #12#`. */
const isOmitted = (heading: Heading) => /^OMITTED\b/i.test(heading.sem.text.trim());

/** Puts `changes` in as one undo step: the writer's own, with no user event (see above). */
function dispatchChanges(view: EditorView, changes: readonly TextChange[]): void {
  const sorted = checkedChanges(changes, view.state.doc.length);
  view.dispatch({
    changes: sorted.map((c) => ({
      from: c.from,
      to: c.to,
      insert: String(c.insert).replace(/\r?\n/g, view.state.lineBreak),
    })),
    annotations: [isolateHistory.of('full')],
  });
}

export function createProductionActions(deps: ProductionDeps): ProductionActions {
  const { view } = deps;

  // The production read from the parse, cached by the block's object, so the palette's many
  // `enabled` calls read it once.
  let cache: { meta: DrafterMeta | null; read: ReturnType<ProductionActions['read']> } | null =
    null;
  function read(): ReturnType<ProductionActions['read']> {
    const meta = view.state.field(parsedDoc).meta;
    if (cache?.meta === meta) return cache.read;
    const production = readProduction(meta);
    const damaged = !production && !!meta && Object.hasOwn(meta, 'production');
    cache = { meta, read: { production, damaged } };
    return cache.read;
  }

  const fountain = () => deps.kind() === 'fountain';
  const readOnlyWhy = () =>
    deps.readOnlyWhy ? deps.readOnlyWhy() : view.state.readOnly ? READ_ONLY : null;
  const canEdit = () => readOnlyWhy() === null && !productionWorking.value;
  const locked = () => read().production !== null;
  const screenplay = () => numbersScenes(deps.template());
  const headings = () =>
    view.state.field(parsedDoc).blocks.filter((b): b is Heading => b.kind === 'scene_heading');

  function sceneAtCursor(): number | null {
    const head = view.state.selection.main.head;
    let at: number | null = null;
    for (const [i, heading] of headings().entries()) {
      if (heading.span.from > head) break;
      at = i;
    }
    return at;
  }

  function canOmit(sceneIndex: number): boolean {
    if (!fountain() || !canEdit() || !locked() || !screenplay()) return false;
    const heading = headings()[sceneIndex];
    return !!heading?.sem.number && !isOmitted(heading);
  }

  /** What the last action said goes in the tab's status line, and to a screen reader. */
  const say = (message: string) => {
    productionMessage.value = message;
    deps.say(message);
  };

  /**
   * Works out `compute`'s changes on the text as it is, and puts them in when the text is still
   * that; else once more, then says so. `compute` gives null when what it acts on is gone.
   * `before` runs just before the changes go in, only when they will (a snapshot of the text as it
   * still is); `after` runs once they have (a draft is frozen), so nothing is left behind by a try
   * that didn't go in.
   */
  async function apply(
    compute: (text: string) => Promise<TextChange[] | null>,
    hooks: { before?: () => void; after?: () => unknown } = {},
  ): Promise<'done' | 'nothing' | 'gone' | 'changed'> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const before = view.state.doc;
      const text = before.toString();
      const changes = await compute(text);
      if (view.state.doc !== before) continue;
      if (changes === null) return 'gone';
      if (changes.length === 0 || view.state.readOnly) return 'nothing';
      hooks.before?.();
      dispatchChanges(view, changes);
      await hooks.after?.();
      return 'done';
    }
    say(CHANGED_MEANWHILE);
    return 'changed';
  }

  /**
   * Runs `act`, one action at a time, after the read-only check: nothing is frozen, snapshotted,
   * or changed in a script that can't be changed. Says `done` when it went in, `nothing` when it
   * didn't need to.
   */
  async function guarded(
    act: () => Promise<'done' | 'nothing' | 'gone' | 'changed'>,
    done: string,
    nothing = NOTHING_CHANGED,
  ): Promise<boolean> {
    if (productionWorking.value) {
      say(BUSY);
      return false;
    }
    const why = readOnlyWhy();
    if (why) {
      say(why);
      return false;
    }
    productionWorking.value = true;
    try {
      const result = await act();
      if (result === 'done') say(done);
      else if (result === 'nothing') say(nothing);
      return result === 'done';
    } finally {
      productionWorking.value = false;
    }
  }

  /**
   * Runs an action whose new set records a draft, and freezes that draft once it has gone in: the
   * script text the action leaves (block left out), whose hash is the id the block records
   * (Ruling 28). Each try keeps its own script, so only the one that goes in is frozen (Ruling 25).
   */
  function drafted(
    act: (text: string, draftId: (script: string) => Promise<string>) => Promise<TextChange[]>,
    note: string,
    hooks: { before?: () => void } = {},
  ) {
    let script: string | null = null;
    return apply(
      (text) => {
        script = null;
        return act(text, (s) => {
          script = s;
          return deps.draftId(s);
        });
      },
      { ...hooks, after: () => (script === null ? undefined : deps.freeze(script, note)) },
    );
  }

  async function doLock(): Promise<boolean> {
    if (!fountain() || locked()) return false;
    return guarded(
      () =>
        drafted(
          (text, draftId) =>
            lock(text, deps.template(), {
              today: deps.today(),
              draftId,
              firstScene: deps.firstScene(),
            }),
          'Locked',
        ),
      LOCKED,
    );
  }

  const nextName = () => nextSetName(read().production?.sets ?? []);

  async function doNextSet(): Promise<boolean> {
    const open = read().production?.sets.at(-1);
    if (!fountain() || !open) return false;
    const name = nextName();
    return guarded(
      () =>
        drafted(
          (text, draftId) => startNextSet(text, deps.today(), draftId, deps.template()),
          `End of the ${open.name} revision`,
        ),
      `The ${name} revision has started. ${open.name}’s marks are kept.`,
    );
  }

  async function doWriteNumbers(): Promise<boolean> {
    if (!fountain() || !locked() || !screenplay()) return false;
    return guarded(
      () => apply((text) => writeSceneNumbers(text, deps.template())),
      NUMBERS_WRITTEN,
      ALL_NUMBERED,
    );
  }

  async function doOmit(sceneIndex: number): Promise<boolean> {
    if (!canOmit(sceneIndex)) return false;
    const number = headings()[sceneIndex]?.sem.number as string;
    return guarded(async () => {
      const result = await apply(
        async (text) => {
          // A retry finds the scene again by its number, wherever it is now.
          const at = parse(text)
            .blocks.filter((b): b is Heading => b.kind === 'scene_heading')
            .findIndex((h) => h.sem.number === number && !isOmitted(h));
          if (at < 0) return null;
          return (await omitScene(text, at, deps.template())).changes;
        },
        // The scene's text as it is just before the omit is kept in a snapshot, so the recorder
        // finds it as a cut (Ruling 24).
        { before: () => deps.snapshot('before-omit', number) },
      );
      if (result === 'gone') say(sceneGone(number));
      return result;
    }, `Scene ${number} is omitted. Undo brings it back.`);
  }

  async function doClearMarks(): Promise<boolean> {
    if (!fountain() || !locked()) return false;
    return guarded(
      () =>
        drafted((text, draftId) => clearMarks(text, deps.today(), draftId), 'Marks cleared', {
          before: () => deps.snapshot('before-clear-marks'),
        }),
      MARKS_CLEARED,
      NO_MARKS,
    );
  }

  async function doUnlock(): Promise<boolean> {
    const { production, damaged } = read();
    if (!fountain() || (!production && !damaged)) return false;
    return guarded(
      () => apply((text) => unlock(text), { before: () => deps.snapshot('before-unlock') }),
      UNLOCKED,
    );
  }

  // ---- The commands -------------------------------------------------------------------------

  /** Why a command is off, in the order a writer would fix it; undefined when it is on. */
  const whyOff = (...checks: Array<[boolean, string]>) => {
    for (const [ok, why] of checks) if (!ok) return why;
    return undefined;
  };
  const base = (): Array<[boolean, string]> => [
    [fountain(), NOT_FOUNTAIN],
    [readOnlyWhy() === null, readOnlyWhy() ?? READ_ONLY],
    [!productionWorking.value, BUSY],
  ];
  const command = (checks: () => Array<[boolean, string]>, run: () => unknown): Behavior => ({
    enabled: () => whyOff(...base(), ...checks()) === undefined,
    why: () => whyOff(...base(), ...checks()),
    run: () => void run(),
  });

  const lockedChecks = (): Array<[boolean, string]> => [[locked(), NOT_LOCKED]];
  const numberChecks = (): Array<[boolean, string]> => [
    [locked(), NOT_LOCKED],
    [screenplay(), NOT_SCREENPLAY],
  ];

  const behaviors: Record<string, Behavior> = {
    'show-production': {
      enabled: fountain,
      why: () => (fountain() ? undefined : NOT_FOUNTAIN),
      run: deps.show,
    },
    'production-lock': command(() => [[!locked() && !read().damaged, ALREADY_LOCKED]], doLock),
    'production-next-set': {
      ...command(lockedChecks, doNextSet),
      liveTitle: () =>
        locked() ? `Start the next revision (${nextName()})` : 'Start the next revision',
    },
    'production-write-numbers': command(numberChecks, doWriteNumbers),
    'production-omit-scene': command(
      () => [...numberChecks(), [canOmit(sceneAtCursor() ?? -1), NO_SCENE]],
      () => {
        const at = sceneAtCursor();
        return at === null ? false : doOmit(at);
      },
    ),
    // These two ask first (production design §6.4): the tab's dialog runs the action.
    'production-clear-marks': command(lockedChecks, () => {
      productionAsking.value = 'clear-marks';
    }),
    'production-unlock': command(
      () => [[locked() || read().damaged, NOT_LOCKED]],
      () => {
        productionAsking.value = 'unlock';
      },
    ),
  };

  return {
    lock: doLock,
    nextSet: doNextSet,
    writeNumbers: doWriteNumbers,
    omit: doOmit,
    clearMarks: doClearMarks,
    unlock: doUnlock,
    canOmit,
    sceneAtCursor,
    read,
    readOnlyWhy,
    nextName,
    behaviors,
  };
}
