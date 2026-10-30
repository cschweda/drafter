import { describe, expect, test } from 'vitest';
import {
  type ComparedTexts,
  changeStops,
  diffModel,
  goToScene,
  groupStops,
  groupTitle,
  openGroups,
  ROW_BUDGET,
  shownGroups,
  shownView,
  stepFromGroup,
  summaryText,
} from '../app/compare/rows';

// Compare's Changes view, as a model (version-history design §5.2): the rows of a diff cut into
// groups at scene headings (a Markdown document's headings of levels 1 to 3), its summary, the
// changes' names, and where Go to scene goes in the script now.

const HALL = 'INT. HALL - DAY\n\nMarra waits by the door, turning a key over and over.\n';
const HALL_2 = 'INT. HALL - DAY\n\nMarra paces by the door, turning a key over and over.\n';
const ROOF = 'EXT. ROOF - NIGHT\n\nWind drags the washing lines sideways over the tiles.\n';
const YARD =
  'EXT. COAL YARD - DAWN\n\nTwo carts wait under a tarpaulin, their wheels chocked with bricks.\n';
const CELLAR =
  'INT. CELLAR - NIGHT\n\nA lamp swings from a hook, throwing the shelves of jars into a slow tilt.\n';
const script = (...scenes: string[]) => `Title: The Key\n\n${scenes.join('\n')}`;

const compared = (older: string, newer: string, nowAt: number | null = null): ComparedTexts => ({
  older: { text: older },
  newer: { text: newer, at: nowAt },
  kind: 'fountain',
  model: diffModel(older, newer, 'fountain'),
});

/** The offset in `text` of the line `line`. */
const at = (text: string, line: string) => text.indexOf(line);

describe('the Changes view model', () => {
  test('groups a screenplay by scene', () => {
    const model = diffModel(script(HALL, ROOF, YARD), script(HALL_2, ROOF, YARD), 'fountain');
    expect(model.groups.map((g) => g.title)).toEqual([
      '',
      'INT. HALL - DAY',
      'EXT. ROOF - NIGHT',
      'EXT. COAL YARD - DAWN',
    ]);
    // Only a group with a change is shown.
    expect(shownGroups(model).map((g) => g.title)).toEqual(['INT. HALL - DAY']);
    const [hall] = shownGroups(model);
    expect(hall?.tag).toBe('same');
    expect([hall?.added, hall?.removed]).toEqual([1, 1]);
  });

  test('a stage play groups at ## scenes', () => {
    const meta = '/* drafter\n{"v":1,"template":"stage-play-standard"}\n*/';
    const play = (second: string) =>
      `Title: The Lamp\n\n# ACT ONE\n\n## The Climb\n\nESME climbs with a toolbox.\n\n## The Lamp\n\n${second}\n\n${meta}\n`;
    const model = diffModel(
      play('The lamp is dark.'),
      play('The lamp is dark and cold.'),
      'fountain',
    );
    expect(model.groups.map((g) => g.title)).toEqual(['', 'The Climb', 'The Lamp']);
    expect(shownGroups(model).map((g) => g.title)).toEqual(['The Lamp']);
  });

  test('a Markdown document groups at headings 1–3', () => {
    const doc = (last: string) =>
      `# Notes\n\nOne.\n\n## Places\n\nThe hall.\n\n#### Smaller\n\n${last}\n\n\`\`\`\n# not a heading\n\`\`\`\n`;
    const model = diffModel(doc('The roof.'), doc('The yard.'), 'markdown');
    expect(model.groups.map((g) => g.title)).toEqual(['Notes', 'Places']);
    expect(shownGroups(model).map((g) => g.title)).toEqual(['Places']);
  });

  test('summary counts changed, new, and deleted scenes', () => {
    const model = diffModel(
      script(HALL, ROOF, YARD),
      script(HALL_2, CELLAR, 'EXT. PIER - DAY\n\nNets dry on the rail.\n', YARD),
      'fountain',
    );
    expect(model.summary).toEqual({
      scenes: 1,
      added: 2,
      deleted: 1,
      // The hall's changed line, and the new and deleted scenes' (blank lines between line up).
      linesAdded: 7,
      linesRemoved: 3,
    });
    expect(summaryText(model.summary, 'fountain')).toBe(
      '1 scene changed, 2 new, 1 deleted · 7 lines added, 3 removed',
    );
    expect(summaryText(diffModel(HALL, HALL, 'fountain').summary, 'fountain')).toBe(
      'No changes: the two versions are the same.',
    );
    expect(
      summaryText(diffModel(script(HALL), script(HALL, ROOF), 'fountain').summary, 'fountain'),
    ).toBe('1 new scene · 4 lines added');
    expect(
      summaryText(diffModel('# A\n\nOne.\n', '# A\n\nTwo.\n', 'markdown').summary, 'markdown'),
    ).toBe('1 section changed · 1 line added, 1 removed');
  });

  test('names each change by its scene, or by its line before the first', () => {
    const older = script(HALL, ROOF);
    const newer = `Title: The Key\nAuthor: Ilse\n\n${HALL_2}\n${ROOF}\nRain.\n`;
    const { model } = compared(older, newer);
    expect(changeStops(model).map((s) => s.label)).toEqual([
      'Line 2: 1 line added',
      'INT. HALL - DAY: 1 line changed',
      'EXT. ROOF - NIGHT: 2 lines added',
    ]);
  });

  test('goToScene uses the offset when now is unchanged', () => {
    const now = script(HALL_2, ROOF, YARD);
    const comparison = compared(script(HALL, ROOF, YARD), now);
    const [hall] = shownGroups(comparison.model);
    expect(goToScene(hall as never, comparison, now)).toEqual({ offset: at(now, 'INT. HALL') });
    // The opening goes to the top.
    const opening = comparison.model.groups[0];
    expect(goToScene(opening as never, comparison, now)).toEqual({ offset: 0 });
  });

  test('goToScene finds the matching scene after edits', () => {
    const newer = script(HALL_2, ROOF, YARD);
    const comparison = compared(script(HALL, ROOF, YARD), newer);
    // Since Compare opened, a scene went in above, and the hall was renamed.
    const now = script(CELLAR, HALL_2.replace('INT. HALL', 'INT. GREAT HALL'), ROOF, YARD);
    const [hall] = shownGroups(comparison.model);
    expect(goToScene(hall as never, comparison, now)).toEqual({
      offset: at(now, 'INT. GREAT HALL'),
    });
    // Between two snapshots, the scene now is found the same way.
    const snapshots = compared(script(HALL, ROOF, YARD), newer, Date.now() - 60_000);
    const [same] = shownGroups(snapshots.model);
    expect(goToScene(same as never, snapshots, newer)).toEqual({ offset: at(newer, 'INT. HALL') });
  });

  test('goToScene says gone for a deleted scene', () => {
    const now = script(HALL, YARD);
    const comparison = compared(script(HALL, ROOF, YARD), now);
    const [roof] = shownGroups(comparison.model);
    expect(roof?.tag).toBe('deleted');
    expect(goToScene(roof as never, comparison, now)).toEqual({ gone: true });
    // A scene cut since Compare opened is gone too.
    const [hall] = shownGroups(compared(script(HALL), script(HALL_2)).model);
    const later = compared(script(HALL), script(HALL_2));
    expect(goToScene(hall as never, later, script(ROOF))).toEqual({ gone: true });
  });

  test('the Changes list names each group once, with its count of changes', () => {
    const older = script(HALL, ROOF);
    const newer = `Title: The Key\nAuthor: Ilse\n\n${HALL_2}\n${ROOF}\nRain.\n\nHail.\n`;
    const { model } = compared(older, newer);
    expect(groupStops(model, 'fountain')).toEqual([
      { group: 0, change: 0, label: 'Title page and opening: 1 change' },
      { group: 1, change: 1, label: 'INT. HALL - DAY: 1 change' },
      { group: 2, change: 2, label: 'EXT. ROOF - NIGHT: 1 change' },
    ]);
    const twice = compared(script(HALL, ROOF), script(HALL_2, `${ROOF}\nRain.\n`)).model;
    const renamed = compared(
      script(HALL),
      script(HALL.replace('INT. HALL', 'INT. GREAT HALL').replace('waits', 'sits')),
    ).model;
    expect(groupStops(renamed, 'fountain').map((s) => s.label)).toEqual([
      'INT. HALL - DAY → INT. GREAT HALL - DAY: 2 changes',
    ]);
    expect(groupStops(twice, 'fountain').map((s) => s.label)).toEqual([
      'INT. HALL - DAY: 1 change',
      'EXT. ROOF - NIGHT: 1 change',
    ]);
    const md = diffModel(
      '# A\n\nOne.\n\nTwo.\n\nSix.\n',
      '# A\n\nUno.\n\nTwo.\n\nSeis.\n',
      'markdown',
    );
    expect(groupStops(md, 'markdown').map((s) => s.label)).toEqual(['A: 2 changes']);
  });

  test('a group is titled by its heading, its rename, or what comes before the first', () => {
    const model = diffModel(script(HALL), `Title: The Lock\n\n${HALL_2}`, 'fountain');
    const [opening, hall] = shownGroups(model);
    expect(groupTitle(opening as never, 'fountain')).toBe('Title page and opening');
    expect(groupTitle(opening as never, 'markdown')).toBe('Before the first heading');
    expect(groupTitle(hall as never, 'fountain')).toBe('INT. HALL - DAY');
  });

  test('opens groups in order until the drawn rows reach the budget; the rest wait', () => {
    const group = (from: number, added: number) =>
      ({
        from,
        to: from + added,
        title: '',
        tag: 'same',
        renamedFrom: null,
        added,
        removed: 0,
        changes: [from],
      }) as const;
    const groups = [
      group(0, 300),
      group(1000, 300),
      group(2000, 401),
      group(3000, 300),
      group(4000, 200),
      group(5000, 10),
    ];
    // Each draws its added rows; the 401 one is large and closed, and draws none.
    const { open, waiting } = openGroups(groups, (g) => g.added, 1000);
    expect([...open]).toEqual([0, 1000, 3000]);
    expect([...waiting]).toEqual([4000, 5000]);
    // The first group opens even past the budget.
    expect([...openGroups([group(0, 390)], () => 5000, 1500).open]).toEqual([0]);
    expect(ROW_BUDGET).toBe(1500);
  });

  test('openAt shows the Changes view without changing the remembered one', () => {
    expect(shownView('fountain', null, 'pages')).toBe('pages');
    expect(shownView('fountain', 'changes', 'pages')).toBe('changes');
    expect(shownView('markdown', null, 'pages')).toBe('changes');
  });

  test("from a Changes list entry, N goes to the group's first change and Shift+N to the one before", () => {
    expect(stepFromGroup(5, 2, 1)).toBe(2);
    expect(stepFromGroup(5, 2, -1)).toBe(1);
    // The first group: Shift+N wraps to the last change.
    expect(stepFromGroup(5, 0, -1)).toBe(4);
    expect(stepFromGroup(5, 0, 1)).toBe(0);
    expect(stepFromGroup(0, 0, 1)).toBeNull();
  });
});
