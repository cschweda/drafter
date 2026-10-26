// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { useEditor } from '../app/editor/session';
import { runContextFor } from '../app/modules/context';
import { clearAllModuleProblems, moduleProblems } from '../app/modules/problems';
import { MODULES, setEnabled } from '../app/modules/registry';
import type { ScriptModule } from '../app/modules/types';

// The context the host gives a module, made from the real editor. The script session and the
// layout are stood in for (the context reads only the project and where the layout is), and so
// are the panes, which are Nuxt state.
vi.mock('~/composables/usePanes', async () => {
  const { ref } = await import('vue');
  const tabs = ref({ left: 'source', right: 'script' });
  const phoneTab = ref('script');
  return { usePanes: () => ({ tabs, phoneTab }) };
});
vi.mock('../app/storage/script', async () => {
  const { shallowRef } = await import('vue');
  const project = shallowRef(null);
  return { useScript: () => ({ project }) };
});
vi.mock('../app/editor/layout', async () => {
  const { ref } = await import('vue');
  const session = {
    requestedSeq: () => 0,
    shownSeq: ref(0),
    layout: ref(null),
    failed: ref(false),
  };
  return { useLayout: () => session };
});

// jsdom has no layout; CodeMirror's measuring asks a range for its rectangles.
Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect = () => new DOMRect();

const notes = MODULES.find((m) => m.id === 'notes') as ScriptModule;
const TEXT = 'INT. HALL - DAY\n\nRain. [[check]]\n';
const finding = {
  message: 'A note',
  from: 23,
  to: 32,
  severity: 'info' as const,
  fix: { title: 'Remove the note', changes: [{ from: 22, to: 32, insert: '' }] },
};

beforeEach(async () => {
  await setEnabled(notes.id, true);
  useEditor().load(TEXT);
  clearAllModuleProblems();
});

describe("a module's context", () => {
  test('keeps the fixes of a run that has seen only the text as it is', () => {
    const ctx = runContextFor(notes);
    expect(ctx.setProblems([finding])).toBe(true);
    expect(moduleProblems.value[0]?.fix?.changes).toEqual(finding.fix.changes);
  });

  test("reports a run's problems but not its fixes once the text changed under it", () => {
    const ctx = runContextFor(notes);
    // The writer typed while the run waited (for a network answer, say).
    useEditor().view.dispatch({ changes: { from: 0, insert: 'xx' } });
    expect(ctx.setProblems([finding])).toBe(true);
    expect(moduleProblems.value.map((p) => p.message)).toEqual(['A note']);
    // Its fix was written for text that has moved: it is dropped, not applied in the wrong place.
    expect(moduleProblems.value[0]?.fix).toBeUndefined();
  });
});
