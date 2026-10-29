import { describe, expect, test } from 'vitest';
import {
  downTarget,
  type MoveTarget,
  moveItem,
  targetAfterRow,
  targetBefore,
  upTarget,
} from '../src';
import { apply, indexOf } from './helpers';

/** The script after moving the item whose heading starts with `name` to `target`, or null. */
function moved(source: string, name: string, target: (block: number) => MoveTarget | null) {
  const { doc, index } = indexOf(source);
  const item = index.items.find((i) => (i.kind === 'scene' ? i.heading : i.title).startsWith(name));
  if (!item) throw new Error(`no ${name}`);
  const to = target(item.block);
  const move = to && moveItem(doc, index, item.block, to);
  return move ? apply(source, move.changes) : null;
}
const up = (source: string, name: string) =>
  moved(source, name, (b) => upTarget(indexOf(source).index, b));
const down = (source: string, name: string) =>
  moved(source, name, (b) => downTarget(indexOf(source).index, b));
const after = (source: string, name: string, other: string) =>
  moved(source, name, () => {
    const found = indexOf(source).index.items.find((i) =>
      (i.kind === 'scene' ? i.heading : i.title).startsWith(other),
    );
    return found ? { after: found.block } : null;
  });

const ABC = 'Title: T\n\nINT. A - DAY\n\nOne.\n\nINT. B - DAY\n\nTwo.\n\nINT. C - DAY\n\nThree.\n';
const ACTS =
  '# Act One\n\nINT. A - DAY\n\nOne.\n\nINT. B - DAY\n\nTwo.\n\n# Act Two\n\n= Things go wrong.\n\nINT. C - DAY\n\nThree.\n';

describe('moveItem', () => {
  test('moves a scene down past the next one', () => {
    expect(down(ABC, 'INT. A')).toBe(
      'Title: T\n\nINT. B - DAY\n\nTwo.\n\nINT. A - DAY\n\nOne.\n\nINT. C - DAY\n\nThree.\n',
    );
  });

  test('moves a scene up to the end of the section before', () => {
    const result = up(ACTS, 'INT. C') as string;
    expect(result).toBe(
      '# Act One\n\nINT. A - DAY\n\nOne.\n\nINT. B - DAY\n\nTwo.\n\nINT. C - DAY\n\nThree.\n\n# Act Two\n\n= Things go wrong.\n',
    );
    // Once more: it's still a scene of Act One, before B.
    expect(up(result, 'INT. C')).toBe(
      '# Act One\n\nINT. A - DAY\n\nOne.\n\nINT. C - DAY\n\nThree.\n\nINT. B - DAY\n\nTwo.\n\n# Act Two\n\n= Things go wrong.\n',
    );
  });

  test('moves a scene down to the start of the next section', () => {
    expect(down(ACTS, 'INT. B')).toBe(
      '# Act One\n\nINT. A - DAY\n\nOne.\n\n# Act Two\n\n= Things go wrong.\n\nINT. B - DAY\n\nTwo.\n\nINT. C - DAY\n\nThree.\n',
    );
  });

  test('moves a section with its scenes and deeper sections', () => {
    const source =
      '# One\n\n## Early\n\nINT. A - DAY\n\nOne.\n\n## Late\n\nINT. B - DAY\n\nTwo.\n\n# Two\n\nINT. C - DAY\n\nThree.\n';
    expect(down(source, 'One')).toBe(
      '# Two\n\nINT. C - DAY\n\nThree.\n\n# One\n\n## Early\n\nINT. A - DAY\n\nOne.\n\n## Late\n\nINT. B - DAY\n\nTwo.\n',
    );
    expect(up(source, 'Late')).toBe(
      '# One\n\n## Late\n\nINT. B - DAY\n\nTwo.\n\n## Early\n\nINT. A - DAY\n\nOne.\n\n# Two\n\nINT. C - DAY\n\nThree.\n',
    );
  });

  test("never puts a section before scenes or deeper sections that aren't its own", () => {
    const source =
      '# One\n\nINT. A - DAY\n\nOne.\n\n### Aside\n\nINT. B - DAY\n\nTwo.\n\n## Late\n\nINT. C - DAY\n\nThree.\n';
    // At the start of One it would take in A and the Aside, so it goes after them: where it is.
    expect(after(source, 'Late', 'One')).toBeNull();
    // Up passes sections only; with none before it in One, it leaves One.
    expect(up(source, 'Late')).toBe(
      '## Late\n\nINT. C - DAY\n\nThree.\n\n# One\n\nINT. A - DAY\n\nOne.\n\n### Aside\n\nINT. B - DAY\n\nTwo.\n',
    );
  });

  test('moves the first scene of a script with no title page', () => {
    const source = 'INT. A - DAY\n\nOne.\n\nINT. B - DAY\n\nTwo.\n';
    expect(down(source, 'INT. A')).toBe('INT. B - DAY\n\nTwo.\n\nINT. A - DAY\n\nOne.\n');
    expect(up(source, 'INT. B')).toBe('INT. B - DAY\n\nTwo.\n\nINT. A - DAY\n\nOne.\n');
  });

  test('moves a scene to the start of the script, after the title page', () => {
    expect(moved(ABC, 'INT. C', () => ({ start: true }))).toBe(
      'Title: T\n\nINT. C - DAY\n\nThree.\n\nINT. A - DAY\n\nOne.\n\nINT. B - DAY\n\nTwo.\n',
    );
  });

  test('moves the last scene without touching the metadata block', () => {
    const source = 'INT. A - DAY\n\nOne.\n\nINT. B - DAY\n\nTwo.\n\n/* drafter\n{"v":1}\n*/\n';
    expect(up(source, 'INT. B')).toBe(
      'INT. B - DAY\n\nTwo.\n\nINT. A - DAY\n\nOne.\n\n/* drafter\n{"v":1}\n*/\n',
    );
    expect(down(source, 'INT. A')).toBe(
      'INT. B - DAY\n\nTwo.\n\nINT. A - DAY\n\nOne.\n\n/* drafter\n{"v":1}\n*/\n',
    );
  });

  test('carries the locked number and a closing transition', () => {
    const source = 'INT. A - DAY #4#\n\nOne.\n\nCUT TO:\n\nINT. B - DAY #5#\n\nTwo.\n';
    expect(down(source, 'INT. A')).toBe(
      'INT. B - DAY #5#\n\nTwo.\n\nINT. A - DAY #4#\n\nOne.\n\nCUT TO:\n',
    );
  });

  test('will not move a section into itself', () => {
    const source = '# One\n\nINT. A - DAY\n\nOne.\n\nINT. B - DAY\n\nTwo.\n';
    expect(after(source, 'One', 'INT. A')).toBeNull();
    expect(after(source, 'One', 'INT. B')).toBeNull();
    expect(after(source, 'One', 'One')).toBeNull();
  });

  test('has nowhere to go above the first scene or below the last', () => {
    expect(up(ABC, 'INT. A')).toBeNull();
    expect(down(ABC, 'INT. C')).toBeNull();
    // Nor is a move to where it already is a move.
    expect(after(ABC, 'INT. B', 'INT. A')).toBeNull();
    expect(after(ABC, 'INT. B', 'INT. B')).toBeNull();
  });

  test("reports every moved heading's new offset", () => {
    const source = '# One\n\nINT. A - DAY\n\nOne.\n\n# Two\n\nINT. B - DAY\n\nTwo.\n';
    const { doc, index } = indexOf(source);
    const one = index.sections[0];
    if (!one) throw new Error('no section');
    const move = moveItem(doc, index, one.block, downTarget(index, one.block) as MoveTarget);
    if (!move) throw new Error('no move');
    const result = apply(source, move.changes);
    expect(result).toBe('# Two\n\nINT. B - DAY\n\nTwo.\n\n# One\n\nINT. A - DAY\n\nOne.\n');
    expect(move.at).toBe(result.indexOf('# One'));
    expect(move.moved).toEqual([
      { from: source.indexOf('# One'), to: result.indexOf('# One') },
      { from: source.indexOf('INT. A'), to: result.indexOf('INT. A') },
    ]);
  });

  test('keeps a CRLF line break style', () => {
    const source = 'INT. A - DAY\r\n\r\nOne.\r\n\r\nINT. B - DAY\r\n\r\nTwo.\r\n';
    expect(down(source, 'INT. A')).toBe(
      'INT. B - DAY\r\n\r\nTwo.\r\n\r\nINT. A - DAY\r\n\r\nOne.\r\n',
    );
    expect(up(source, 'INT. B')).toBe(
      'INT. B - DAY\r\n\r\nTwo.\r\n\r\nINT. A - DAY\r\n\r\nOne.\r\n',
    );
  });
});

describe('targetAfterRow', () => {
  test('a drop line below a row lands after it, or after a closed section', () => {
    const { index } = indexOf(ACTS);
    const [actOne, a, b] = index.items;
    if (!actOne || !a || !b) throw new Error('missing');
    expect(targetAfterRow(index, null, true)).toEqual({ start: true });
    expect(targetAfterRow(index, a, true)).toEqual({ after: a.block });
    expect(targetAfterRow(index, actOne, true)).toEqual({ after: actOne.block });
    expect(targetAfterRow(index, actOne, false)).toEqual({ after: b.block });
  });
});

describe('targetBefore', () => {
  test('targetBefore puts a scene before the first scene of a section', () => {
    const { index } = indexOf(ACTS);
    const c = index.scenes.find((s) => s.heading === 'INT. C - DAY');
    if (!c) throw new Error('no C');
    expect(moved(ACTS, 'INT. A', () => targetBefore(index, c.block))).toBe(
      '# Act One\n\nINT. B - DAY\n\nTwo.\n\n# Act Two\n\n= Things go wrong.\n\nINT. A - DAY\n\nOne.\n\nINT. C - DAY\n\nThree.\n',
    );
    const abc = indexOf(ABC).index;
    const [a, b] = abc.scenes;
    if (!a || !b) throw new Error('no scenes');
    expect(targetBefore(abc, b.block)).toEqual({ after: a.block });
    expect(targetBefore(abc, a.block)).toEqual({ start: true });
    expect(targetBefore(abc, 999)).toBeNull();
  });
});

describe('a script with an unclosed /*', () => {
  test('moves nothing, so the metadata block stays where it is', () => {
    const source = 'INT. A - DAY\n\nA.\n\nINT. B - DAY\n\nB. /* oops\n\n/* drafter\n{"v":1}\n*/\n';
    expect(moved(source, 'INT. B', () => ({ start: true }))).toBeNull();
    expect(up(source, 'INT. B')).toBeNull();
    expect(down(source, 'INT. A')).toBeNull();
  });
});

describe('a script read leniently', () => {
  test('moves nothing whose heading has no blank line before it', () => {
    // The last heading follows a lyric directly; next to a boneyard it would read differently.
    const source =
      'INT. A - DAY\n\nINT. B - DAY\n  \n/* x */\n\nINT. C - DAY\n\n~la.\nINT. D - DAY';
    expect(moved(source, 'INT. C', () => ({ start: true }))).toBeNull();
  });
});
