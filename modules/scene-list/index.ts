import type { Layout } from '@drafter/layout';
import type { Component } from 'vue';
import { h } from 'vue';
import type { ModuleContext, ScriptModule } from '~/modules/types';

// A sample module: every scene heading, numbered, with its page and its length in eighths of a
// page. It reads the script and the pages through `ModuleContext` and nothing else, so it works
// as an example of a module with a tab.

/** One row of the tab. */
export interface SceneRow {
  /** The locked scene number if the writer gave one, else the scene's place in the list. */
  number: string;
  heading: string;
  /** Where the heading is in the script, for `goto`. */
  offset: number;
  /** Null when the layout doesn't reach this scene yet (it is catching up with the text). */
  page: number | null;
  /** The scene's length in eighths of a page, at least one; null with `page`. */
  eighths: number | null;
}

/** `3/8 page`, `1 page`, `1 1/8 pages`. */
export function lengthLabel(eighths: number): string {
  const whole = Math.floor(eighths / 8);
  const rest = eighths % 8;
  if (whole === 0) return `${rest}/8 page`;
  const fraction = rest === 0 ? '' : ` ${rest}/8`;
  return `${whole}${fraction} ${whole === 1 && rest === 0 ? 'page' : 'pages'}`;
}

/**
 * Where each page starts, counted in lines from the top of the first page, and how many lines
 * hold a page's worth. Page numbers aren't positions (the title page is 0), so pages are found by
 * their number.
 */
function pageStarts(layout: Layout) {
  const starts = new Map<number, number>();
  let total = 0;
  for (const page of layout.pages) {
    starts.set(page.number, total);
    total += page.lines.length;
  }
  const body = layout.pages.find((page) => page.number > 0) ?? layout.pages[0];
  return { starts, pageLines: body?.lines.length ?? 0 };
}

/** The line just past the last one that prints anything. */
function printedEnd(layout: Layout, starts: Map<number, number>): number {
  for (const page of [...layout.pages].reverse()) {
    const last = page.lines.findLastIndex((line) => line.runs.length > 0 || line.right);
    if (last >= 0) return (starts.get(page.number) ?? 0) + last + 1;
  }
  return 0;
}

/** The scenes of a script, with the pages they are on, from the script's parse and its layout. */
export function sceneRows(ctx: ModuleContext, layout: Layout): SceneRow[] {
  const blocks = ctx.doc().blocks;
  const { starts, pageLines } = pageStarts(layout);
  const end = printedEnd(layout, starts);
  const at = (index: number) => {
    const found = layout.index[index];
    const start = found ? starts.get(found.page) : undefined;
    return found && start !== undefined ? { page: found.page, line: start + found.line } : null;
  };

  const scenes = blocks.flatMap((block, index) => (block.kind === 'scene_heading' ? [index] : []));
  return scenes.map((index, n) => {
    const block = blocks[index];
    if (block?.kind !== 'scene_heading') throw new Error('not a scene heading');
    const from = at(index);
    const nextIndex = scenes[n + 1];
    const to = nextIndex === undefined ? { line: end } : at(nextIndex);
    const lines = from && to && pageLines > 0 ? to.line - from.line : null;
    return {
      number: block.sem.number ?? String(n + 1),
      heading: block.sem.text || (block.lines[0]?.raw.trim() ?? ''),
      offset: block.span.from,
      page: from?.page ?? null,
      // A page is eight eighths. A scene shorter than the first of them still counts as one.
      eighths: lines === null ? null : Math.max(1, Math.round((lines * 8) / pageLines)),
    };
  });
}

const row = [
  'flex w-full min-h-8 flex-wrap items-baseline gap-x-2 px-3 py-1.5 text-left text-[13px]',
  'bg-transparent border-0 border-b border-[var(--line)] text-[var(--text)] cursor-pointer',
  'hover:bg-[var(--chrome-2)]',
].join(' ');
const note = 'm-0 px-4 py-6 text-[var(--muted)]';

const SceneListTab: Component = {
  props: { context: { type: Object, required: true } },
  setup(props) {
    const ctx = props.context as ModuleContext;
    // Called while it draws, so the tab is drawn again when the script or its layout changes.
    return () => {
      if (ctx.kind() === 'markdown')
        return h('p', { class: note }, 'Not available for Markdown documents.');
      const layout = ctx.layout();
      if (!layout) return h('p', { class: note }, 'Laying out…');
      const rows = sceneRows(ctx, layout);
      if (rows.length === 0) return h('p', { class: note }, 'No scene headings yet.');
      return h(
        'ul',
        { class: 'm-0 flex list-none flex-col p-0' },
        rows.map((scene) =>
          h('li', { key: scene.offset }, [
            h('button', { type: 'button', class: row, onClick: () => ctx.goto(scene.offset) }, [
              h('span', { class: 'min-w-8 font-bold' }, scene.number),
              h('span', { class: 'min-w-0 flex-1' }, scene.heading),
              scene.page !== null && scene.eighths !== null
                ? h(
                    'span',
                    { class: 'whitespace-nowrap text-[var(--muted)]' },
                    `Page ${scene.page} · ${lengthLabel(scene.eighths)}`,
                  )
                : null,
            ]),
          ]),
        ),
      );
    };
  },
};

const sceneList: ScriptModule = {
  id: 'scene-list',
  name: 'Scene list',
  description: 'Lists every scene heading with its page and its length in eighths of a page.',
  icon: 'i-lucide-list-ordered',
  permissions: {},
  action: {
    label: 'Scenes',
    run: (ctx) => ctx.openTab(),
  },
  tab: { id: 'scenes', label: 'Scenes', component: SceneListTab },
};

export default sceneList;
