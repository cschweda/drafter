import { parse } from '@drafter/fountain';
import { type LayoutLine, paginate } from '@drafter/layout';
import { builtins, type Template } from '@drafter/templates';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { fountainScript } from '../../../fixtures/generators/fountain';
import { buildPage } from '../src/page';
import { speechRoles } from '../src/roles';

const textOf = (line: LayoutLine) => line.runs.map((run) => run.text).join('');
const isBlank = (line: LayoutLine) => textOf(line).trim() === '';
const cssVar = (el: HTMLElement, name: string) => el.style.getPropertyValue(name);

/** Where a line stands and what it reads, as one string to compare. */
const placed = (row: number, col: number, text: string | null) => `${row}|${col}|${text}`;

/** A role's class name, in the page's own spelling. */
const roleClass = (role: string) => `role-${role.replace(/\s+/g, '-')}`;

/** What the page must hold for a script, checked page by page; throws on the first thing that fails. */
function check(source: string, template: Template, sceneNumbers: boolean) {
  const layout = paginate(parse(source), template, { sceneNumbers });
  const cues = new Set([...speechRoles(template).cue].map(roleClass));
  const { top, left } = template.page.margin;

  for (const page of layout.pages) {
    const el = buildPage(document, page, template);
    const drawn = [...el.querySelectorAll<HTMLElement>('.drafter-line:not(.drafter-furniture)')];

    // Every line that prints is drawn once, where the layout puts it, and nothing else is.
    const expected = page.lines.flatMap((row, k) =>
      (row.right ? [row, row.right] : [row])
        .filter((part) => !isBlank(part))
        .map((part) => placed(top + k, left + part.col, textOf(part))),
    );
    const actual = drawn.map((line) =>
      placed(Number(cssVar(line, '--row')), Number(cssVar(line, '--col')), line.textContent),
    );
    expect(actual.toSorted(), `page ${page.number}'s lines`).toEqual(expected.toSorted());

    // Each speech is named by lines of its own, which are cues and come first in it.
    const ids = [...el.querySelectorAll('[id]')].map((found) => found.id);
    expect(new Set(ids).size, 'ids are unique').toBe(ids.length);
    for (const group of el.querySelectorAll<HTMLElement>('.drafter-speech')) {
      const named = (group.getAttribute('aria-labelledby') ?? '').split(' ');
      const lines = [...group.querySelectorAll<HTMLElement>('.drafter-line')];
      expect(named[0], 'the cue starts the group').toBe(lines[0]?.id);
      for (const id of named) {
        const cue = group.querySelector(`[id="${id}"]`);
        expect(cue, 'a speech is named from inside').not.toBeNull();
        expect(cues.has([...(cue?.classList ?? [])].find((c) => c.startsWith('role-')) ?? '')).toBe(
          true,
        );
      }
    }

    // Only (MORE) and the furniture are hidden.
    const more = page.lines.filter((row) => row.synthetic === 'more').length;
    const furniture =
      (page.pageNumber ? 1 : 0) +
      page.sceneNumbersLeft.length +
      page.sceneNumbersRight.length +
      (page.header ? 1 : 0) +
      (page.footer ? 1 : 0);
    expect(el.querySelectorAll('[aria-hidden="true"]').length).toBe(more + furniture);
  }
}

/** Scripts with speeches that span pages, and dual dialogue with columns of any length. */
const lines = (count: number, word: string) =>
  Array.from({ length: count }, (_, i) => `${word} ${i + 1}.`).join('\n');
const pageSpanning = fc
  .tuple(
    fc.integer({ min: 0, max: 60 }),
    fc.integer({ min: 1, max: 120 }),
    fc.integer({ min: 1, max: 45 }),
    fc.integer({ min: 1, max: 45 }),
    fc.constantFrom('INT. HALL - DAY', '# Act One', 'EXT. YARD - NIGHT'),
  )
  .map(
    ([filler, talk, left, right, heading]) =>
      `${heading}\n\n${'Action line.\n\n'.repeat(filler)}MARGARET\n${lines(talk, 'Talk')}\n\nALICE\n${lines(left, 'Left')}\n\nBOB ^\n(wry)\n${lines(right, 'Right')}\n\nShe waits.\n\nMARGARET\nAgain.\n`,
  );

for (const id of ['us-screenplay', 'stage-play-standard']) {
  const template = builtins[id] as Template;

  describe(`page properties: ${id}`, () => {
    it('holds for generated scripts', () => {
      fc.assert(
        fc.property(fountainScript, fc.boolean(), (source, numbers) =>
          check(source, template, numbers),
        ),
        { numRuns: 300 },
      );
    });

    it('keeps each column of dual dialogue in its own speech, whatever their lengths', () => {
      fc.assert(
        fc.property(pageSpanning, fc.boolean(), (source, numbers) => {
          check(source, template, numbers);
          for (const page of paginate(parse(source), template).pages) {
            const el = buildPage(document, page, template);
            const groups = [...el.querySelectorAll<HTMLElement>('.drafter-speech')];
            const named = (cue: string) =>
              groups.find((group) => group.querySelector('.drafter-line')?.textContent === cue);
            const alice = named('ALICE');
            const bob = named('BOB');
            if (!alice || !bob) continue;
            for (const line of el.querySelectorAll<HTMLElement>('.drafter-line')) {
              const text = line.textContent ?? '';
              if (/^Left \d+\.$/.test(text)) expect(alice.contains(line), text).toBe(true);
              if (/^Right \d+\.$/.test(text) || text === '(wry)') {
                expect(bob.contains(line), text).toBe(true);
              }
            }
            // Left, then right.
            expect(
              alice.compareDocumentPosition(bob) & Node.DOCUMENT_POSITION_FOLLOWING,
            ).toBeTruthy();
          }
        }),
        { numRuns: 100 },
      );
    });
  });
}
