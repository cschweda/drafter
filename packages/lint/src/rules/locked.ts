import type { Block } from '@drafter/fountain';
import { bodyEnd, contentEnd, lineBreakOf } from '@drafter/notes';
import { resolveRole, type Template } from '@drafter/templates';
import type { Fix, LintDiagnostic, Rule } from '../types';

// Locked scene numbers (production design §7.1). Once a script is locked, `doc.meta.production`
// holds `numbers`: every scene number the lock has issued, in script order. These rules watch the
// headings against that list. They are for screenplays, where a scene heading is a `scene_heading`.
// Headings with no number yet are ignored (they have provisional numbers until written).

// Lint keeps its own copy of the scene-number order from `@drafter/production`; a test checks that
// the two agree.
/** The most locked numbers read from a block (the production package's own cap). */
const MAX_NUMBERS = 5000;

const SHAPE = /^([A-Z]*)(\d+)([A-Z]*)$/;

function parse(value: string) {
  const m = SHAPE.exec(value);
  return m ? { prefix: m[1] ?? '', digits: m[2] ?? '', suffix: m[3] ?? '' } : null;
}

/** Script order of two scene numbers: digits, then letter suffix, then prefix (longer first). */
export function compareSceneNumbers(a: string, b: string): number {
  const pa = parse(a);
  const pb = parse(b);
  if (!pa || !pb) return a.localeCompare(b, 'en', { numeric: true });
  const digits = Number(pa.digits) - Number(pb.digits);
  if (digits !== 0) return digits < 0 ? -1 : 1;
  if (pa.suffix !== pb.suffix) return pa.suffix < pb.suffix ? -1 : 1;
  if (pa.prefix === pb.prefix) return 0;
  if (pa.prefix.length !== pb.prefix.length) return pb.prefix.length - pa.prefix.length;
  return pa.prefix < pb.prefix ? -1 : 1;
}

/** Whether `template` gives scene headings the `scene_heading` role: a screenplay. */
function isScreenplay(template: Template): boolean {
  const probe = { kind: 'scene_heading', forced: false, sem: { number: null } } as unknown as Block;
  return resolveRole(template, probe, null) === 'scene_heading';
}

interface Numbered {
  block: Block & { kind: 'scene_heading' };
  number: string;
}

/** The locked numbers, and the numbered headings in order; null when the rules don't apply. */
function setup(ctx: Parameters<Rule['run']>[0]) {
  const production = ctx.doc.meta?.production as { numbers?: unknown } | undefined;
  const list = production?.numbers;
  if (!Array.isArray(list) || !isScreenplay(ctx.template)) return null;
  const numbers = list.filter((n): n is string => typeof n === 'string');
  const headings: Numbered[] = [];
  for (const block of ctx.doc.blocks) {
    if (block.kind !== 'scene_heading') continue;
    const number = block.sem.number;
    if (number !== null && number !== '') headings.push({ block, number });
  }
  return { numbers, headings };
}

// Strictly before only: an equal number is `repeated-scene-number`'s to report.
export const lockedNumbersOutOfOrder: Rule = {
  id: 'locked-numbers-out-of-order',
  severity: 'warning',
  run: (ctx) => {
    const s = setup(ctx);
    if (!s) return [];
    const found: LintDiagnostic[] = [];
    for (let i = 1; i < s.headings.length; i++) {
      const prev = s.headings[i - 1] as Numbered;
      const cur = s.headings[i] as Numbered;
      if (compareSceneNumbers(cur.number, prev.number) >= 0) continue;
      found.push({
        ruleId: lockedNumbersOutOfOrder.id,
        severity: lockedNumbersOutOfOrder.severity,
        span: { ...cur.block.span },
        message: `Scene ${cur.number} is out of order: it follows scene ${prev.number}, but locked scene numbers keep script order.`,
      });
    }
    return found;
  },
};

export const repeatedSceneNumber: Rule = {
  id: 'repeated-scene-number',
  severity: 'warning',
  run: (ctx) => {
    const s = setup(ctx);
    if (!s) return [];
    const seen = new Set<string>();
    const found: LintDiagnostic[] = [];
    for (const { block, number } of s.headings) {
      if (seen.has(number)) {
        found.push({
          ruleId: repeatedSceneNumber.id,
          severity: repeatedSceneNumber.severity,
          span: { ...block.span },
          message: `Scene number ${number} is on more than one scene.`,
        });
      }
      seen.add(number);
    }
    return found;
  },
};

export const lockedSceneGone: Rule = {
  id: 'locked-scene-gone',
  severity: 'warning',
  run: (ctx) => {
    const s = setup(ctx);
    if (!s || s.headings.length === 0) return [];
    const { doc } = ctx;
    const nl = lineBreakOf(doc.source);
    const present = new Set(s.headings.map((h) => h.number));
    const last = s.headings[s.headings.length - 1] as Numbered;
    // Running maximum of the headings' numbers, in script order: it never decreases, so the first
    // heading that sorts after `n` is found by binary search.
    const maxes: Numbered[] = [];
    for (const h of s.headings) {
      const top = maxes[maxes.length - 1];
      maxes.push(top && compareSceneNumbers(top.number, h.number) >= 0 ? top : h);
    }
    const firstAfter = (n: string): Numbered | undefined => {
      let lo = 0;
      let hi = maxes.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (compareSceneNumbers((maxes[mid] as Numbered).number, n) > 0) hi = mid;
        else lo = mid + 1;
      }
      // The running maximum names the heading that set it, which is the first one past `n`.
      return s.headings[lo];
    };
    const found: LintDiagnostic[] = [];
    for (const n of new Set(s.numbers.slice(0, MAX_NUMBERS))) {
      if (present.has(n)) continue;
      const after = firstAfter(n);
      const target = after ?? last;
      let fix: Fix;
      if (after) {
        fix = {
          title: 'Put back as OMITTED',
          changes: [
            {
              from: after.block.span.from,
              to: after.block.span.from,
              insert: `.OMITTED #${n}#${nl}${nl}`,
            },
          ],
        };
      } else {
        const body = doc.blocks[bodyEnd(doc) - 1];
        const at = contentEnd(doc.source, body ? body.span.to : doc.source.length);
        fix = {
          title: 'Put back as OMITTED',
          changes: [{ from: at, to: at, insert: `${nl}${nl}.OMITTED #${n}#` }],
        };
      }
      found.push({
        ruleId: lockedSceneGone.id,
        severity: lockedSceneGone.severity,
        span: { ...target.block.span },
        message: `Scene ${n} is gone. A locked scene keeps its number as OMITTED.`,
        fix,
      });
    }
    return found;
  },
};
