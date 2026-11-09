import { parse } from '@drafter/fountain';
import { type LintDiagnostic, lint } from '@drafter/lint';
import { builtins, type Template } from '@drafter/templates';
import { describe, expect, it } from 'vitest';
import { compareSceneNumbers } from '../src/rules/locked';
import { applyFix } from './helpers';

const screenplay = builtins['us-screenplay'] as Template;
const stagePlay = builtins['stage-play-standard'] as Template;

const locked = (body: string, numbers: string[] | null = ['1', '2', '3']) =>
  numbers === null
    ? body
    : `${body}/* drafter\n${JSON.stringify({ v: 1, production: { numbers } })}\n*/\n`;

const run = (source: string, id: string, template: Template = screenplay): LintDiagnostic[] =>
  lint(parse(source), template).filter((d) => d.ruleId === id);

const H = (n: string, t = 'KITCHEN') => `INT. ${t} - DAY #${n}#\n\nShe waits.\n\n`;

describe('locked-scene-gone', () => {
  const id = 'locked-scene-gone';

  it('reports a gap on the heading after it, with a fix that puts it back as OMITTED', () => {
    const source = locked(H('1') + H('3'));
    const [d, ...rest] = run(source, id);
    expect(rest).toEqual([]);
    expect(d?.message).toBe('Scene 2 is gone. A locked scene keeps its number as OMITTED.');
    expect(d?.severity).toBe('warning');
    const at = source.indexOf('INT. KITCHEN - DAY #3#');
    expect(d?.span.from).toBe(at);
    expect(d?.fix?.title).toBe('Put back as OMITTED');
    expect(d?.fix?.changes).toEqual([{ from: at, to: at, insert: '.OMITTED #2#\n\n' }]);
    const after = applyFix(source, d?.fix as never);
    expect(run(after, id)).toEqual([]);
  });

  it('counts an OMITTED heading as carrying its number', () => {
    expect(run(locked(`${H('1')}.OMITTED #2#\n\n${H('3')}`), id)).toEqual([]);
  });

  it('uses the script’s own line break', () => {
    const source = locked(H('1') + H('3')).replace(/\n/g, '\r\n');
    const at = source.indexOf('INT. KITCHEN - DAY #3#');
    expect(run(source, id)[0]?.fix?.changes).toEqual([
      { from: at, to: at, insert: '.OMITTED #2#\r\n\r\n' },
    ]);
  });

  it('gives each of several gone numbers before one heading its own diagnostic', () => {
    const source = locked(H('1') + H('4'), ['1', '2', '3', '4']);
    const found = run(source, id);
    expect(found.map((d) => d.message)).toEqual([
      'Scene 2 is gone. A locked scene keeps its number as OMITTED.',
      'Scene 3 is gone. A locked scene keeps its number as OMITTED.',
    ]);
    const at = source.indexOf('INT. KITCHEN - DAY #4#');
    expect(found.map((d) => d.fix?.changes[0]?.from)).toEqual([at, at]);
  });

  it('reports a gone last scene on the last heading, with the fix at the end of the script', () => {
    const source = locked(H('1') + H('2'));
    const [d] = run(source, id);
    expect(d?.message).toBe('Scene 3 is gone. A locked scene keeps its number as OMITTED.');
    expect(d?.span.from).toBe(source.indexOf('INT. KITCHEN - DAY #2#'));
    const out = applyFix(source, d?.fix as never);
    expect(out.indexOf('.OMITTED #3#')).toBeLessThan(out.indexOf('/* drafter'));
    expect(out.indexOf('.OMITTED #3#')).toBeGreaterThan(out.indexOf('#2#'));
    expect(run(out, id)).toEqual([]);
    expect(out).toContain('She waits.\n\n.OMITTED #3#');
  });

  it('ignores unnumbered headings', () => {
    expect(run(locked(`${H('1')}INT. HALL - DAY\n\nHe goes.\n\n${H('3')}`), id)).toHaveLength(1);
  });
});

describe('locked-numbers-out-of-order and repeated-scene-number', () => {
  it('warns when a heading sorts before the one before it', () => {
    const source = locked(H('1') + H('3') + H('2'));
    const found = run(source, 'locked-numbers-out-of-order');
    expect(found).toHaveLength(1);
    expect(found[0]?.severity).toBe('warning');
    expect(found[0]?.span.from).toBe(source.lastIndexOf('INT. KITCHEN'));
  });

  it('accepts A-numbers in order', () => {
    const source = locked(H('1') + H('1A') + H('2'), ['1', '1A', '2']);
    expect(run(source, 'locked-numbers-out-of-order')).toEqual([]);
  });

  it('reports the second of a repeated number', () => {
    const source = locked(H('1') + H('2') + H('2'));
    const found = run(source, 'repeated-scene-number');
    expect(found).toHaveLength(1);
    expect(found[0]?.span.from).toBe(source.lastIndexOf('INT. KITCHEN'));
  });

  it('is quiet when the script is in order and whole', () => {
    const source = locked(H('1') + H('2') + H('3'));
    for (const id of ['locked-numbers-out-of-order', 'repeated-scene-number', 'locked-scene-gone'])
      expect(run(source, id)).toEqual([]);
  });
});

describe('quiet when unlocked or in a stage play', () => {
  const ids = ['locked-numbers-out-of-order', 'repeated-scene-number', 'locked-scene-gone'];
  it('is quiet when unlocked', () => {
    const source = H('3') + H('1') + H('1');
    for (const id of ids) expect(run(source, id)).toEqual([]);
  });
  it('is quiet in a stage play', () => {
    const source = locked(H('3') + H('1') + H('1'));
    for (const id of ids) expect(run(source, id, stagePlay)).toEqual([]);
  });
});

describe('the copied number order', () => {
  it('orders the production package’s cases the same way', () => {
    const list = ['AA1', 'A1', '1', '2', 'A5A', '5A', '5AA', '5AB', '5B', '5Z', '5ZA', '10'];
    expect([...list].reverse().sort(compareSceneNumbers)).toEqual(list);
    const more = ['AA1', 'A1', 'B1', '1', '1A', '1AA', '1B', '1Z', '1ZA', '2'];
    expect([...more].reverse().sort(compareSceneNumbers)).toEqual(more);
    expect(compareSceneNumbers('A5A', '5A')).toBeLessThan(0);
    expect(compareSceneNumbers('A5A', 'B5A')).toBeLessThan(0);
    expect(compareSceneNumbers('B5A', '5A')).toBeLessThan(0);
    expect(compareSceneNumbers('5', '5')).toBe(0);
    expect(compareSceneNumbers('12.1', '12.2')).toBeLessThan(0);
  });
});
