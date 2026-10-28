// Tidy: a sample module for the desktop app's modules folder. Copy this folder (module.json and
// index.js) into the modules folder (Help → Open Modules Folder), restart Drafter, and turn it on
// in Settings → Modules. It runs in a frame of its own; every call on `ctx` is a message to
// Drafter, so each returns a promise.

/** Where the script's lines end in spaces or tabs: `{ from, to, line }`, in the text's offsets. */
function spacesAtEnds(text) {
  const found = [];
  let at = 0;
  let line = 1;
  for (const raw of text.split('\n')) {
    const match = /[ \t]+(?=\r?$)/.exec(raw);
    if (match) found.push({ from: at + match.index, to: at + match.index + match[0].length, line });
    at += raw.length + 1;
    line += 1;
  }
  return found;
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export default {
  id: 'tidy',

  // The toolbar button: lists each line in the Problems pane, with a fix.
  action: {
    label: 'Tidy',
    async run(ctx) {
      const found = spacesAtEnds(await ctx.source());
      await ctx.setProblems(
        found.map((s) => ({
          message: 'This line ends in spaces.',
          from: s.from,
          to: s.to,
          severity: 'info',
          fix: { title: 'Remove them', changes: [{ from: s.from, to: s.to, insert: '' }] },
        })),
      );
      await ctx.notify(
        found.length === 0
          ? 'No line ends in spaces.'
          : `${plural(found.length, 'line ends', 'lines end')} in spaces.`,
      );
    },
  },

  // A command for the palette: one change, which Undo takes back.
  commands: [
    {
      id: 'trim',
      title: 'Tidy: remove spaces at line ends',
      async run(ctx) {
        const found = spacesAtEnds(await ctx.source());
        if (found.length === 0) {
          await ctx.notify('No line ends in spaces.');
          return;
        }
        const ask = (await ctx.storage.get('ask')) !== false;
        if (ask) {
          const yes = await ctx.confirm(
            `Remove the spaces at the ends of ${plural(found.length, 'line', 'lines')}?`,
            { confirmLabel: 'Remove' },
          );
          if (!yes) return;
        }
        const done = await ctx.applyChanges(
          found.map((s) => ({ from: s.from, to: s.to, insert: '' })),
        );
        if (done)
          await ctx.notify(`Removed the spaces from ${plural(found.length, 'line', 'lines')}.`);
      },
    },
  ],

  // A tab beside Source, Script, and Problems: drawn here, in the module's own frame.
  tab: {
    id: 'tidy',
    label: 'Tidy',
    mount(root, ctx) {
      const draw = async () => {
        const found = spacesAtEnds(await ctx.source());
        root.replaceChildren();
        const heading = document.createElement('p');
        heading.style.cssText = 'margin: 0; padding: 12px 16px; color: var(--muted)';
        heading.textContent =
          found.length === 0
            ? 'No line ends in spaces.'
            : `${plural(found.length, 'line ends', 'lines end')} in spaces.`;
        root.append(heading);
        const list = document.createElement('ul');
        list.style.cssText = 'margin: 0; padding: 0; list-style: none';
        for (const s of found) {
          const item = document.createElement('li');
          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = `Line ${s.line}`;
          button.style.cssText =
            'display: block; width: 100%; padding: 6px 16px; border: 0; border-bottom: 1px solid var(--line); background: none; text-align: left; cursor: pointer';
          button.addEventListener('click', () => ctx.goto(s.from));
          item.append(button);
          list.append(item);
        }
        root.append(list);
      };
      const stop = ctx.onChange(draw);
      void draw();
      return stop;
    },
  },

  // Its section in Settings → Modules: kept in the module's own storage.
  settings: {
    async mount(root, ctx) {
      const label = document.createElement('label');
      label.style.cssText = 'display: flex; gap: 8px; align-items: center; padding: 4px 0';
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = (await ctx.storage.get('ask')) !== false;
      box.addEventListener('change', () => ctx.storage.set('ask', box.checked));
      label.append(box, 'Ask before removing spaces');
      root.append(label);
    },
  },
};
