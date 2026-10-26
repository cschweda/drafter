import type { Component } from 'vue';
import { h } from 'vue';
import type { ModuleContext, ScriptModule } from '~/modules/types';

// A sample module: every character, with the number of speeches and the scene of the first
// appearance, and a command that copies the list. It reads the script through `ModuleContext` and
// nothing else, so it works as an example of a module with a tab and a command.

/** One character, in the order of first appearance. */
export interface CastRow {
  name: string;
  speeches: number;
  /** Where the first cue is, for `goto`. */
  offset: number;
  /** The scene of the first cue; null when it comes before any scene heading. */
  scene: { number: string; heading: string } | null;
}

/** The characters of the script. A name counts once however it is capitalized or extended. */
export function castRows(ctx: ModuleContext): CastRow[] {
  const rows = new Map<string, CastRow>();
  let scene: CastRow['scene'] = null;
  let scenes = 0;
  for (const block of ctx.doc().blocks) {
    if (block.kind === 'scene_heading') {
      scenes += 1;
      scene = { number: block.sem.number ?? String(scenes), heading: block.sem.text };
    } else if (block.kind === 'character') {
      const key = block.sem.name.toUpperCase();
      const known = rows.get(key);
      if (known) known.speeches += 1;
      else rows.set(key, { name: block.sem.name, speeches: 1, offset: block.span.from, scene });
    }
  }
  return [...rows.values()];
}

const speeches = (n: number) => `${n} ${n === 1 ? 'speech' : 'speeches'}`;

/** The list as plain text, one character to a line. */
export function castText(rows: readonly CastRow[]): string {
  return rows
    .map((row) => {
      const where = row.scene
        ? `first in scene ${row.scene.number} (${row.scene.heading})`
        : 'first before the first scene';
      return `${row.name}: ${speeches(row.speeches)}, ${where}\n`;
    })
    .join('');
}

const row = [
  'flex w-full min-h-8 flex-wrap items-baseline gap-x-2 px-3 py-1.5 text-left text-[13px]',
  'bg-transparent border-0 border-b border-[var(--line)] text-[var(--text)] cursor-pointer',
  'hover:bg-[var(--chrome-2)]',
].join(' ');
const note = 'm-0 px-4 py-6 text-[var(--muted)]';

const CastTab: Component = {
  props: { context: { type: Object, required: true } },
  setup(props) {
    const ctx = props.context as ModuleContext;
    // Called while it draws, so the tab is drawn again when the script changes.
    return () => {
      if (ctx.kind() === 'markdown') {
        return h('p', { class: note }, 'Not available for Markdown documents.');
      }
      const rows = castRows(ctx);
      if (rows.length === 0) return h('p', { class: note }, 'No characters yet.');
      return h(
        'ul',
        { class: 'm-0 flex list-none flex-col p-0' },
        rows.map((character) =>
          h('li', { key: character.name }, [
            h('button', { type: 'button', class: row, onClick: () => ctx.goto(character.offset) }, [
              h('span', { class: 'min-w-0 font-bold' }, character.name),
              h(
                'span',
                { class: 'text-[var(--muted)]' },
                `${speeches(character.speeches)} · ${
                  character.scene
                    ? `first in scene ${character.scene.number}, ${character.scene.heading}`
                    : 'first before the first scene'
                }`,
              ),
            ]),
          ]),
        ),
      );
    };
  },
};

const cast: ScriptModule = {
  id: 'cast',
  name: 'Cast',
  description:
    'Lists every character with the number of speeches and the scene they first appear in.',
  icon: 'i-lucide-users',
  permissions: {},
  action: {
    label: 'Cast',
    run: (ctx) => ctx.openTab(),
  },
  tab: { id: 'cast', label: 'Cast', component: CastTab },
  commands: (ctx) => [
    {
      id: 'copy',
      title: 'Cast: copy the list',
      group: 'Edit',
      enabled: () => ctx.kind() === 'fountain',
      async run() {
        if (ctx.kind() === 'markdown') {
          ctx.notify('Not available for Markdown documents.');
          return;
        }
        const rows = castRows(ctx);
        if (rows.length === 0) {
          ctx.notify('There are no characters to copy yet.');
          return;
        }
        try {
          await navigator.clipboard.writeText(castText(rows));
          ctx.notify(
            `Copied the list of ${rows.length} ${rows.length === 1 ? 'character' : 'characters'}.`,
          );
        } catch {
          ctx.notify('Couldn’t copy the list. Your browser didn’t allow it.');
        }
      },
    },
  ],
};

export default cast;
