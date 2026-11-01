// When and where drafts and cuts are written beside the work, in the app (drafts-and-cuts design
// §4, §4.1, §4.2; plan Task 7). The writing itself is `beside.ts`; this decides when:
//
// - **Opening** a script (or switching to one): the drafts folder and the cuts file are read and
//   merged into the lists, so another computer's drafts and cuts arrive, and anything not yet
//   written here is written. Again when the page is shown after a while away (the files may
//   have changed in Dropbox meanwhile).
// - **After a freeze** (Start new draft, Restore as a new draft): the new draft's file.
// - **After cuts are recorded**: the cuts file, merged with what is on disk first.
// - **After a save to another place** (Save As, a first save): the whole set again beside the new
//   file; the old one is left where it is.
//
// Where: the desktop app always has somewhere (beside the script's file, once it has one). In
// Chromium, the script's folder, once the writer grants it (asked once, the first time a draft or
// a cut needs writing; declined, they stay in the browser and the lists say so, with a button to
// ask again). Elsewhere, in the browser only, with Export drafts and cuts in the lists.
import type { WorkKind } from '@drafter/history';
import { computed, effectScope, type Ref, ref, shallowRef, watch } from 'vue';
import { useCuts } from '../cuts/use-cuts';
import { cutsRecorded } from '../cuts/use-recorder';
import { desktop } from '../desktop';
import { useDrafts } from '../drafts/use-drafts';
import { useEditor } from '../editor/session';
import { sayOutline } from '../outline/notice';
import { db } from '../storage/db';
import type { DesktopRef } from '../storage/desktop-files';
import { useFiles } from '../storage/files';
import { getHandle, kindOf, type Project } from '../storage/projects';
import { useScript } from '../storage/script';
import { titleFor } from '../storage/text';
import {
  type BesideFolder,
  type BesideNames,
  besideNames,
  type Synced,
  syncBeside,
} from './beside';
import { desktopFolder } from './desktop';
import { exportDraftsAndCuts, exportName } from './export';
import { besideFailure, renamedLine } from './failure';
import { skippedLine } from './read';
import {
  canPickFolder,
  folderGrant,
  folderHolds,
  folderPermission,
  pickFolder,
  storedFolder,
  storeFolder,
  webFolder,
} from './web';

/** Where a script's drafts and cuts can be written now, or why not. */
type Place =
  | { kind: 'beside'; folder: BesideFolder; names: BesideNames; where: string }
  /** Chromium, a script with a file, and no folder granted that holds it (or not allowed now). */
  | { kind: 'ask'; file: string }
  | { kind: 'browser' };

/** The settings row saying the writer said Not now to the folder (per project). */
export const declinedKey = (projectId: string): string => `beside-declined:${projectId}`;

/** The settings row naming the file a project's drafts and cuts were last written beside. */
export const namesKey = (projectId: string): string => `beside-names:${projectId}`;

/** How long the page must have been away before showing it reads the files again. */
export const AWAY_MS = 30_000;

export interface BesideSession {
  /** Where the open script's drafts and cuts are kept. */
  where: Readonly<Ref<'beside' | 'browser'>>;
  /** The script's file name, beside which they are written (or would be). */
  file: Readonly<Ref<string>>;
  /** Whether the script's folder can be asked for here (Chromium, a script with a file). */
  canAsk: Readonly<Ref<boolean>>;
  /** Why the last write beside the script failed, and how to fix it; null when it didn't. */
  failure: Readonly<Ref<string | null>>;
  /** The line the Drafts and Cuts lists show. */
  line: Readonly<Ref<string>>;
  /** The question "Keep drafts and cuts next to Boca.fountain?" while it is asked. */
  offer: Readonly<Ref<{ file: string; problem: string } | null>>;
  /** Shows the question (from the lists' button). */
  showOffer(): void;
  /** Picks the folder (the question's button: it needs the writer's click). */
  askForFolder(): Promise<boolean>;
  /** Not now: they stay in the browser, until the writer asks again. */
  decline(): Promise<void>;
  /** Downloads the zip of the open script's drafts and cuts. */
  exportZip(): Promise<void>;
  /** Brings the open script's drafts and cuts and the files beside it together. */
  sync(how: SyncHow): Promise<Synced | null>;
}

/** Why a sync runs: what it reads and writes. */
export type SyncHow = 'open' | 'saved' | 'freeze' | 'cut';

const kindOfWork = (project: Project): WorkKind =>
  kindOf(project) === 'markdown' ? 'markdown' : 'fountain';

/** The names a script's drafts and cuts have: from its file, else the title in `text`. */
function namesFor(project: Project, text: string): BesideNames | null {
  const ext = kindOf(project) === 'markdown' ? '.md' : '.fountain';
  const title = titleFor(kindOf(project), text, project.title || 'Untitled');
  return (
    (project.fileName ? besideNames(project.fileName) : null) ??
    besideNames(`${title}${ext}`) ??
    besideNames(`Untitled${ext}`)
  );
}

/** Where `project`'s drafts and cuts can be written now. `ask`: may ask for permission (a click). */
async function placeOf(project: Project, ask = false): Promise<Place> {
  if (project.sample || !project.fsHandleId) return { kind: 'browser' };
  const ref = await getHandle(project.fsHandleId).catch(() => undefined);
  if (!ref) return { kind: 'browser' };
  const bridge = desktop()?.files;
  if (bridge) {
    const path = (ref as Partial<DesktopRef>).path;
    if (typeof path !== 'string' || path === '') return { kind: 'browser' };
    // The main process names the files after the script's real name: so does this.
    let real = path;
    try {
      real = await bridge.realPath(path);
    } catch {
      // By the path's own name.
    }
    const names = besideNames(real.split(/[\\/]/).at(-1) ?? '');
    if (!names) return { kind: 'browser' };
    return { kind: 'beside', folder: desktopFolder(bridge, path), names, where: `desktop:${real}` };
  }
  if (!canPickFolder() || typeof (ref as FileSystemFileHandle).isSameEntry !== 'function')
    return { kind: 'browser' };
  const folder = await storedFolder(project.id);
  if (!folder) return { kind: 'ask', file: ref.name };
  try {
    if ((await folderPermission(folder, ask)) !== 'granted') return { kind: 'ask', file: ref.name };
  } catch {
    return { kind: 'ask', file: ref.name };
  }
  // A Save As to another folder: this one no longer holds the script.
  if (!(await folderHolds(folder, ref))) return { kind: 'ask', file: ref.name };
  const names = besideNames(ref.name);
  if (!names) return { kind: 'browser' };
  return {
    kind: 'beside',
    folder: webFolder(folder),
    names,
    // The grant's ID, not the folder's name: another folder called the same is another place.
    where: `web:${await folderGrant(project.id)}/${ref.name}`,
  };
}

let shared: BesideSession | undefined;

function create(): BesideSession {
  const script = useScript();
  const drafts = useDrafts();
  const cuts = useCuts();
  const where = ref<'beside' | 'browser'>('browser');
  const file = ref('');
  const canAsk = ref(false);
  const offer = shallowRef<{ file: string; problem: string } | null>(null);
  /** Per script this visit: the place last written, and whether the question was asked. */
  const lastWhere = new Map<string, string>();
  const offered = new Set<string>();
  /** Per script this visit: the place last written in full, and the failure last said. */
  const wroteAt = new Map<string, string>();
  const said = new Map<string, string>();
  const failure = ref<string | null>(null);
  let queue: Promise<unknown> = Promise.resolve();

  const line = computed(() => {
    if (failure.value) return failure.value;
    if (where.value === 'beside') return `Saved beside ${file.value}.`;
    return 'In this browser only.';
  });

  async function refresh(project: Project | null): Promise<Place> {
    const place: Place = project ? await placeOf(project) : { kind: 'browser' };
    if (project?.id !== script.project.value?.id) return place;
    // "Saved beside" only once a write there has worked: until then, and after one fails, not.
    const wrote = place.kind === 'beside' && project && wroteAt.get(project.id) === place.where;
    where.value = wrote ? 'beside' : 'browser';
    failure.value = place.kind === 'beside' && project ? (said.get(project.id) ?? null) : null;
    canAsk.value = place.kind === 'ask';
    file.value =
      place.kind === 'beside'
        ? place.names.file
        : place.kind === 'ask'
          ? place.file
          : (project?.fileName ?? '');
    return place;
  }

  /** Says what reading the files beside the work brought in, once. */
  function tell(out: Synced, names: BesideNames) {
    const said: string[] = [];
    if (out.draftsAdded > 0 || out.cutsAdded > 0) {
      const parts = [
        out.draftsAdded > 0 ? `${out.draftsAdded} draft${out.draftsAdded === 1 ? '' : 's'}` : '',
        out.cutsAdded > 0 ? `${out.cutsAdded} cut${out.cutsAdded === 1 ? '' : 's'}` : '',
      ].filter(Boolean);
      said.push(`Read ${parts.join(' and ')} from beside ${names.file}.`);
    }
    for (const name of out.changed)
      said.push(`“${name}” was changed outside Drafter: it is listed apart.`);
    const skipped = skippedLine(out.skipped, names.cuts);
    if (skipped) said.push(skipped);
    if (out.problem)
      said.push(`Couldn’t read “${names.cuts}”: ${out.problem}. It was left as it is.`);
    if (said.length > 0) void sayOutline(said.join(' '));
  }

  async function run(how: SyncHow): Promise<Synced | null> {
    const project = script.project.value;
    if (!project || project.sample) {
      await refresh(null);
      return null;
    }
    const place = await refresh(project);
    if (place.kind === 'ask') {
      // The first freeze asks, once a visit, unless it was declined. (A cut is recorded while the
      // writer types: a question then would interrupt, so the lists offer it instead.)
      if (how === 'freeze' && !offered.has(project.id)) {
        const declined = (await db.settings.get(declinedKey(project.id)).catch(() => undefined))
          ?.value;
        if (declined !== true && (drafts.rows.value.length > 0 || cuts.rows.value.length > 0)) {
          offered.add(project.id);
          offer.value = { file: place.file, problem: '' };
        }
      }
      return null;
    }
    if (place.kind !== 'beside') return null;
    const moved = lastWhere.get(project.id) !== place.where;
    const full = how === 'open' || moved;
    const failed = (errors: unknown[], drafts: string[] = []) => {
      wroteAt.delete(project.id);
      const message = besideFailure(place.names.file, errors, drafts);
      if (script.project.value?.id === project.id) {
        where.value = 'browser';
        failure.value = message;
        // In Chromium, the lists' Keep next to … asks for the folder again: a way to retry now.
        if (!desktop()) canAsk.value = true;
      }
      // Said once: the same failure again (at the next cut, say) is only in the lists' line.
      if (said.get(project.id) !== message) void sayOutline(message);
      said.set(project.id, message);
    };
    let out: Synced;
    try {
      out = await syncBeside(
        project.id,
        place.folder,
        place.names,
        kindOfWork(project),
        place.where,
        {
          readDrafts: full,
          cuts: full || how === 'cut',
          now: new Date(),
        },
      );
    } catch (error) {
      // Not written this time: they are in the browser, and the next freeze, cut or open tries again.
      failed([error]);
      return null;
    }
    if (out.failed.length > 0) {
      failed(
        out.failed.map((f) => f.error),
        out.failed.filter((f) => f.what !== place.names.cuts).map((f) => f.what),
      );
    } else {
      // Only a sync that wrote everything counts as written here: after a failure, the next one
      // is a full one again.
      lastWhere.set(project.id, place.where);
      wroteAt.set(project.id, place.where);
      // The file renamed outside Drafter (not by a Save As): said once, as the name is kept.
      const before = (await db.settings.get(namesKey(project.id)).catch(() => undefined))?.value;
      const renamed = renamedLine(
        typeof before === 'string' ? before : undefined,
        place.names,
        how,
      );
      if (before !== place.names.file)
        await db.settings
          .put({ key: namesKey(project.id), value: place.names.file })
          .catch(() => {});
      if (renamed) void sayOutline(renamed);
      said.delete(project.id);
      if (script.project.value?.id === project.id) {
        where.value = 'beside';
        failure.value = null;
      }
    }
    if (out.draftsAdded > 0 || out.draftsWritten > 0) await drafts.load();
    if (out.cutsAdded > 0) await cuts.load();
    tell(out, place.names);
    return out;
  }

  function sync(how: SyncHow): Promise<Synced | null> {
    const next = queue.then(() => run(how));
    queue = next.catch(() => null);
    return next;
  }

  async function askForFolder(): Promise<boolean> {
    const project = script.project.value;
    const asked = offer.value;
    if (!project?.fsHandleId) return false;
    const ref = await getHandle(project.fsHandleId).catch(() => undefined);
    if (!ref) return false;
    // A folder granted before that still holds the script needs only the permission again.
    const stored = await storedFolder(project.id);
    if (stored && (await folderHolds(stored, ref).catch(() => false))) {
      if ((await folderPermission(stored, true).catch(() => 'denied')) === 'granted') {
        offer.value = null;
        await db.settings.delete(declinedKey(project.id)).catch(() => {});
        await sync('open');
        return true;
      }
    }
    let folder: FileSystemDirectoryHandle | null;
    try {
      folder = await pickFolder(ref);
    } catch {
      folder = null;
    }
    if (!folder) return false;
    if (!(await folderHolds(folder, ref))) {
      offer.value = {
        file: asked?.file ?? ref.name,
        problem: `That folder doesn’t hold “${ref.name}”. Choose the folder it is in.`,
      };
      return false;
    }
    await storeFolder(project.id, folder);
    await db.settings.delete(declinedKey(project.id)).catch(() => {});
    offer.value = null;
    await sync('open');
    return true;
  }

  async function decline() {
    const project = script.project.value;
    offer.value = null;
    if (project)
      await db.settings.put({ key: declinedKey(project.id), value: true }).catch(() => {});
    void sayOutline(
      'Drafts and cuts stay in this browser. Export them from the Drafts or Cuts list.',
    );
  }

  async function exportZip() {
    const project = script.project.value;
    if (!project || project.sample) return;
    const names = namesFor(project, useEditor().view.state.doc.toString());
    if (!names) return;
    try {
      const zip = await exportDraftsAndCuts(project.id, names, kindOfWork(project));
      useFiles().download(exportName(names), zip, 'application/zip');
      void sayOutline(`Exported “${exportName(names)}”.`);
    } catch {
      void sayOutline('Couldn’t export the drafts and cuts.');
    }
  }

  return {
    where,
    file,
    canAsk,
    failure,
    line,
    offer,
    showOffer() {
      const project = script.project.value;
      if (!project) return;
      offer.value = { file: file.value || project.fileName || '', problem: '' };
    },
    askForFolder,
    decline,
    exportZip,
    sync,
  };
}

/** The app's beside-the-work writer: made on first use, kept for the visit. */
export function useBeside(): BesideSession {
  shared ??= create();
  return shared;
}

let installed = false;

/** Starts writing beside the work at the moments above (pages/index.vue). */
export function installBeside(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const beside = useBeside();
  const script = useScript();
  const drafts = useDrafts();
  effectScope(true).run(() => {
    watch(
      () => script.project.value?.id,
      (id) => {
        if (id) void beside.sync('open');
      },
      { immediate: true },
    );
    // A freeze (or a draft read in from the files) bumps the list: write what isn't written.
    let lastCount = -1;
    watch(drafts.version, () => {
      const count = drafts.rows.value.length;
      const grew = lastCount >= 0 && count > lastCount;
      lastCount = count;
      if (grew) void beside.sync('freeze');
    });
    watch(
      () => script.project.value?.id,
      () => {
        lastCount = -1;
      },
      { flush: 'sync' },
    );
    watch(cutsRecorded, (recorded) => {
      if (recorded && recorded.projectId === script.project.value?.id) void beside.sync('cut');
    });
  });
  script.onRecorded((event) => {
    if (event.kind === 'saved' && event.id === script.project.value?.id) void beside.sync('saved');
  });
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) hiddenAt = Date.now();
    else if (hiddenAt && Date.now() - hiddenAt > AWAY_MS) void beside.sync('open');
  });
}
