import { parse } from '@drafter/fountain';
import { type LayoutLine, paginate, type SceneNumbering } from '@drafter/layout';
import { builtins, type Template } from '@drafter/templates';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { pagesHtml } from '../src/pages';
import { colClass, rowClass } from '../src/rules';

const screenplay = builtins['us-screenplay'] as Template;
const stagePlay = builtins['stage-play-standard'] as Template;

/** Words, some of them trouble: markup, quotes, ampersands, a control, a separator, wide and combined characters. */
const word = fc.constantFrom(
  'rain',
  'Lamp',
  'harbour',
  'ODD',
  '<img src=x onerror=alert(1)>',
  '</div>',
  '"quoted"',
  "it's",
  'a&b',
  'bell\u0007',
  'line\u2028break',
  '东京',
  '🎬',
  'café',
);
const words = fc.array(word, { minLength: 1, maxLength: 12 }).map((w) => w.join(' '));
/** A phrase, plain or wrapped in one of Fountain's emphases. */
const phrase = fc
  .tuple(
    fc.constantFrom('', '**', '*', '***', '_'),
    fc.array(fc.constantFrom('rain', 'lamp', 'tide'), { minLength: 1, maxLength: 3 }),
  )
  .map(([mark, w]) => `${mark}${w.join(' ')}${mark}`);
const action = fc
  .array(fc.oneof(words, phrase), { minLength: 1, maxLength: 4 })
  .map((parts) => `${parts.join(' ')}.`);
const name = fc.constantFrom('MARA', 'JONAH', 'TESSA', 'DECLAN', 'ODILE');
const heading = fc.constantFrom(
  'INT. KITCHEN - NIGHT',
  'EXT. CLIFF PATH - DAY',
  'INT. FERRY - DUSK',
);
/** A speech: a cue, maybe a parenthetical, and lines; sometimes long enough to break across pages. */
const speech = fc
  .tuple(
    name,
    fc.boolean(),
    fc.oneof(
      action,
      action.map((a) => `${a} `.repeat(40).trim()),
    ),
  )
  .map(([who, paren, lines]) => `${who}\n${paren ? '(quietly)\n' : ''}${lines}`);
const dual = fc
  .tuple(speech, name, action)
  .map(([left, who, lines]) => `${left}\n\n${who} ^\n${lines}`);
const block = fc.oneof(
  heading,
  action,
  speech,
  dual,
  fc.constant('# ACT ONE'),
  fc.constant('## SCENE 2'),
);
const script = fc.array(block, { minLength: 1, maxLength: 14 }).map((b) => `${b.join('\n\n')}\n`);

/** A template with or without a header and a footer. */
const templateOf = (base: Template, furniture: boolean): Template =>
  furniture
    ? { ...base, page: { ...base.page, header: 'SALT ROAD {n}', footer: 'Draft {n}' } }
    : base;

const textOf = (line: LayoutLine) => line.runs.map((run) => run.text).join('');
const isBlank = (line: LayoutLine) => textOf(line).trim() === '';

/** The text as the page prints it: what `escapeHtml` and the page's own cleanup leave. */
const asPrinted = (text: string) => {
  let out = '';
  for (const char of text) {
    const c = char.charCodeAt(0);
    out += c < 0x20 || (c >= 0x7f && c <= 0x9f) || c === 0x2028 || c === 0x2029 ? ' ' : char;
  }
  return out;
};

describe('pagesHtml, on random scripts', () => {
  it('puts every line once at its place, draws nothing else, and only its own elements', () => {
    fc.assert(
      fc.property(
        script,
        fc.constantFrom(screenplay, stagePlay),
        fc.boolean(),
        fc.constantFrom<SceneNumbering>('none', 'all'),
        (source, base, furniture, sceneNumbers) => {
          const template = templateOf(base, furniture);
          const layout = paginate(parse(source), template, { sceneNumbers });
          const { html } = pagesHtml(layout, template);
          const host = document.createElement('div');
          host.innerHTML = html;
          expect(host.querySelector('[style]')).toBeNull();
          for (const el of host.querySelectorAll('*')) {
            expect(['SECTION', 'DIV', 'SPAN']).toContain(el.tagName);
          }
          const cards = [...host.querySelectorAll('.page')];
          expect(cards.length).toBe(Math.max(1, layout.pages.length));
          const { top, left } = template.page.margin;
          layout.pages.forEach((page, i) => {
            const card = cards[i] as Element;
            let parts = 0;
            page.lines.forEach((line, k) => {
              for (const part of line.right ? [line, line.right] : [line]) {
                if (isBlank(part)) continue;
                parts++;
                const found = card.querySelectorAll(
                  `.ln.${rowClass(top + k)}.${colClass(left + part.col)}:not([data-furniture])`,
                );
                expect(found.length).toBe(1);
                expect(found[0]?.textContent).toBe(asPrinted(textOf(part)));
              }
            });
            expect(card.querySelectorAll('.ln:not([data-furniture])').length).toBe(parts);
            const furnitureCount =
              (page.pageNumber ? 1 : 0) +
              page.sceneNumbersLeft.length +
              page.sceneNumbersRight.length +
              (page.header ? 1 : 0) +
              (page.footer ? 1 : 0);
            expect(card.querySelectorAll('[data-furniture]').length).toBe(furnitureCount);
          });
        },
      ),
      { numRuns: 60 },
    );
  });
});
