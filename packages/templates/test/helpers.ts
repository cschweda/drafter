// A complete, valid template in the raw JSON shape, for tests to vary.
export function rawTemplate(): Record<string, unknown> {
  return {
    id: 'test',
    name: 'Test',
    page: {
      paper: 'letter',
      width: 85,
      height: 66,
      margin: { top: 6, bottom: 6, left: 15, right: 10 },
      font: { family: 'Courier Prime', monospace: true, pt: 12 },
      numbering: { position: 'top-right', line: 3, firstNumbered: 2, format: '{n}.' },
    },
    roles: {
      scene_heading: { indent: 0, width: 60, spaceBefore: 2 },
      action: { indent: 0, width: 60, spaceBefore: 1 },
      character: { indent: 22, width: 33, spaceBefore: 1 },
      parenthetical: { indent: 16, width: 25, spaceBefore: 0 },
      dialogue: { indent: 10, width: 35, spaceBefore: 0 },
      transition: { indent: 40, width: 20, spaceBefore: 1 },
      centered: { indent: 0, width: 60, spaceBefore: 1 },
      lyric: { indent: 10, width: 35, spaceBefore: 1 },
    },
    roleMap: [
      { kind: ['section', 'synopsis', 'note', 'boneyard'], role: 'omit' },
      { kind: '*', role: '@kind' },
    ],
    dialogueSplit: {
      more: '(MORE)',
      contd: "(CONT'D)",
      moreIndent: 22,
      minLinesBefore: 2,
      minLinesAfter: 2,
      contdAfterAction: true,
    },
    dual: { gap: 4, width: 28, indent: { character: 8, parenthetical: 4, dialogue: 0 } },
    sceneNumbers: { enabled: false, left: -10, right: 61 },
    titlePage: { layout: 'centered-feature' },
  };
}

/** A deep copy with `edit` applied, so each test changes only what it names. */
// biome-ignore lint/suspicious/noExplicitAny: tests reach into arbitrary template paths, including invalid ones.
export function variant(edit: (t: Record<string, any>) => void): Record<string, unknown> {
  const t = structuredClone(rawTemplate());
  edit(t);
  return t;
}
