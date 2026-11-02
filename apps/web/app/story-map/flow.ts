import {
  type Doc,
  setMeta,
  setTitleField,
  type TextChange,
  type TitleField,
} from '@drafter/fountain';
import { type MapOptions, storyMapMeta } from '@drafter/story-map';
import { useDrafts } from '../drafts/use-drafts';
import { applyTextChanges } from '../editor/apply-changes';
import { useEditor } from '../editor/session';
import { ratesOf } from '../stats/timing';
import { exportStoryMap } from '../storage/export';
import { renderExport } from '../storage/export-client';
import { useGuard } from '../storage/guard';
import { hashText } from '../storage/hash';
import { useScript } from '../storage/script';
import type { StoryMapPicks } from '../workers/export-compute';
import { STORY_MAP_DEFAULTS, type StoryMapProjectOptions, setStoryMapOptions } from './options';
import { markSpeech } from './quote-marks';

// Make story map (story-map design §7, Call 19): the dialog's choices about the text go into the
// text (the logline as `Logline:`, `[[Quote]]` and `[[No quote]]` marks), the page-wide ones into
// the metadata block (`storyMap`: the planned length and the edited hooks), as one undo, after
// the picker; then the page is made in the export worker; then the page's own choices are kept on
// the project. A read-only tab writes and keeps nothing, and still makes the page.

/** What the dialog asks to be written. */
export interface StoryMapChanges {
  /** The logline as it should be; null or empty: none. Unchanged writes nothing. */
  logline: string | null;
  /** 1–999, or null for none. */
  plannedPages: number | null;
  /** By character key: an edited hook (empty: none), or null to go back to the one found. */
  hooks: Record<string, string | null>;
  /** The speeches to mark, by cue block: `quote`, `no-quote`, or null to take the mark off. */
  quotes: Array<{ cue: number; use: 'quote' | 'no-quote' | null }>;
}

/** What the toast adds when a read-only tab made the page. */
export const NOT_KEPT =
  ' Your choices weren’t kept: this script is open for editing in another tab.';

/** A title page field's text, its lines joined by spaces; '' with none. */
export function titleFieldText(doc: Doc, key: string): string {
  const field: TitleField | undefined = doc.titlePage?.fields.find(
    (f) => f.key.trim().toLowerCase() === key,
  );
  return field ? field.value.join(' ').replace(/\s+/g, ' ').trim() : '';
}

/** The contact the dialog offers: the title page's `Contact` line with an `@`, else all of it. */
export function titleContact(doc: Doc): string {
  const field = doc.titlePage?.fields.find((f) => f.key.trim().toLowerCase() === 'contact');
  if (!field) return '';
  return (field.value.find((line) => line.includes('@')) ?? field.value.join(', ')).trim();
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The `storyMap` part of the metadata block with the dialog's planned length and hooks merged in. */
function mergedMeta(doc: Doc, changes: StoryMapChanges): Record<string, unknown> | null {
  const kept = isRecord(doc.meta?.storyMap) ? doc.meta.storyMap : {};
  const next: Record<string, unknown> = { ...kept };
  const hooks: Record<string, unknown> = isRecord(kept.hooks) ? { ...kept.hooks } : {};
  for (const [key, hook] of Object.entries(changes.hooks)) {
    if (hook === null) delete hooks[key];
    else hooks[key] = hook.trim();
  }
  if (Object.keys(hooks).length > 0) next.hooks = hooks;
  else delete next.hooks;
  if (changes.plannedPages !== null) next.plannedPages = changes.plannedPages;
  else delete next.plannedPages;
  return Object.keys(next).length > 0 ? next : null;
}

/**
 * Every text change the dialog's choices make, in the text as it is now: the logline, the quote
 * marks, and the metadata block (left as it is when its `storyMap` is unchanged).
 */
export function storyMapTextChanges(doc: Doc, changes: StoryMapChanges): TextChange[] {
  const out: TextChange[] = [];
  if ((changes.logline ?? '').trim() !== titleFieldText(doc, 'logline')) {
    out.push(...setTitleField(doc, 'Logline', changes.logline));
  }
  for (const { cue, use } of changes.quotes) out.push(...markSpeech(doc, cue, use));
  const before = isRecord(doc.meta?.storyMap) ? doc.meta.storyMap : null;
  const after = mergedMeta(doc, changes);
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    const { storyMap: _, ...rest } = doc.meta ?? {};
    out.push(...setMeta(doc, after ? { ...rest, storyMap: after } : rest));
  }
  return out;
}

/**
 * Makes the open script's story map from the dialog's choices: `changes` for the text, `page` for
 * the page (kept on the project once the file is saved). `'cancelled'`: the picker was cancelled,
 * or the export failed (the toast says so).
 */
export async function makeStoryMap(
  changes: StoryMapChanges,
  page: StoryMapProjectOptions,
): Promise<'saved' | 'cancelled'> {
  const editor = useEditor();
  const script = useScript();
  const readOnly = () => useGuard().readOnly.value || editor.view.state.readOnly;
  const result = await exportStoryMap({
    key: JSON.stringify({ changes, page }),
    write() {
      if (readOnly()) return NOT_KEPT;
      const edits = storyMapTextChanges(editor.doc.value, changes);
      if (edits.length > 0) applyTextChanges(editor.view, edits);
      return '';
    },
    async options(source, title): Promise<MapOptions> {
      const doc = editor.doc.value;
      const project = script.project.value;
      const drafts = useDrafts();
      const newest = drafts.rows.value[0];
      // The dialog's hooks over those the metadata block keeps, as the text would have them.
      const hooks: Record<string, string> = { ...storyMapMeta(doc.meta).hooks };
      for (const [key, hook] of Object.entries(changes.hooks)) {
        if (hook === null) delete hooks[key];
        else hooks[key] = hook.trim();
      }
      const logline = (changes.logline ?? '').trim();
      // Null: the title page's; a contact emptied in the dialog stays empty.
      const contact = page.contact === null ? titleContact(doc) : page.contact.trim();
      return {
        status: page.status,
        plannedPages: changes.plannedPages,
        logline: logline === '' ? null : logline,
        greeting: page.greeting,
        explain: page.explain,
        include: page.include,
        contact: contact === '' ? null : contact,
        hooks,
        rates: ratesOf(project),
        draft: { number: drafts.current.value, id: newest?.id ?? (await hashText(source)) },
        updated: (project?.savedAt as number | undefined) ?? (project?.updatedAt as number) ?? null,
        title,
      };
    },
  });
  if (result === 'saved') await setStoryMapOptions(page).catch(() => {});
  return result;
}

/**
 * The dialog's quick look at the open script (`StoryMapPicks`): the lines the page would use and
 * the leads' hooks, worked out in the export worker, never on the typing path.
 */
export async function storyMapPicks(): Promise<StoryMapPicks> {
  const editor = useEditor();
  const project = useScript().project.value;
  const { data } = await renderExport({
    kind: 'story-map-picks',
    source: editor.view.state.doc.toString(),
    template: editor.template.value,
    options: {
      ...STORY_MAP_DEFAULTS,
      plannedPages: null,
      logline: null,
      contact: null,
      hooks: {},
      rates: ratesOf(project),
      draft: { number: 1, id: '0'.repeat(64) },
      updated: null,
      title: '',
    },
  });
  return JSON.parse(String(data)) as StoryMapPicks;
}
