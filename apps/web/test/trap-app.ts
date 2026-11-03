// The app as the trap documents' jsdom harnesses open files in it (trap-open.test.ts,
// trap-classic.test.ts): its own modules, database, and Open, with a small stand-in for the editor
// session that open.test.ts uses. Everything after the bytes is the real code. Each test file
// mocks the session, the samples, and snapshots with the factories here:
//
//   vi.mock('../app/snapshots/use-snapshots', async () => (await import('./trap-app')).snapshotsModule());
//   vi.mock('../app/editor/samples', async () => (await import('./trap-app')).samplesModule());
//   vi.mock('../app/editor/session', async () => (await import('./trap-app')).sessionModule());
import type { EditorState as State } from '@codemirror/state';
import { expect, vi } from 'vitest';
import type { Happened } from '../../../fixtures/trap/check';

export const snapshotsModule = () => ({
  useSnapshots: () => ({ before: () => {}, afterImport: () => {} }),
});

export function samplesModule() {
  const screenplay = 'Title: The Call\n\nINT. KITCHEN - NIGHT\n\nA phone rings.\n';
  return {
    SAMPLE_SCREENPLAY: screenplay,
    SAMPLE_STAGE_PLAY: screenplay,
    SAMPLE_TEXT: { screenplay, 'stage-play': screenplay },
  };
}

/** The editor session: a state that holds the text, its parse, and the kind of document. */
export async function sessionModule() {
  const { EditorState } = await import('@codemirror/state');
  const { shallowRef } = await import('vue');
  const { SAMPLE_SCREENPLAY } = await import('../app/editor/samples');
  const { parse } = await import('@drafter/fountain');
  let state = EditorState.create({ doc: SAMPLE_SCREENPLAY });
  const listeners = new Set<(state: State) => void>();
  const doc = shallowRef(parse(state.doc.toString()));
  const view = {
    get state() {
      return state;
    },
    dispatch(spec: Parameters<State['update']>[0]) {
      state = state.update(spec).state;
      doc.value = parse(state.doc.toString());
      for (const l of listeners) l(state);
    },
    focus() {},
  };
  const session = {
    view,
    doc,
    kind: shallowRef<'fountain' | 'markdown'>('fountain'),
    locked: shallowRef(false),
    load(text: string, kind: 'fountain' | 'markdown' = 'fountain') {
      session.kind.value = kind;
      state = EditorState.create({ doc: text });
      doc.value = parse(text);
      for (const l of listeners) l(state);
    },
    setKind(next: 'fountain' | 'markdown') {
      session.kind.value = next;
    },
    setReadOnly() {},
    onState(listener: (state: State) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    goto() {},
  };
  return { useEditor: () => session };
}

/**
 * The app: its modules, database, and editor, once for each entry point. Every trap after the first
 * meets an app that has opened (or refused) the traps before it, as a writer's would; a refusal is
 * seen as the script on show staying the same.
 */
export async function app() {
  vi.resetModules();
  const { db } = await import('../app/storage/db');
  await Promise.all(db.tables.map((table) => table.clear()));
  const files = await import('../app/storage/files');
  const open = await import('../app/storage/open');
  const { exportNotice } = await import('../app/storage/export');
  const { useScript } = await import('../app/storage/script');
  const { useEditor } = await import('../app/editor/session');
  const script = useScript();
  await vi.waitFor(() => expect(script.ready.value).toBe(true));
  const editor = useEditor();
  // Where saving downloads, a file whose title is already here asks whether to replace it; many
  // traps share a title, and each is kept beside the others, as a writer would answer.
  const { watch } = await import('vue');
  watch(open.sameTitleQuestion, (question) => question?.answer('beside'));
  exportNotice.value = '';
  return { db, files, open, exportNotice, script, editor };
}
export type App = Awaited<ReturnType<typeof app>>;

/** The plain word an open says ("Imported “x”."), which is no warning; anything after it is. */
const PLAIN = /^(?:Imported|Reopened|Opened) “[^”]*”(?: as a screenplay)?\.\s*/;

/** What the app did: a new script with its text, and what it said; or the script on show kept. */
export function happened(t: App, was: string | undefined): Happened {
  const error = t.open.openError.value;
  const now = t.script.project.value?.id;
  if (now === was) return { kind: 'refused', message: error };
  const toast = t.exportNotice.value.replace(PLAIN, '');
  return {
    kind: 'opened',
    text: t.editor.view.state.doc.toString(),
    message: [toast, error].filter(Boolean).join(' '),
  };
}

/** A file dropped on the window, as a browser hands it over (no handle, as Firefox and Safari). */
export function dropped(name: string, bytes: Uint8Array): DataTransferItem {
  const file = new File([bytes as BlobPart], name);
  return { kind: 'file', type: '', getAsFile: () => file } as unknown as DataTransferItem;
}
