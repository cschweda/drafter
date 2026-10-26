import { type Diagnostic, forceLinting, forEachDiagnostic } from '@codemirror/lint';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { fountainLint, parsedDoc, relint, toCodeMirror } from '@drafter/cm-fountain';
import type { LintDiagnostic } from '@drafter/lint';
import { builtins, type Template } from '@drafter/templates';
import { afterEach, describe, expect, it, vi } from 'vitest';

const template = builtins['us-screenplay'] as Template;

describe('toCodeMirror', () => {
  it('maps diagnostics and turns a fix into an action that applies it', () => {
    const diagnostics: LintDiagnostic[] = [
      {
        ruleId: 'manual-contd',
        severity: 'info',
        span: { from: 2, to: 5 },
        message: 'A message.',
        fix: { title: 'Remove it', changes: [{ from: 1, to: 2, insert: 'Z' }] },
      },
      { ruleId: 'unclosed-region', severity: 'error', span: { from: 0, to: 1 }, message: 'M2' },
      { ruleId: 'x', severity: 'warning', span: { from: 4, to: 4 }, message: 'M3' },
    ];
    const found = toCodeMirror(diagnostics);
    expect(found).toEqual([
      {
        from: 2,
        to: 5,
        severity: 'info',
        message: 'A message.',
        source: 'manual-contd',
        actions: [{ name: 'Remove it', apply: expect.any(Function) }],
      },
      { from: 0, to: 1, severity: 'error', message: 'M2', source: 'unclosed-region' },
      { from: 4, to: 4, severity: 'warning', message: 'M3', source: 'x' },
    ]);
    // A diagnostic with no fix has no actions at all, not an empty list.
    expect(found[1]).not.toHaveProperty('actions');
    // The action dispatches the fix's changes.
    const view = new EditorView({ state: EditorState.create({ doc: 'abcdef' }) });
    found[0]?.actions?.[0]?.apply(view, 2, 5);
    expect(view.state.doc.toString()).toBe('aZcdef');
    view.destroy();
  });

  it('applies nothing while the editor is read-only', () => {
    const [found] = toCodeMirror([
      {
        ruleId: 'x',
        severity: 'info',
        span: { from: 2, to: 5 },
        message: 'M',
        fix: { title: 'Fix', changes: [{ from: 1, to: 2, insert: 'Z' }] },
      },
    ]);
    const view = new EditorView({
      state: EditorState.create({ doc: 'abcdef', extensions: EditorState.readOnly.of(true) }),
    });
    found?.actions?.[0]?.apply(view, 2, 5);
    expect(view.state.doc.toString()).toBe('abcdef');
    view.destroy();
  });

  it('applies all of a fix together, in the offsets of the linted text', () => {
    const [found] = toCodeMirror([
      {
        ruleId: 'x',
        severity: 'info',
        span: { from: 0, to: 6 },
        message: 'm',
        fix: {
          title: 'Two changes',
          changes: [
            { from: 0, to: 1, insert: 'AA' },
            { from: 4, to: 6, insert: '' },
          ],
        },
      },
    ]);
    const view = new EditorView({ state: EditorState.create({ doc: 'abcdef' }) });
    found?.actions?.[0]?.apply(view, 0, 6);
    expect(view.state.doc.toString()).toBe('AAbcd');
    view.destroy();
  });
});

describe('fountainLint', () => {
  const views: EditorView[] = [];
  afterEach(() => {
    for (const view of views.splice(0)) {
      view.dom.parentElement?.remove();
      view.destroy();
    }
  });

  const script = "MARGARET\nHi.\n\nShe sits.\n\nMARGARET (CONT'D)\nStill here.\n";

  function mount(
    doc: string,
    config: Parameters<typeof fountainLint>[0] = { template: () => template },
  ) {
    const parent = document.createElement('div');
    document.body.append(parent);
    const view = new EditorView({
      state: EditorState.create({ doc, extensions: [fountainLint(config)] }),
      parent,
    });
    views.push(view);
    return view;
  }

  const diagnosticsOf = (view: EditorView) => {
    const found: Diagnostic[] = [];
    forEachDiagnostic(view.state, (d) => found.push(d));
    return found;
  };

  /** Where CodeMirror has each diagnostic now: its own `from` is where it was linted. */
  const positionsOf = (view: EditorView) => {
    const found: number[] = [];
    forEachDiagnostic(view.state, (_d, from) => found.push(from));
    return found;
  };

  /** Lints now, instead of after the 300 ms delay, and waits for the diagnostics to arrive. */
  async function linted(view: EditorView, wanted: (found: Diagnostic[]) => boolean) {
    forceLinting(view);
    await vi.waitFor(() => expect(wanted(diagnosticsOf(view))).toBe(true), { timeout: 3000 });
    return diagnosticsOf(view);
  }

  it('lints the parse in the state, and brings the field with it', async () => {
    const view = mount(script);
    expect(view.state.field(parsedDoc, false)).toBeDefined();
    const [found] = await linted(view, (d) => d.length > 0);
    expect(found).toMatchObject({
      source: 'manual-contd',
      severity: 'info',
      from: script.indexOf("MARGARET (CONT'D)"),
    });
    expect(found?.actions?.map((a) => a.name)).toEqual(["Remove (CONT'D)"]);
  });

  it('applies a fix to the text that was linted', async () => {
    const view = mount(script);
    const [found] = await linted(view, (d) => d.length > 0);
    found?.actions?.[0]?.apply(view, found.from, found.to);
    expect(view.state.doc.toString()).toBe('MARGARET\nHi.\n\nShe sits.\n\nMARGARET\nStill here.\n');
  });

  it('refuses a stale fix and re-lints', async () => {
    const view = mount(script);
    const [stale] = await linted(view, (d) => d.length > 0);
    // The writer types above the problem before the fix is chosen. CodeMirror moves the
    // diagnostic, but the fix's offsets are still those of the old text.
    view.dispatch({ changes: { from: 0, insert: 'A line.\n\n' } });
    const edited = view.state.doc.toString();
    const moved = diagnosticsOf(view)[0] as Diagnostic;
    expect(positionsOf(view)).toEqual([(stale as Diagnostic).from + 9]);
    moved.actions?.[0]?.apply(view, moved.from + 9, moved.to + 9);
    expect(view.state.doc.toString()).toBe(edited);
    // It asked for a new lint, which brings fresh diagnostics whose fixes apply.
    const [fresh] = await linted(view, (d) => d[0] !== moved);
    expect(view.state.doc.toString()).toBe(edited);
    fresh?.actions?.[0]?.apply(view, fresh.from, fresh.to);
    expect(view.state.doc.toString()).toBe(edited.replace(" (CONT'D)", ''));
  });

  it('refuses a stale fix after the text changes and changes back', async () => {
    const view = mount(script);
    await linted(view, (d) => d.length > 0);
    view.dispatch({ changes: { from: 0, insert: 'x' } });
    view.dispatch({ changes: { from: 0, to: 1 } });
    // The text is as it was, but it is another parse, and the fix is not trusted.
    expect(view.state.doc.toString()).toBe(script);
    const current = diagnosticsOf(view)[0] as Diagnostic;
    current.actions?.[0]?.apply(view, current.from, current.to);
    expect(view.state.doc.toString()).toBe(script);
  });

  it('reads the template and options each time it lints', async () => {
    let disable: string[] = [];
    const view = mount(script, { template: () => template, options: () => ({ disable }) });
    await linted(view, (d) => d.length > 0);
    disable = ['manual-contd'];
    // A lint is due after a change to the text.
    view.dispatch({ changes: { from: view.state.doc.length, insert: '\n' } });
    forceLinting(view);
    await vi.waitFor(() => expect(diagnosticsOf(view)).toEqual([]), { timeout: 3000 });
  });

  it('re-lints after the options change, with no edit', async () => {
    let strict = false;
    const heading = 'INT. HALL - DAY\nShe waits.\n';
    const view = mount(heading, { template: () => template, options: () => ({ strict }) });
    await linted(view, (d) => d.length > 0);
    expect(diagnosticsOf(view).map((d) => d.severity)).toEqual(['info']);
    // Only what the options return changes: the text is as it was, and no lint is pending.
    strict = true;
    relint(view);
    await vi.waitFor(
      () => expect(diagnosticsOf(view).map((d) => d.severity)).toEqual(['warning']),
      { timeout: 3000 },
    );
    expect(view.state.doc.toString()).toBe(heading);
  });

  it("applies a fix with the editor's own line break", async () => {
    const heading = 'INT. HALL - DAY\r\nShe waits.\r\n';
    const parent = document.createElement('div');
    document.body.append(parent);
    const view = new EditorView({
      state: EditorState.create({
        doc: heading,
        extensions: [
          EditorState.lineSeparator.of('\r\n'),
          fountainLint({ template: () => template }),
        ],
      }),
      parent,
    });
    views.push(view);
    const [found] = await linted(view, (d) => d.length > 0);
    expect(found?.actions?.[0]?.name).toBe('Insert a blank line');
    expect(view.state.doc.lines).toBe(3);
    found?.actions?.[0]?.apply(view, found.from, found.to);
    // The document gains a real line, not a line with a bare \n in it.
    expect(view.state.doc.lines).toBe(4);
    expect(view.state.sliceDoc(0)).toBe('INT. HALL - DAY\r\n\r\nShe waits.\r\n');
  });

  it('shows a lint gutter', () => {
    const view = mount(script);
    expect(view.dom.querySelector('.cm-gutter-lint')).not.toBeNull();
  });
});
