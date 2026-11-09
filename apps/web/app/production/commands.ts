import { isolateHistory } from '@codemirror/commands';
import type { EditorView } from '@codemirror/view';
import { parsedDoc } from '@drafter/cm-fountain';
import type { Block, DrafterMeta, TextChange } from '@drafter/fountain';
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

/** What the actions need from the app. */
export interface ProductionDeps {
  view: EditorView;
  kind(): DocumentKind;
  template(): Template;
  firstScene(): number;
  /** Today, the local date, as `YYYY-MM-DD`. */
  today(): string;
  /** Freezes `text` as a draft with `note` (Drafts), and gives its id. */
  freeze(text: string, note: string): Promise<string>;
  /** Takes a snapshot of the text as it is now, before a change that takes marks away. */
  snapshot(reason: 'before-unlock' | 'before-clear-marks'): void;
  say(message: string): void;
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
export const LOCKED =
  'Pages and scene numbers are locked. Changes from now on are marked in the Blue revision.';
export const NUMBERS_WRITTEN = 'The new scenes’ numbers are written into their headings.';
export const ALL_NUMBERED = 'Every scene already has its number written.';
export const MARKS_CLEARED = 'Every revision’s marks are cleared. The script is still locked.';
export const UNLOCKED = 'Pages and scene numbers are unlocked. The text is as it was.';

/** Today, the local date, as `YYYY-MM-DD`. */
export function localDate(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

type Heading = Extract<Block, { kind: 'scene_heading' }>;

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
  const canEdit = () => !view.state.readOnly;
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
    return !!heading?.sem.number && !/^OMITTED\b/i.test(heading.sem.text.trim());
  }

  /**
   * Works out `compute`'s changes on the text as it is, and puts them in when the text is still
   * that; else once more, then says so. False when nothing changed.
   */
  async function apply(compute: (text: string) => Promise<TextChange[]>): Promise<boolean> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const before = view.state.doc;
      const changes = await compute(before.toString());
      if (view.state.doc !== before) continue;
      if (view.state.readOnly || changes.length === 0) return false;
      dispatchChanges(view, changes);
      return true;
    }
    deps.say(CHANGED_MEANWHILE);
    return false;
  }

  /** A draft frozen once per action, however many tries it takes. */
  function freezeOnce(note: string) {
    let id: Promise<string> | null = null;
    return (text: string) => {
      id ??= deps.freeze(text, note);
      return id;
    };
  }

  /** Says `message` when `done`, and gives `done` back. */
  const saying = (done: boolean, message: string) => {
    if (done) deps.say(message);
    return done;
  };

  async function doLock(): Promise<boolean> {
    if (!fountain() || locked()) return false;
    const freeze = freezeOnce('Locked');
    const done = await apply(async (text) =>
      lock(text, deps.template(), {
        today: deps.today(),
        draftId: await freeze(text),
        firstScene: deps.firstScene(),
      }),
    );
    return saying(done, LOCKED);
  }

  const nextName = () => nextSetName(read().production?.sets ?? []);

  async function doNextSet(): Promise<boolean> {
    const open = read().production?.sets.at(-1);
    if (!fountain() || !open) return false;
    const freeze = freezeOnce(`End of the ${open.name} revision`);
    const name = nextName();
    const done = await apply(async (text) =>
      startNextSet(text, deps.today(), await freeze(text), deps.template()),
    );
    return saying(done, `The ${name} revision has started. ${open.name}’s marks are kept.`);
  }

  async function doWriteNumbers(): Promise<boolean> {
    if (!fountain() || !locked() || !screenplay()) return false;
    const done = await apply((text) => writeSceneNumbers(text, deps.template()));
    deps.say(done ? NUMBERS_WRITTEN : ALL_NUMBERED);
    return done;
  }

  async function doOmit(sceneIndex: number): Promise<boolean> {
    if (!canOmit(sceneIndex)) return false;
    const number = headings()[sceneIndex]?.sem.number;
    const done = await apply(
      async (text) => (await omitScene(text, sceneIndex, deps.template())).changes,
    );
    return saying(done, `Scene ${number} is omitted. Undo brings it back.`);
  }

  async function doClearMarks(): Promise<boolean> {
    if (!fountain() || !locked()) return false;
    deps.snapshot('before-clear-marks');
    const freeze = freezeOnce('Marks cleared');
    const done = await apply(async (text) => clearMarks(text, deps.today(), await freeze(text)));
    return saying(done, MARKS_CLEARED);
  }

  async function doUnlock(): Promise<boolean> {
    const { production, damaged } = read();
    if (!fountain() || (!production && !damaged)) return false;
    deps.snapshot('before-unlock');
    return saying(await apply((text) => unlock(text)), UNLOCKED);
  }

  // ---- The commands -------------------------------------------------------------------------

  /** Why a command is off, in the order a writer would fix it; undefined when it is on. */
  const whyOff = (...checks: Array<[boolean, string]>) => {
    for (const [ok, why] of checks) if (!ok) return why;
    return undefined;
  };
  const base = (): Array<[boolean, string]> => [
    [fountain(), NOT_FOUNTAIN],
    [canEdit(), READ_ONLY],
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
    nextName,
    behaviors,
  };
}
