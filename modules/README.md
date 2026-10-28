# Script modules

A script module is an optional feature that is part of Drafter itself. It is code in this
repository, compiled into the app when the app is built, never something downloaded while Drafter
runs. A module reads the script and hands back edits and problems. It is off until the writer
turns it on in **Settings → Modules**.

This folder holds the modules. Drafter finds every folder here at build time.

## The sample modules

Three small modules ship in this folder. None needs the network, all are off until turned on in
Settings → Modules, and they are in the production build like any module here. Each is written only
against `ModuleContext`, so each is an example to copy from.

| Module | Button | Tab | Command |
| --- | --- | --- | --- |
| [Scene list](scene-list/README.md) | Scenes: shows its tab | Every scene heading, numbered, with its page and its length in eighths of a page; choosing one goes to it | none |
| [Cast](cast/README.md) | Cast: shows its tab | Every character, with their speeches and the scene they first appear in; choosing one goes to their first cue | Cast: copy the list |
| [Notes](notes/README.md) | Notes: lists the script's notes in the Problems pane | none | Notes: remove all notes (one undoable change, after asking) |

In a Markdown document, which has no Fountain and no pages, Scene list and Cast say **Not available
for Markdown documents.** and Notes does nothing (`[[…]]` in Markdown is usually a link).

Each has an `index.test.ts` that runs it against a fake `ModuleContext` built from the sample
screenplay. `fake-context.ts` and `render.ts` beside this file are the test helpers (they are not
modules: only `modules/<id>/index.ts` is). `pnpm test` runs them in the `modules` project.

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
returns a render function (`h` from `vue`). The samples use the second, which a test can draw without
a browser. Tailwind reads this folder, so a component can use its classes; the app's colors are CSS
variables (`var(--text)`, `var(--muted)`, `var(--line)`, `var(--chrome-2)`) that follow the theme.

### The context

Every part is handed a `ModuleContext`:

- Reading: `source()`, `doc()` (the Fountain parse), `layout()` (the pages, or `null`; it is made
  in a worker and can lag `doc()` for a moment after an edit, so a module that pairs
  `layout().index` with `doc().blocks` checks they are the same length), `layoutFailed()` (the
  pages couldn't be made), `template()`,
  `title()`, `kind()` (`'fountain'` or `'markdown'`), and `cursor()`. These read the editor's live
  state, so a component that calls them while it draws is drawn again when the script changes. In a
  Markdown document `doc()` has no blocks and `layout()` is `null`: Markdown has no Fountain and no
  pages.
- Changing: `applyChanges(changes)` makes one undoable change through the editor and returns
  `true`. It throws if a change lies outside the text or two overlap. It returns `false` and does
  nothing in a tab that only shows the script, and (so a run that waited can't change what it never
  saw) once another script has been opened, the module has been turned off, or, for a button's or a
  command's run, the text has been edited since the run began.
- Reporting: `setProblems(items)` replaces this module's items in the Problems pane. They are
  labelled with the module's name and don't count toward the problem total. It returns `false` and
  does nothing once another script has been opened or the module turned off since the run began. An
  item may carry a `fix`, whose changes follow `applyChanges`'s rules; a fix that breaks them
  (a position outside the text, backwards, or overlapping another) is dropped and its item kept,
  and a run's fixes are all dropped once the text has been edited since the run began. Positions
  follow the text through edits; an item is dropped when an edit replaces all of its text, loses
  its fix when an edit touches it, and all of them go when another script opens.
- Asking: `confirm(message, { confirmLabel?, cancelLabel? })` asks a yes-or-no question in Drafter's
  own modal dialog, headed with the module's name. Cancel has focus first and Escape is No. It
  resolves `true` only for a Yes, and `false` if another script has been opened or the module turned
  off, even while the question is open. Ask in response to the writer's action, and say how many
  things it touches.
- Going: `goto(offset)` moves the cursor and shows the Source pane. `openTab()` shows the module's
  own tab and moves focus into it (in the pane that isn't showing Source on a wide screen).
- Remembering: `storage.get`, `set`, and `remove`, this module's own rows in the browser's settings
  table (`module:<id>:<key>`). They never reach the script file. The prefix keeps one module's rows
  apart from another's; it is not a security boundary. Anything you store, a key included, is saved
  as plain text in this browser, and any module you install could read it.
- Telling: `notify(message)` shows a toast and announces it politely.

A `run` that throws or rejects is caught and shown as a toast naming the module. It doesn't break the
editor, and neither does a tab or settings component that throws while it draws: the host shows a
notice in its place. A button's or a command's run is given a context of its own, so the host calls
a module's `commands(ctx)` again for each run of one of its commands.

### The network

A module that sends the script anywhere declares the origins in `permissions.network`. The writer is
asked before turning it on ("Script Doctor sends your script to api.anthropic.com when you ask it
to. Turn it on?"), and the origins they agreed to are kept with the choice: if a later version of the
module declares more, it is off until they agree again. The declaration is the promise, not the mechanism: Drafter's content security
policy allows only its own origin (`connect-src 'self'`), so a module's requests are blocked until
the origins are added to `apps/web/scripts/csp.mjs` and the Privacy page is updated. That is a
decision for the maintainer, recorded when a module that needs it is planned.

### Mistakes

A module whose default export doesn't have this shape is skipped with a console warning naming its
folder; it never breaks the build or the app. Two modules with the same `id` fail the build, naming
both folders.

## Modules from a folder (the desktop app)

The desktop app can also load a module **without rebuilding Drafter**: put its folder in Drafter's
modules folder and restart. **Help → Open Modules Folder** shows the folder:

| System | Folder |
| --- | --- |
| Linux | `~/.config/Drafter/modules` |
| Windows | `%APPDATA%\Drafter\modules` |
| macOS | `~/Library/Application Support/Drafter/modules` |

A module there is listed in **Settings → Modules**, under **From your modules folder**, and is off
until you turn it on. drafter.dev has no modules folder: a browser runs only the code drafter.dev
serves.

[`from-a-folder/tidy/`](from-a-folder/tidy/README.md) is a complete example, with a button, a
command, a tab, and settings. Copy it to start your own.

### The folder

```
modules/              (Drafter's modules folder, not this one)
  tidy/
    module.json       who the module is: read before any of its code runs
    index.js          the module: an ES module, with everything it needs in it (no bare imports)
    …                 anything index.js imports or fetches, from this folder only
```

`module.json`:

```json
{
  "id": "tidy",
  "name": "Tidy",
  "description": "Finds spaces and tabs at the ends of lines, and removes them when you ask.",
  "permissions": { "network": [] }
}
```

- `id`: lowercase letters and digits joined by single hyphens, at most 63 characters, and not the
  id of a module built into Drafter. Two folders with the same id: the second is skipped.
- `name` (at most 80 characters) and `description` (one sentence, at most 400) are what Settings
  shows.
- `permissions.network`: the origins the module may send the script to, each `https://host` or
  `https://host:port` (or `http://localhost`, `http://127.0.0.1` for a program on your own
  computer). At most 16, written exactly as an origin: no path, no `*`. Leave it out, or empty, and
  the module has no network at all.

Every folder module has the puzzle icon: icons are bundled when Drafter is built.

`index.js` default-exports the module. Every part is optional except `id`, which must be the one in
`module.json`:

```js
export default {
  id: 'tidy',
  action: { label: 'Tidy', async run(ctx) { … } },          // the toolbar button
  commands: [{ id: 'trim', title: 'Tidy: remove spaces at line ends', async run(ctx) { … } }],
  tab: { id: 'tidy', label: 'Tidy', mount(root, ctx) { …; return () => {} } },
  settings: { mount(root, ctx) { … } },                       // its section in Settings → Modules
};
```

A tab and a settings section are drawn by the module into `root`, an element in its own frame, with
whatever it was built with (plain DOM, or a framework bundled into `index.js`). The frame has the
app's colors as CSS variables (`var(--text)`, `var(--muted)`, `var(--line)`, `var(--chrome-2)`,
`var(--heading)`, `var(--font-sans)`), and its body has no margin. `mount` may return a function,
called when the tab goes. A settings section grows to fit what it draws, up to 800 pixels.

### The context

The same calls as a built-in module's context, but each is a message to Drafter, so **each returns
a promise**:

- Reading: `await ctx.source()`, `doc()`, `layout()`, `layoutFailed()`, `template()`, `title()`,
  `kind()`, `cursor()`. `doc()` is the parse as plain data: `DocJSON` (version 1, what
  `drafter build --json` writes), with `blocks[i].kind`, `span`, `lines`, and `sem`.
- Changing: `await ctx.applyChanges(changes)`: one undoable change. It rejects with Drafter's
  message where a built-in module's would throw (a change outside the text, two that overlap).
- Reporting, asking, going, telling: `setProblems(items)`, `confirm(message, options)`,
  `goto(offset)`, `openTab()`, `notify(message)`, as for a built-in module.
- Remembering: `ctx.storage.get`, `set`, `remove`. A value must be JSON, at most 1 MB.
- Following: `ctx.onChange(listener)` calls `listener` (at most every 250 ms) when the script, its
  pages, or the open script change, and returns the function that stops it. A tab and settings
  use it to draw again.

The rules are a built-in module's: a button's or a command's run has a context of its own, which
refuses to change text the writer has edited since the run began, and a run that throws is a toast
naming the module. A run that takes longer than 5 minutes is ended. Limits keep a module from
flooding Drafter: a message of at most 4 MB, at most 64 calls waiting at once, at most 10 000
changes or 5 000 problems at a time, a `notify` or `confirm` message of at most 2 000 characters,
and at most 50 commands.

### What a folder module can and can't do

A module from the folder is code nobody at Drafter has checked, so it runs apart: in a frame
sandboxed with scripts only, on an origin of its own (`drafter-module://<id>/`), served from its own
folder and nowhere else. It can't reach Drafter's page, your files, Drafter's storage (your
recovery copies, other modules' settings), or another module. It can't open windows, navigate,
submit forms, or ask for the camera, notifications, or anything like them. It reaches the network
only if it declares the origins and you agreed when you turned it on, and then only those origins;
if a later version declares more, it is off until you agree again. In fact any change to the
module, its code included, turns it off until you turn it on again, and Drafter serves only the
files as they were when it started: change a module, then restart Drafter and turn it on again.
A module's folder must be in the modules folder itself, not a link to a folder elsewhere.

While it is on, it **can** read the open script and change it, and one you agreed to give the
network can send the script to the origins it named. That is what turning it on means: turn one on
only if you trust where it came from.

It reaches the network only through the origins you agreed to (ordinary web requests). Other ways
out — WebRTC among them — are blocked, so a module can't quietly open a side channel. One thing to
know when you install from an archive: Drafter won't follow a symbolic link out of a module's
folder, but it can't tell a *hard* link from a real file, so unpack modules from people you trust.

### Mistakes

A folder that isn't a module (no `module.json`, JSON that doesn't parse, a missing field, no
`index.js`, an `index.js` that is a link out of the folder, an id already taken) is skipped, and
Settings → Modules says which folder and why. A module whose `index.js` won't load, or whose
default export has the wrong shape or the wrong id, is a toast when you turn it on, and Settings
says why it couldn't start. Restart Drafter after fixing it.
