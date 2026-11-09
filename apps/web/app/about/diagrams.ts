// The How it works diagrams on the What is Drafter page: each one's Mermaid source is
// docs/diagrams/<id>.mmd (shown on GitHub in docs/HOW-IT-WORKS.md), drawn to SVG by
// `pnpm diagrams` (scripts/diagrams.mjs) as apps/web/app/assets/diagrams/<id>-dark.svg and
// <id>-light.svg. The page shows them as images, with `description` as each one's text for a
// screen reader, which says everything the picture does. test/diagrams.test.ts keeps the four
// places in step.

export interface HowItWorksDiagram {
  id: string;
  title: string;
  /** Everything the diagram shows, in words: the image's alternative text. */
  description: string;
}

export const HOW_IT_WORKS: readonly HowItWorksDiagram[] = [
  {
    id: 'script-flow',
    title: 'How a script flows',
    description:
      'How a script flows. You type plain Fountain in the editor. The parser reads the whole script. From that come the editor’s views (Problems, Outline, and Stats), a Final Draft .fdx file, and the layout, which puts the script on pages. From the pages come the Script pane, as you type, and the exports: PDF, plain text, HTML, and EPUB.',
  },
  {
    id: 'saving',
    title: 'How saving works',
    description:
      'How saving works. The text in the editor goes three ways: autosave, as you type; Save, when you choose; and snapshots, the earlier versions. Save goes back to your file in Chrome and Edge, downloads a copy in other browsers, and in the desktop app always saves in place.',
  },
  {
    id: 'safe-open',
    title: 'How a file is opened safely',
    description:
      'How a file is opened safely. First its size is checked, before it is read. Then Drafter works out what it is, from its first bytes and its name. Then a reader that takes only text reads it, as strict UTF-8. A file that passes opens as text, and nothing in it runs. A file that is too big, isn’t a script, or fails a check is refused, with a plain message.',
  },
  {
    id: 'release',
    title: 'How a release is made',
    description:
      'How a release is made. On the maintainer’s computer: pnpm check for formatting and lint, then the build of the packages and the site, then the tests: unit, browser, and trap tests. Then on GitHub and Netlify: a tag is pushed, GitHub Actions builds and tests the desktop apps, the GitHub Release is published only if every job passed, and then main is pushed and Netlify deploys drafter.dev.',
  },
];
