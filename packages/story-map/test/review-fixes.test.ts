import { describe, expect, it } from 'vitest';
import { pickQuotes, type QuoteCandidate, type StoryMap } from '../src';
import { rulerSteps } from '../src/render/axis';
import { chip } from '../src/render/people';
import { docOf, text } from './charts';
import { build, generated } from './scripts';

// The fixes from the review of Tasks 5–6: no repeated lines, honest donuts, a long story folded,
// readable matrix numbers, and the smaller points. Original text only.

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/** A script where ODA says the same line in every scene, and other lines besides. */
function refrain(scenes: number): string {
  const out = ['Title: Low Water', ''];
  for (let s = 0; s < scenes; s++) {
    out.push(`INT. BOATYARD SHED ${s + 1} - DAY`, '', 'ODA and PELL coil the ropes.', '');
    out.push('ODA', 'We go when the tide turns back.', '');
    out.push('PELL', `The rope by door ${s + 1} has frayed right through.`, '');
    out.push('ODA', `Then mend number ${s + 1} before the light goes.`, '');
  }
  return out.join('\n');
}

describe('lines of dialogue are never repeated', () => {
  it('a refrain is picked once, and no card repeats a line from elsewhere', () => {
    const map = build(refrain(24), { title: 'Low Water' }).map;
    const shown = map.quotes.filter((q) => q.inScene);
    expect(shown.length).toBeGreaterThan(2);
    expect(new Set(shown.map((q) => norm(q.text))).size).toBe(shown.length);
    // Every line in the model is its own words: a card reuses a scene's line only by pointing at it.
    expect(new Set(map.quotes.map((q) => norm(q.text))).size).toBe(map.quotes.length);
    // On the page: each text appears once in the scenes, and a card line is never another
    // scene's line.
    const doc = docOf(map);
    const scene = [...doc.querySelectorAll('figure.pq blockquote p')].map((p) => norm(text(p)));
    expect(new Set(scene).size).toBe(scene.length);
    for (const c of map.characters) {
      if (c.signature === null) continue;
      const line = map.quotes[c.signature] as (typeof map.quotes)[number];
      const twins = map.quotes.filter((q) => norm(q.text) === norm(line.text));
      expect(twins).toEqual([line]);
    }
  });

  it('pickQuotes skips a candidate whose words were already picked', () => {
    const c = (scene: number, text: string, cue: number): QuoteCandidate => ({
      scene,
      cue,
      character: scene % 2 ? 'ODA' : 'PELL',
      text,
      marked: null,
      score: 3,
    });
    const same = 'We go when the tide turns back.';
    const picks = pickQuotes(
      [
        c(0, same, 1),
        c(4, same, 2),
        c(8, `${same.toUpperCase()}`, 3),
        c(12, 'A new line here.', 4),
      ],
      16,
      () => null,
    );
    expect(picks.map((p) => p.cue)).toEqual([1, 4]);
  });
});

describe('one line of dialogue a scene', () => {
  it("a marked line and another speaker's card line from the same scene: one line in the scene", () => {
    // As the hostile trap's first scene: WREN's marked line is the scene's; QUILL's only line is
    // in the same scene, so it is his card's line, never a second line in the scene.
    const source = `INT. SIGNAL BOX - NIGHT

WREN (40s), a keeper, climbs the stairs.

WREN
Somebody wrote on the lamp again tonight.
[[Quote]]

QUILL
I saw the ferry turn back at the breakwater.

EXT. BREAKWATER - DAY

WREN
The tide is high and rising fast.

QUILL
Then hold the rope and do not let it go.
`;
    const map = build(source, { title: 'Bell' }).map;
    const inScene = map.quotes.filter((q) => q.inScene);
    expect(new Set(inScene.map((q) => q.scene)).size).toBe(inScene.length);
    expect(inScene.filter((q) => q.scene === 0)).toHaveLength(1);
    const doc = docOf(map);
    for (const row of doc.querySelectorAll('li.sc')) {
      expect(row.querySelectorAll('figure.pq').length).toBeLessThanOrEqual(1);
    }
    // QUILL's line from that scene is on his card only.
    const quill = map.characters.find((c) => c.key === 'QUILL');
    const line = map.quotes[quill?.signature ?? -1];
    expect(line?.scene).toBe(0);
    expect(line?.inScene).toBe(false);
    expect(text(doc.querySelector('#s1'))).not.toContain(line?.text);
  });
});

describe('the donuts say only what the script gives', () => {
  it('no times given: no time-of-day donut, and never "100% by day"', () => {
    const scenes = ['INT. KITCHEN', 'EXT. YARD', 'INT. KITCHEN', 'EXT. YARD', 'INT. KITCHEN'];
    const source = scenes
      .map((h, i) => `${h}\n\nMAE shells peas.\n\nMAE\nThe peas are in, ${i + 1} bowls.\n`)
      .join('\n');
    const map = build(source, { title: 'Peas' }).map;
    expect(map.lanes).toBe('two');
    expect(map.split?.night).toBeNull();
    expect(map.split?.indoors).toBeGreaterThan(0);
    const doc = docOf(map);
    expect(doc.querySelectorAll('.donut')).toHaveLength(1);
    expect(text(doc.querySelector('#shape'))).not.toMatch(/by day|at night/);
  });

  it('a share under a minute reads "<1 min", not "0"', () => {
    const long = Array.from({ length: 80 }, (_, i) => `The kettle ticks, ${i + 1}.`).join('\n');
    const source = `INT. HALL - DAY\n\n${long}\n\nINT. HALL - NIGHT\n\n${long}\n\nEXT. STEP - DAY\n\nA cat.\n`;
    const map = build(source, { title: 'Hall' }).map;
    const doc = docOf(map);
    const rows = [...(doc.querySelector('.donut table')?.querySelectorAll('tbody tr') ?? [])];
    const outside = rows.find((r) => text(r.querySelector('th')) === 'Outside');
    const cells = [...(outside?.querySelectorAll('td') ?? [])].map((td) => text(td));
    expect(cells[1]).not.toBe('0%');
    expect(cells[0]).toBe('<1 min');
  });
});

/** WCAG relative luminance of `#rrggbb`. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
};

describe('the matrix', () => {
  it('every number in the matrix has at least 4.5:1 against its square', () => {
    const map: StoryMap = structuredClone(build(generated(120, 110, 30), { title: 'Long' }).map);
    // Every shade: the pairs share 1 to 8 scenes.
    map.pairs.forEach((p, i) => {
      p.scenes = (i % 8) + 1;
    });
    const doc = docOf(map);
    const style = doc.querySelector('style')?.textContent ?? '';
    // The screen palette: the first rule for each colour (print redefines them later).
    const vars = new Map<string, string>();
    for (const m of style.matchAll(/--([a-z0-9]+):(#[0-9a-f]{6})/g)) {
      if (!vars.has(m[1] as string)) vars.set(m[1] as string, m[2] as string);
    }
    const colour = (value: string) => {
      const v = value.trim();
      return v.startsWith('var(') ? (vars.get(v.slice(6, -1)) as string) : v;
    };
    const rule = (selector: string) => {
      const at = style.indexOf(`${selector}{`);
      const body = style.slice(at + selector.length + 1, style.indexOf('}', at));
      return colour(/fill:([^;}]+)/.exec(body)?.[1] ?? '');
    };
    const cells = [...doc.querySelectorAll('svg.mat rect.m')];
    expect(cells.length).toBeGreaterThan(0);
    const levels = new Set<string>();
    for (const cell of cells) {
      const label = cell.nextElementSibling;
      if (!label?.classList.contains('mv')) continue;
      const level = [...cell.classList].find((c) => /^l\d$/.test(c)) as string;
      const fill = rule(`.mat .${level}`);
      const ink = rule(label.classList.contains('hi') ? '.mat .mv.hi' : '.mat .mv');
      expect(contrast(fill, ink)).toBeGreaterThanOrEqual(4.5);
      levels.add(level);
    }
    expect([...levels].sort()).toEqual(['l1', 'l2', 'l3', 'l4']);
  });

  it('two leads with the same initial get two letters under their columns', () => {
    const map: StoryMap = structuredClone(build(generated(60, 40, 10), { title: 'X' }).map);
    Object.assign(map.characters[0] as object, {
      name: 'Dora',
      first: 'Dora',
      rest: '',
      initial: 'D',
    });
    Object.assign(map.characters[1] as object, {
      name: 'Dev',
      first: 'Dev',
      rest: '',
      initial: 'D',
    });
    const labels = [...docOf(map).querySelectorAll('svg.mat text.ml.col')].map((t) => text(t));
    expect(labels.slice(0, 2)).toEqual(['Do', 'De']);
  });
});

describe('a long story with no acts', () => {
  it('folds in blocks of 50 scenes, the first open', () => {
    const source = generated(300, 200, 60).replace(/^# Act .*\n/gm, '');
    const map = build(source, { title: 'Long Shore' }).map;
    expect(map.acts).toHaveLength(0);
    expect(map.scenes).toHaveLength(200);
    const doc = docOf(map);
    const folds = [...doc.querySelectorAll('section#scenes > details.fold')];
    expect(folds.map((f) => text(f.querySelector('summary')))).toEqual([
      'Scenes 1–50',
      'Scenes 51–100',
      'Scenes 101–150',
      'Scenes 151–200',
    ]);
    expect(folds.map((f) => f.hasAttribute('open'))).toEqual([true, false, false, false]);
    expect(doc.querySelectorAll('section#scenes li.sc')).toHaveLength(200);
    expect(folds[1]?.querySelector('li.sc')?.id).toBe('s51');
  });
});

describe('smaller points', () => {
  it('leads past the seventh colour are grey, not a repeat', () => {
    const map = build(generated(120, 110, 30), { title: 'Long Shore' }).map;
    const leads = map.characters.filter((c) => c.lead && !c.voice);
    expect(leads.length).toBe(8);
    const colours = leads.map((c) => c.color).filter((c) => c !== null);
    expect(new Set(colours).size).toBe(colours.length);
    const eighth = leads[7] as (typeof leads)[number];
    expect(eighth.color).toBeNull();
    expect(chip(eighth, 7)).toMatch(/class="chip lesser"/);
    // The card stays.
    expect(docOf(map).querySelectorAll('.card')).toHaveLength(8);
  });

  it('the pace chart has no tooltip per bar: its table lists every scene', () => {
    const doc = docOf(build(generated(60, 40, 10), { title: 'X' }).map);
    expect(doc.querySelectorAll('svg.pace rect title')).toHaveLength(0);
    expect(doc.querySelectorAll('.pacefig details tbody tr')).toHaveLength(40);
  });

  it('the ruler steps include 50, 100, and 200', () => {
    expect(rulerSteps(250).step).toBe(50);
    expect(rulerSteps(500).step).toBe(100);
    expect(rulerSteps(1000).step).toBe(200);
    for (const pages of [7, 40, 120, 250, 500, 1000]) {
      const { step, tick } = rulerSteps(pages);
      expect(Number.isInteger(step / tick)).toBe(true);
    }
  });

  it('chip initials stay dark in print', () => {
    const style = docOf(build(generated(60, 40, 10), { title: 'X' }).map).querySelector('style');
    expect(style?.textContent).toMatch(/@media print\{[^}]*\.chip\{color:#0c1315\}/);
  });
});
