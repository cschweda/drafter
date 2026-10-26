import { parse } from '@drafter/fountain';
import { type PaginateOptions, paginate } from '@drafter/layout';
import { builtins, loadTemplate, type Template } from '@drafter/templates';
import { describe, expect, it } from 'vitest';
import { buildPage } from '../src/page';
import { speechRoles } from '../src/roles';

const screenplay = builtins['us-screenplay'] as Template;
const stagePlay = builtins['stage-play-standard'] as Template;

/** A script's pages, built as the Script pane builds them. */
function pagesOf(source: string, template = screenplay, options?: PaginateOptions): HTMLElement[] {
  const layout = paginate(parse(source), template, options);
  return layout.pages.map((page) => buildPage(document, page, template));
}

const linesIn = (el: Element) => [...el.querySelectorAll<HTMLElement>('.drafter-line')];
const textsIn = (el: Element) => linesIn(el).map((line) => line.textContent);
const cssVar = (el: HTMLElement, name: string) => el.style.getPropertyValue(name);
const groupsIn = (el: Element) => [...el.querySelectorAll<HTMLElement>('[role=group]')];

/** The line with exactly this text. */
function lineWith(el: Element, text: string): HTMLElement {
  const line = linesIn(el).find((candidate) => candidate.textContent === text);
  if (!line) throw new Error(`no line reads "${text}"; the lines read ${textsIn(el).join(' | ')}`);
  return line;
}

/** The element a group's `aria-labelledby` names. Pages aren't in the document, so `getElementById` can't find it. */
function labelOf(page: Element, group: Element): string | null {
  const ids = (group.getAttribute('aria-labelledby') ?? '').split(' ');
  const named = ids.map((id) => page.querySelector(`[id="${id}"]`));
  if (named.some((el) => el === null)) return null;
  return named.map((el) => el?.textContent).join(' ');
}

/** A speech too long for one page, so it splits with `(MORE)` and continues with `(CONT'D)`. */
const longSpeech = `INT. HALL - DAY\n\nMARGARET\n${'A line of talk.\n'.repeat(80)}`;

describe('buildPage', () => {
  it('renders one page per layout page, each with its marker', () => {
    const pages = pagesOf(
      'Title: Test\n\nINT. HALL - DAY\n\nOne.\n\n===\n\nTwo.\n\n===\n\nThree.\n',
    );
    expect(pages.map((page) => page.dataset.page)).toEqual(['0', '1', '2', '3']);
    expect(pages.map((page) => page.firstElementChild?.textContent)).toEqual([
      'Title page',
      'Page 1',
      'Page 2',
      'Page 3',
    ]);
    for (const page of pages) {
      expect(page.tagName).toBe('DIV');
      expect(page.className).toBe('drafter-page');
      expect(page.firstElementChild?.tagName).toBe('SPAN');
      expect(page.firstElementChild?.className).toBe('drafter-sr-only');
      expect(cssVar(page, '--cols')).toBe('85');
      expect(cssVar(page, '--rows')).toBe('66');
    }
  });

  it('positions a line by row and column, margins included', () => {
    const [page] = pagesOf('INT. HALL - DAY\n\nALICE\n(softly)\nI waited.\n\nCUT TO:\n');
    const heading = lineWith(page, 'INT. HALL - DAY');
    expect(heading.tagName).toBe('DIV');
    expect(heading.className).toBe('drafter-line role-scene_heading');
    expect(cssVar(heading, '--row')).toBe('6');
    expect(cssVar(heading, '--col')).toBe('15');
    expect(heading.dataset.from).toBe('0');
    expect(heading.dataset.to).toBe('15');

    // Cue at column 22, parenthetical 16, dialogue 10, and a transition flush right
    // at 40 + 20 - 7: each from the left margin, which is 15 characters in.
    const placed = (text: string) => {
      const line = lineWith(page, text);
      return [cssVar(line, '--row'), cssVar(line, '--col')];
    };
    expect(placed('ALICE')).toEqual(['8', '37']);
    expect(placed('(softly)')).toEqual(['9', '31']);
    expect(placed('I waited.')).toEqual(['10', '25']);
    expect(placed('CUT TO:')).toEqual(['12', '68']);
  });

  it('leaves blank lines out', () => {
    const [page] = pagesOf('INT. HALL - DAY\n\nShe waits.\n\nShe waits.\n');
    expect(textsIn(page)).toEqual(['INT. HALL - DAY', 'She waits.', 'She waits.']);
  });

  it('styles emphasis and marks text the engine added', () => {
    const [page] = pagesOf(
      'INT. HALL - DAY\n\nShe **runs**, *stops*, _waits_, and ***leaves***.\n\nMARGARET\nHello.\n\nShe sits.\n\nMARGARET\nAgain.\n',
    );
    const action = lineWith(page, 'She runs, stops, waits, and leaves.').querySelectorAll('span');
    expect([...action].map((run) => [run.textContent, run.className])).toEqual([
      ['She ', ''],
      ['runs', 'b'],
      [', ', ''],
      ['stops', 'i'],
      [', ', ''],
      ['waits', 'u'],
      [', and ', ''],
      ['leaves', 'b i'],
      ['.', ''],
    ]);

    // The layout adds a (CONT'D) to a speaker who talks again after action.
    const cue = lineWith(page, "MARGARET (CONT'D)");
    expect(
      [...cue.querySelectorAll('span')].map((run) => [run.textContent, run.className]),
    ).toEqual([
      ['MARGARET', ''],
      [" (CONT'D)", 'added'],
    ]);
  });

  it('makes scene headings level-2 headings in a screenplay', () => {
    const [page] = pagesOf(
      'INT. HALL - DAY\n\nShe waits.\n\nMARGARET\nHello.\n\nEXT. YARD - NIGHT\n\nRain.\n',
    );
    const headings = [...page.querySelectorAll('[role=heading]')];
    expect(headings.map((el) => [el.getAttribute('aria-level'), el.textContent])).toEqual([
      ['2', 'INT. HALL - DAY'],
      ['2', 'EXT. YARD - NIGHT'],
    ]);
    // A block, holding its line; cues and action are not headings.
    expect(headings.map((el) => el.className)).toEqual(['drafter-block', 'drafter-block']);
    expect(headings.map((el) => (el as HTMLElement).dataset.block)).toEqual(['0', '4']);
    expect(headings[0]?.querySelector('.drafter-line')?.textContent).toBe('INT. HALL - DAY');
  });

  it('makes act headings level 2 and scene headings level 3 in a stage play', () => {
    const [page] = pagesOf(
      '# Act One\n\n## Scene One\n\nThe room is quiet.\n\n## Scene Two\n\nIt is not.\n',
      stagePlay,
    );
    const headings = [...page.querySelectorAll('[role=heading]')];
    expect(headings.map((el) => [el.getAttribute('aria-level'), el.textContent])).toEqual([
      ['2', 'ACT ONE'],
      ['3', 'Scene One'],
      ['3', 'Scene Two'],
    ]);
  });

  it('groups each speech under its cue', () => {
    const [page] = pagesOf(
      'INT. HALL - DAY\n\nShe waits.\n\nMARGARET\n(quietly)\nHello there.\n\nDANNY\nHi.\n\nShe leaves.\n',
    );
    const groups = groupsIn(page);
    expect(groups.map((group) => group.className)).toEqual(['drafter-speech', 'drafter-speech']);
    expect(groups.map((group) => group.tagName)).toEqual(['DIV', 'DIV']);
    expect(groups.map((group) => labelOf(page, group))).toEqual(['MARGARET', 'DANNY']);
    // The label is the cue's first line.
    const label = page.querySelector(`[id="${groups[0]?.getAttribute('aria-labelledby')}"]`);
    expect(label?.className).toBe('drafter-line role-character');
    // Each group holds its own cue, parenthetical, and dialogue, and nothing else.
    expect(groups.map((group) => textsIn(group))).toEqual([
      ['MARGARET', '(quietly)', 'Hello there.'],
      ['DANNY', 'Hi.'],
    ]);
  });

  it('groups a speech whose cue has a role of its own', () => {
    const sfx = loadTemplate({
      id: 'sfx',
      name: 'With sound cues',
      extends: 'us-screenplay',
      roles: {
        sfx_cue: { indent: 22, width: 33, case: 'upper', spaceBefore: 1, keepWithNext: true },
      },
      roleMap: [{ kind: 'character', names: ['SFX'], role: 'sfx_cue' }],
    });
    const [page] = pagesOf('INT. HALL - DAY\n\nSFX\nA door slams.\n\nMARGARET\nWho is it?\n', sfx);
    const groups = groupsIn(page);
    expect(groups.map((group) => labelOf(page, group))).toEqual(['SFX', 'MARGARET']);
    expect(groups.map((group) => textsIn(group))).toEqual([
      ['SFX', 'A door slams.'],
      ['MARGARET', 'Who is it?'],
    ]);
  });

  it('labels a speech by every line of a wrapped cue', () => {
    const [page] = pagesOf('THE OLD MAN WHO LIVES NEXT DOOR (V.O.)\nHello.\n');
    const [group] = groupsIn(page);
    expect(group?.getAttribute('aria-labelledby')?.split(' ')).toHaveLength(2);
    expect(textsIn(group)).toEqual(['THE OLD MAN WHO LIVES NEXT DOOR', '(V.O.)', 'Hello.']);
    expect(labelOf(page, group)).toBe('THE OLD MAN WHO LIVES NEXT DOOR (V.O.)');
  });

  it('hides (MORE), page numbers, and scene numbers from screen readers', () => {
    const pages = pagesOf(longSpeech, screenplay, { sceneNumbers: true });
    expect(pages).toHaveLength(2);
    const hidden = (page: HTMLElement) =>
      linesIn(page)
        .filter((line) => line.getAttribute('aria-hidden') === 'true')
        .map((line) => line.textContent)
        .toSorted();
    // The first page has two scene numbers (one per margin) and the split's (MORE);
    // the second has its page number, and the repeated cue, which is read, not hidden.
    expect(hidden(pages[0])).toEqual(['(MORE)', '1', '1']);
    expect(hidden(pages[1])).toEqual(['2.']);
    expect(lineWith(pages[1], "MARGARET (CONT'D)").hasAttribute('aria-hidden')).toBe(false);
    // Everything else is left for screen readers.
    for (const page of pages) {
      const read = linesIn(page).filter((line) => !line.hasAttribute('aria-hidden'));
      expect(read.length).toBeGreaterThan(0);
      expect(read.every((line) => line.dataset.from !== undefined)).toBe(true);
    }
  });

  it('continues a split speech in a group of its own on the next page', () => {
    const [first, second] = pagesOf(longSpeech);
    const [group] = groupsIn(first);
    expect(labelOf(first, group)).toBe('MARGARET');
    // (MORE) ends the first page's group.
    expect(textsIn(group).at(-1)).toBe('(MORE)');
    const [next] = groupsIn(second);
    expect(groupsIn(second)).toHaveLength(1);
    expect(labelOf(second, next)).toBe("MARGARET (CONT'D)");
    expect(textsIn(next).every((text) => text !== '(MORE)')).toBe(true);
  });

  it("reads dual dialogue's left speech before its right", () => {
    const [page] = pagesOf(
      "INT. KITCHEN - NIGHT\n\nMARGARET\nYou can't just turn up\nat midnight with a cake.\n\nDANNY ^\n(wet)\nI know.\n\nShe hands him a towel.\n",
    );
    expect(textsIn(page)).toEqual([
      'INT. KITCHEN - NIGHT',
      'MARGARET',
      "You can't just turn up",
      'at midnight with a cake.',
      'DANNY',
      '(wet)',
      'I know.',
      'She hands him a towel.',
    ]);
    // Two speeches, one after the other, each a group. Their cues share a row, and each
    // needs an id of its own to be named by.
    expect(groupsIn(page).map((group) => labelOf(page, group))).toEqual(['MARGARET', 'DANNY']);
    const ids = [...page.querySelectorAll('[id]')].map((el) => el.id);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    // They still sit side by side: the same rows, in two columns.
    const where = (text: string) => {
      const line = lineWith(page, text);
      return [cssVar(line, '--row'), cssVar(line, '--col')];
    };
    expect(where('MARGARET')).toEqual(['8', '23']);
    expect(where('DANNY')).toEqual(['8', '55']);
    expect(where("You can't just turn up")).toEqual(['9', '15']);
    expect(where('(wet)')).toEqual(['9', '51']);
  });

  it('reads the longer column of dual dialogue to its end before the other speech', () => {
    const dual = (left: string, right: string) =>
      `INT. KITCHEN - NIGHT\n\nMARGARET\n${left}\n\nDANNY ^\n${right}\n\nShe waits.\n`;
    // The left column is longer, so its last lines stand alone on their rows.
    const [leftLonger] = pagesOf(dual('One.\nTwo.\nThree.\nFour.', 'Five.'));
    expect(textsIn(leftLonger)).toEqual([
      'INT. KITCHEN - NIGHT',
      'MARGARET',
      'One.',
      'Two.',
      'Three.',
      'Four.',
      'DANNY',
      'Five.',
      'She waits.',
    ]);
    // The right column is longer, so its last lines stand alone.
    const [rightLonger] = pagesOf(dual('One.', 'Two.\nThree.\nFour.\nFive.'));
    expect(textsIn(rightLonger)).toEqual([
      'INT. KITCHEN - NIGHT',
      'MARGARET',
      'One.',
      'DANNY',
      'Two.',
      'Three.',
      'Four.',
      'Five.',
      'She waits.',
    ]);
    expect(groupsIn(leftLonger).map((group) => textsIn(group))).toEqual([
      ['MARGARET', 'One.', 'Two.', 'Three.', 'Four.'],
      ['DANNY', 'Five.'],
    ]);
  });

  it('reads the title page from top to bottom', () => {
    const [title] = pagesOf(
      'Title: Short\nAuthor: A. Writer\nContact: 12 Main Street\n    Springfield\nDraft date: 1 January\n\nINT. HALL - DAY\n',
    );
    expect(title.firstElementChild?.textContent).toBe('Title page');
    expect(textsIn(title)).toEqual([
      'Short',
      'A. Writer',
      '12 Main Street',
      'Springfield',
      '1 January',
    ]);
    // Not blocks of the script, so there are no blocks, groups, or headings to find.
    expect(title.querySelector('.drafter-block, [role]')).toBeNull();
    expect(lineWith(title, 'Short').className).toBe('drafter-line role-title');
    expect(lineWith(title, 'Short').dataset.from).toBeDefined();
  });

  // A title page has no blocks, so its two columns are told apart by their fields: the contact
  // block stands bottom left, the draft date bottom right, level with the contact block's last line.
  it('reads a wrapped draft date after the whole contact block', () => {
    for (const template of [screenplay, stagePlay]) {
      const [title] = pagesOf(
        'Title: Short\nContact:\n    Jane Writer\n    jane@example.com\nDraft date: Revised Draft - January 15, 2026\n\nINT. HALL - DAY\n',
        template,
      );
      expect(textsIn(title)).toEqual([
        'Short',
        'Jane Writer',
        'jane@example.com',
        'Revised Draft - January 15,',
        '2026',
      ]);
    }
  });

  it('reads a draft date longer than the contact block in order', () => {
    for (const template of [screenplay, stagePlay]) {
      const [title] = pagesOf(
        "Title: Short\nContact: Jane Writer\nDraft date: Third revised draft, January 15, 2026, with the director's notes added\n\nINT. HALL - DAY\n",
        template,
      );
      expect(textsIn(title)).toEqual([
        'Short',
        'Jane Writer',
        'Third revised draft, January',
        "15, 2026, with the director's",
        'notes added',
      ]);
    }
  });

  it("reads a title page's fields in the order the writer gave them", () => {
    for (const template of [screenplay, stagePlay]) {
      // The Fountain spec's own example puts the draft date before the contact block.
      const [dateFirst] = pagesOf(
        'Title: Short\nDraft date: 1 January\nContact:\n    Jane Writer\n    jane@example.com\n\nINT. HALL - DAY\n',
        template,
      );
      expect(textsIn(dateFirst)).toEqual(['Short', '1 January', 'Jane Writer', 'jane@example.com']);
      const [authorFirst] = pagesOf(
        'Author: A. Writer\nTitle: Short\n\nINT. HALL - DAY\n',
        template,
      );
      expect(textsIn(authorFirst)).toEqual(['A. Writer', 'Short']);
    }
  });

  it('puts the page furniture where the text renderer puts it', () => {
    const furnished: Template = {
      ...screenplay,
      page: { ...screenplay.page, header: 'DRAFT', footer: 'Page {n}' },
    };
    const pages = pagesOf(
      'INT. HALL - DAY\n\nShe waits.\n\n===\n\nINT. YARD - NIGHT\n\nShe leaves.\n',
      furnished,
      { sceneNumbers: true },
    );
    const where = (page: HTMLElement, text: string) => {
      const found = linesIn(page).filter((line) => line.textContent === text);
      return found.map((line) => [cssVar(line, '--row'), cssVar(line, '--col')]);
    };
    // Scene numbers: in the body's row, 10 characters left of the left margin (15) and
    // 61 right of it.
    expect(where(pages[0], '1')).toEqual([
      ['6', '5'],
      ['6', '76'],
    ]);
    // The header is on the page number's line (3), at the left margin; the footer is as far
    // from the bottom edge (66 - 1 - 3), also at the left margin.
    expect(where(pages[0], 'DRAFT')).toEqual([['3', '15']]);
    expect(where(pages[0], 'Page 1')).toEqual([['62', '15']]);
    // The page number ends at the right margin: column 15 + 58.
    expect(where(pages[1], '2.')).toEqual([['3', '73']]);
    expect(where(pages[1], '2')).toEqual([
      ['6', '5'],
      ['6', '76'],
    ]);
    // No source text behind any of it, so a click on it goes nowhere.
    for (const page of pages) {
      const furniture = linesIn(page).filter((line) =>
        line.classList.contains('drafter-furniture'),
      );
      expect(furniture.length).toBeGreaterThan(0);
      expect(furniture.every((line) => line.dataset.from === undefined)).toBe(true);
      expect(furniture.every((line) => line.getAttribute('aria-hidden') === 'true')).toBe(true);
    }
  });

  it('renders text as text', () => {
    const script = '<img src=x onerror=alert(1)>';
    const hostile: Template = {
      ...screenplay,
      page: { ...screenplay.page, header: script },
    };
    for (const template of [screenplay, hostile]) {
      const pages = pagesOf(`${script}\n\nMARGARET\n${script}\n`, template);
      for (const page of pages) {
        expect(page.querySelector('img')).toBeNull();
        expect(page.querySelector('[onerror]')).toBeNull();
        expect(page.innerHTML).not.toContain('<img');
      }
      const lines = linesIn(pages[0]).filter(
        (line) => line.textContent === script && !line.classList.contains('drafter-furniture'),
      );
      expect(lines).toHaveLength(2);
    }
    const [withHeader] = pagesOf('Action.\n', hostile);
    expect(withHeader.querySelector('.drafter-furniture')?.textContent).toBe(script);
  });

  it('prints control characters as spaces, keeping their columns', () => {
    // A bell, a C1 control, and the line and paragraph separators. They are made here
    // from their codes, since an editor or a formatter may rewrite them where they stand.
    const [bell, c1, lineSeparator, paragraphSeparator] = [0x07, 0x9b, 0x2028, 0x2029].map((code) =>
      String.fromCharCode(code),
    );
    const [page] = pagesOf(`Bell${bell}rings${c1}${lineSeparator}${paragraphSeparator}.\n`);
    expect(textsIn(page)).toEqual(['Bell rings   .']);
  });

  it("names a role's class safely, whatever the role's name", () => {
    const named = (role: string): Template => ({
      ...screenplay,
      roles: { ...screenplay.roles, [role]: screenplay.roles.action },
      roleMap: [{ kind: 'action', role }, ...screenplay.roleMap],
    });
    // A space would make two classes, and a tag is only a name.
    const [spaced] = pagesOf('She waits.\n', named('odd role'));
    expect(lineWith(spaced, 'She waits.').className).toBe('drafter-line role-odd-role');
    const [tag] = pagesOf('She waits.\n', named('<img src=x onerror=alert(1)>'));
    expect(tag.querySelector('img')).toBeNull();
    expect(lineWith(tag, 'She waits.').className).toBe(
      'drafter-line role-<img-src=x-onerror=alert(1)>',
    );
  });
});

describe('speechRoles', () => {
  const speech = ['parenthetical', 'dialogue', 'lyric'];

  it('speechRoles reads cue and speech roles from the role map', () => {
    expect(speechRoles(screenplay)).toEqual({
      cue: new Set(['character']),
      speech: new Set(speech),
    });
    expect(speechRoles(stagePlay)).toEqual({
      cue: new Set(['character']),
      speech: new Set(speech),
    });
    const withSfx: Template = {
      ...screenplay,
      roleMap: [{ kind: 'character', names: ['SFX'], role: 'sfx_cue' }, ...screenplay.roleMap],
    };
    expect(speechRoles(withSfx)).toEqual({
      cue: new Set(['sfx_cue', 'character']),
      speech: new Set(speech),
    });
  });

  it('counts the roles that conditional rules give, and leaves out omit and disabled', () => {
    const custom: Template = {
      ...screenplay,
      roleMap: [
        { kind: 'character', role: 'omit' },
        { kind: 'parenthetical', role: 'disabled' },
        { kind: ['dialogue', 'action'], afterRole: 'sfx_cue', role: 'sfx_text' },
        ...screenplay.roleMap,
      ],
    };
    const { cue, speech: spoken } = speechRoles(custom);
    expect(spoken.has('sfx_text')).toBe(true);
    for (const roles of [cue, spoken]) {
      expect(roles.has('omit')).toBe(false);
      expect(roles.has('disabled')).toBe(false);
    }
  });
});
