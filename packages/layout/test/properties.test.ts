import { type Doc, parse } from '@drafter/fountain';
import { type Layout, type LayoutLine, paginate } from '@drafter/layout';
import { builtins, type Role, resolveRole, type Template } from '@drafter/templates';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { fountainScript } from '../../../fixtures/generators/fountain';
import { filler, isBlank, parts, sourceText } from './helpers';

const collapse = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Every structural property of technical design §5.8; throws on the first one that fails. */
function check(doc: Doc, template: Template, layout: Layout) {
  const height = template.page.height - template.page.margin.top - template.page.margin.bottom;
  const keepsWithNext = (role: Role) => template.roles[role]?.keepWithNext === true;
  const body = layout.pages.filter((p) => p.number > 0);

  for (const page of layout.pages) {
    expect(page.lines.length, `page ${page.number} height`).toBe(height);
  }
  // The title page is placed, not filled, so it starts with blank lines by design.
  for (const page of body) {
    const first = page.lines[0];
    expect(first && isBlank(first), `page ${page.number} starts blank`).toBe(false);
  }

  // No keep-with-next line (cue, heading, parenthetical) ends a page, unless a
  // forced break or the end of the script ends it.
  body.forEach((page, i) => {
    const next = body[i + 1];
    if (!next) return;
    const last = page.lines.findLast((line) => !isBlank(line));
    const firstNext = next.lines.find((line) => !isBlank(line));
    if (!last || !firstNext || last.synthetic) return;
    const from = last.right?.blockIndex ?? last.blockIndex;
    const to = firstNext.blockIndex === -1 ? doc.blocks.length : firstNext.blockIndex;
    const forced = doc.blocks.slice(from + 1, to).some((b) => b.kind === 'page_break');
    if (!forced)
      expect(keepsWithNext(last.role), `page ${page.number} ends on ${last.role}`).toBe(false);
  });

  // Gather each block's printed parts, in order.
  const printed = new Map<number, Array<{ page: number; line: number; part: LayoutLine }>>();
  for (const page of layout.pages) {
    page.lines.forEach((row, line) => {
      for (const part of parts(row)) {
        if (part.synthetic) continue;
        const block = doc.blocks[part.blockIndex];
        expect(block, 'a non-synthetic line belongs to a block').toBeDefined();
        if (!block) continue;
        expect(part.span.from >= block.span.from && part.span.to <= block.span.to).toBe(true);
        for (const run of part.runs) {
          if (run.synthetic) continue;
          expect(run.span.from >= part.span.from && run.span.to <= part.span.to).toBe(true);
        }
        const list = printed.get(part.blockIndex) ?? [];
        list.push({ page: page.number, line, part });
        printed.set(part.blockIndex, list);
      }
    });
  }

  // Joining a block's lines gives back its printable text, in its role's case.
  let prevRole: Role | null = null;
  doc.blocks.forEach((block, b) => {
    const role = resolveRole(template, block, prevRole);
    prevRole = role;
    const list = printed.get(b) ?? [];
    if (role === 'omit' || role === 'page_break') {
      expect(list, `block ${b} (${role}) prints nothing`).toEqual([]);
      return;
    }
    const printable = block.lines
      .filter((line) => !line.transparent)
      .map((line) => line.inline.map((run) => run.text).join(''))
      .join(' ');
    const lineRole = list[0]?.part.role;
    const upper = lineRole !== undefined && template.roles[lineRole]?.case === 'upper';
    expect(collapse(list.map((p) => sourceText(p.part)).join(' ')), `text of block ${b}`).toBe(
      collapse(upper ? printable.toUpperCase() : printable),
    );
    if (list[0]) {
      expect(layout.index[b], `index of block ${b}`).toEqual({
        page: list[0].page,
        line: list[0].line,
      });
    }
  });
  expect(layout.index.length).toBe(doc.blocks.length);
}

const scripts = fc.oneof(
  fountainScript,
  // Filler first, so the generated blocks land near the foot of a page.
  fc
    .tuple(fc.integer({ min: 1, max: 60 }), fountainScript)
    .map(([n, script]) => `${filler(n)}\n\n${script}`),
);

for (const id of ['us-screenplay', 'stage-play-standard']) {
  const template = builtins[id] as Template;

  describe(`layout properties: ${id}`, () => {
    it('holds for generated scripts', () => {
      fc.assert(
        fc.property(scripts, (source) => {
          const doc = parse(source);
          const layout = paginate(doc, template);
          check(doc, template, layout);
          expect(paginate(doc, template)).toEqual(layout);
        }),
        { numRuns: 400 },
      );
    });

    it('holds with scene numbers on', () => {
      fc.assert(
        fc.property(scripts, (source) => {
          const doc = parse(source);
          check(doc, template, paginate(doc, template, { sceneNumbers: true }));
        }),
        { numRuns: 100 },
      );
    });
  });
}
