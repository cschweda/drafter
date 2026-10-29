# Scene list

> The **Outline** and **Cards** tabs now list every scene with its page and length; this module is the small version.

Every scene heading in the script, numbered, with its page and its length in eighths of a page.
Choosing a scene goes to its heading in the Source pane.

- **Button:** "Scenes" shows the module's tab and moves focus into it (`ctx.openTab()`).
- **Tab:** "Scenes". A row is the scene's number (the locked number if the script has one), its
  heading, and `Page 2 · 3/8 page`. A scene is at least `1/8 page`.
- **Commands:** none.
- **Needs:** nothing from the network; it reads `doc()` and `layout()`.

## How a length is worked out

`layout()` says which line of which page each block starts on. A scene runs from its heading to the
next scene's heading, or to the last printed line for the final scene. Pages are counted in lines
(a US screenplay page holds 54), and a page is eight eighths, so one eighth is a page's lines
divided by eight, and a scene's length is its lines divided by that, rounded, and never less than
one. `1 1/8 pages` is a page and an eighth.

## States

- Before the first layout (`layout()` is `null`) the tab says **Laying out…**.
- A script with no scene headings says **No scene headings yet.**
- A Markdown document has no scenes or pages: **Not available for Markdown documents.**
- The layout is made in a worker and can lag an edit. While it has a different number of blocks than
  the script (a scene was just added or removed) the tab says **Laying out…**, rather than put a scene
  on another scene's page. When another script is opened the host doesn't offer the old script's
  layout, so the same wait applies.
- If the layout worker fails (`layoutFailed()`) and no layout has come, the tab says the pages
  couldn't be made.

## Files

- `index.ts`: the module (`default`), and `sceneRows` and `lengthLabel` for the tests.
- `index.test.ts`: runs it against `samples/screenplay.fountain` through a fake `ModuleContext`
  (`../fake-context.ts`).
