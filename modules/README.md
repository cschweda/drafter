# Script modules

A script module is an optional feature that is part of Drafter itself. It is code in this
repository, compiled into the app when the app is built, never something downloaded while Drafter
runs. A module reads the script and hands back edits and problems. It is off until the writer
turns it on in **Settings → Modules**.

This folder holds the modules. Drafter finds every folder here at build time.

## Installing a module in your own copy

1. Put the module's folder in this one: `modules/<id>/`, with an `index.ts` inside.
2. Restart: `pnpm --filter @drafter/web dev`, or `build` and then `preview`.
3. Open **Settings → Modules** and turn it on.

The module stays because it is a file in your copy of the repository. On drafter.dev the modules
are the ones that were in the repository when the site was built. A visitor can't add one, because
a module is code, and the web version runs only the code drafter.dev serves.

Read a module's code before you install it. A module can read your whole script and change it.

## Writing one

`modules/<id>/index.ts` default-exports a `ScriptModule`. The type is in
[`apps/web/app/modules/types.ts`](../apps/web/app/modules/types.ts).

```ts
import type { ScriptModule } from '~/modules/types';

const module: ScriptModule = {
  id: 'scene-count',            // lowercase letters, digits, single hyphens
  name: 'Scene count',
  description: 'Lists every scene heading as a suggestion in the Problems pane.',
  icon: 'i-lucide-list-ordered', // an i-lucide-* name; the build bundles it
  permissions: {},              // or { network: ['https://api.example.com'] }
  action: {
    label: 'Count scenes',      // the toolbar button's name
    run(ctx) {
      const headings = ctx.doc().blocks.filter((block) => block.kind === 'scene_heading');
      ctx.setProblems(
        headings.map((block, i) => ({
          message: `Scene ${i + 1}`,
          from: block.span.from,
          to: block.span.to,
          severity: 'info',
        })),
      );
    },
  },
};

export default module;
```

### The parts

All are optional except the first five fields.

| Field | What it does |
| --- | --- |
| `id`, `name`, `description`, `icon`, `permissions` | Who it is, shown in Settings → Modules. `permissions.network` lists the origins it may send the script to. |
| `action` | A round button in the toolbar, after Focus, while the module is on. |
| `tab` | A tab beside Source, Script, and Problems, in either pane. `component` is a Vue component, given the module's context as its `context` prop. |
| `commands(ctx)` | Commands for the palette, listed under the module's name. Their `group` is replaced with the name, and their `keys` are not bound. |
| `settings` | A Vue component shown in the module's section of Settings → Modules while it is on (where a key would be entered). It is given `context` as a prop. |

A Vue component can be a `.vue` file in the module's folder, or a plain object with a `setup()` that
returns a render function (`h` from `vue`).

### The context

Every part is handed a `ModuleContext`:

- Reading: `source()`, `doc()` (the Fountain parse), `layout()` (the pages, or `null`), `template()`,
  `title()`, `kind()` (`'fountain'` or `'markdown'`), and `cursor()`. These read the editor's live
  state, so a component that calls them while it draws is drawn again when the script changes. In a
  Markdown document `doc()` has no blocks and `layout()` is `null`: Markdown has no Fountain and no
  pages.
- Changing: `applyChanges(changes)` makes one undoable change through the editor. It throws if a
  change lies outside the text or two overlap, and does nothing in a tab that only shows the script.
- Reporting: `setProblems(items)` replaces this module's items in the Problems pane. They are
  labelled with the module's name and don't count toward the problem total. An item may carry a
  `fix`. Positions follow the text through edits; an item is dropped when an edit replaces all of its
  text, loses its fix when an edit touches it, and all of them go when another script opens.
- Going: `goto(offset)`.
- Remembering: `storage.get`, `set`, and `remove`, this module's own rows in the browser's settings
  table (`module:<id>:<key>`). They never reach the script file.
- Telling: `notify(message)` shows a toast and announces it politely.

A `run` that throws or rejects is caught and shown as a toast naming the module. It doesn't break the
editor.

### The network

A module that sends the script anywhere declares the origins in `permissions.network`. The writer is
asked before turning it on ("Script Doctor sends your script to api.anthropic.com when you ask it
to. Turn it on?"). The declaration is the promise, not the mechanism: Drafter's content security
policy allows only its own origin (`connect-src 'self'`), so a module's requests are blocked until
the origins are added to `apps/web/scripts/csp.mjs` and the Privacy page is updated. That is a
decision for the maintainer, recorded when a module that needs it is planned.

### Mistakes

A module whose default export doesn't have this shape is skipped with a console warning naming its
folder; it never breaks the build or the app. Two modules with the same `id` fail the build, naming
both folders.
