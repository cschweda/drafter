import { parse } from '@drafter/fountain';
import { sceneIndex } from '@drafter/outline';
import { describe, expect, test } from 'vitest';
import { actMood, hookOf, sceneLine } from '../src';
import { build, HARBOUR, screenplay } from './scripts';

// What happens in each scene, an act's mood, a character's hook, and the threads (story-map
// design §3.2–§3.4, §4.2; Calls 7–9, 13).

/** An original two-act script with synopses, introductions, and setups. */
const DRIFT = `Title: Drift
Author: Ines Mortlake

# Act One: Fog
= The island wakes to a fog that will not lift. The ferry is late.

INT. WEATHER STATION - DAWN
= Mara reads the glass and does not like what it says, not one bit, not at all today.

MARA lifts the lamp. ODILE VANCE (60s), a ferry pilot who never once missed a tide, waits.

MARA
The glass has dropped again since midnight. [[Setup: the glass]]

EXT. JETTY - DAY

Fog to the waterline. Dr. Rhee counts the moorings while PIP (9) — the harbourmaster's son — skims stones off the end. [[Setup: the moorings]]

PIP
One of the ropes is gone.

INT. BOAT SHED - DAY

[[Setup: the red boat]]

MARA
Where is the red boat?

# Act Two: Clear

INT. WEATHER STATION - NIGHT

The glass climbs. Mara laughs for the first time in days. [[Payoff: the glass]]

ODILE
Told you it would turn.

EXT. JETTY - NIGHT

Lanterns along the jetty. [[Payoff: the moorings]]

[[Payoff: the moorings]]
`;

const drift = build(DRIFT, { title: 'Drift' });
const read = (source: string) => {
  const doc = parse(source);
  return { doc, index: sceneIndex(doc, screenplay) };
};
const NAMES = new Set(['MARA', 'ODILE VANCE', 'PIP', 'ODILE']);

describe('what happens in each scene', () => {
  test('a scene’s line is its first synopsis, first sentence, 12 words at most', () => {
    const { doc, index } = read(DRIFT);
    expect(sceneLine(index.scenes[0] as never, doc, NAMES)).toBe(
      'Mara reads the glass and does not like what it says, not…',
    );
    expect(drift.map.scenes[0]?.what).toBe(
      'Mara reads the glass and does not like what it says, not…',
    );
  });

  test('without a synopsis, its first action sentence', () => {
    // "Dr." doesn't end a sentence.
    expect(drift.map.scenes[1]?.what).toBe('Fog to the waterline.');
    expect(drift.map.scenes[3]?.what).toBe('The glass climbs.');
    const { doc, index } = read('INT. HUT - DAY\n\nDr. Rhee checks the wind. It is still.\n');
    expect(sceneLine(index.scenes[0] as never, doc, NAMES)).toBe('Dr. Rhee checks the wind.');
  });

  test('known names in capitals become title case', () => {
    const { doc, index } = read(
      "INT. HUT - DAY\n\nMARA lifts the lamp for ODILE VANCE and MARA'S dog. A BANG outside.\n",
    );
    expect(sceneLine(index.scenes[0] as never, doc, NAMES)).toBe(
      "Mara lifts the lamp for Odile Vance and Mara's dog.",
    );
    const lamp = read('INT. HUT - DAY\n\nMARA lifts the lamp.\n');
    expect(sceneLine(lamp.index.scenes[0] as never, lamp.doc, NAMES)).toBe('Mara lifts the lamp.');
    // An age after a name is the hook's, not the summary's; the rest of a name in capitals is the name's.
    const aged = read(
      'INT. HUT - DAY\n\nODILE VANCE (60s), a pilot, waits. ODETTE (late 50s) sits.\n',
    );
    expect(sceneLine(aged.index.scenes[0] as never, aged.doc, new Set(['ODILE']))).toBe(
      'Odile Vance, a pilot, waits.',
    );
    const sits = read('INT. HUT - DAY\n\nODETTE (late 50s) sits by the fire.\n');
    expect(sceneLine(sits.index.scenes[0] as never, sits.doc, new Set(['ODETTE']))).toBe(
      'Odette sits by the fire.',
    );
    // A capital that isn't a name stays.
    const bang = read('INT. HUT - DAY\n\nA BANG outside.\n');
    expect(sceneLine(bang.index.scenes[0] as never, bang.doc, NAMES)).toBe('A BANG outside.');
  });

  test('a scene with neither has no line', () => {
    expect(drift.map.scenes[2]?.what).toBeNull();
    const { doc, index } = read('INT. HUT - DAY\n\nMARA\nNothing to see.\n');
    expect(sceneLine(index.scenes[0] as never, doc, NAMES)).toBeNull();
  });

  test('an act’s mood is its first synopsis', () => {
    const { doc, index } = read(DRIFT);
    expect(actMood(index.sections[0] as never, doc)).toBe(
      'The island wakes to a fog that will not lift.',
    );
    expect(actMood(index.sections[1] as never, doc)).toBeNull();
    expect(drift.map.acts.map((a) => a.mood)).toEqual([
      'The island wakes to a fog that will not lift.',
      null,
    ]);
  });
});

describe('hooks', () => {
  test('a hook and an age come from the introduction', () => {
    const { doc, index } = read(
      'INT. WHEELHOUSE - DAY\n\nODILE VANCE (60s), a ferry pilot who never once missed a tide, waits.\n\nODILE VANCE\nWe go at six.\n',
    );
    expect(hookOf(doc, index, 'ODILE VANCE')).toEqual({
      hook: 'a ferry pilot who never once missed a…',
      age: '60s',
    });
    // The cue is ODILE; the introduction names her in full, and the rest of the name is passed over.
    expect(drift.map.characters.find((c) => c.key === 'ODILE')).toMatchObject({
      age: '60s',
      hook: 'a ferry pilot who never once missed a…',
    });
    const pip = drift.map.characters.find((c) => c.key === 'PIP');
    expect(pip).toMatchObject({ age: '9', hook: "the harbourmaster's son" });
    const mara = drift.map.characters.find((c) => c.key === 'MARA');
    expect(mara).toMatchObject({ age: null, hook: 'lifts the lamp' });
  });

  test('an age holds a digit and is short', () => {
    const { doc, index } = read(
      'INT. HUT - DAY\n\nJUNE (late 30s) mends a sail. KIT (barefoot) sweeps. LOU (a very long aside here), sings.\n\nJUNE\nHold still.\n\nKIT\nI am still.\n\nLOU\nI am singing.\n',
    );
    expect(hookOf(doc, index, 'JUNE')).toEqual({ age: 'late 30s', hook: 'mends a sail' });
    expect(hookOf(doc, index, 'KIT').age).toBeNull();
    expect(hookOf(doc, index, 'LOU').age).toBeNull();
  });

  test('an edited hook wins and an empty one hides it', () => {
    const map = build(DRIFT, { hooks: { MARA: 'reads the weather', PIP: '' } }).map;
    expect(map.characters.find((c) => c.key === 'MARA')?.hook).toBe('reads the weather');
    expect(map.characters.find((c) => c.key === 'PIP')).toMatchObject({ hook: null, age: '9' });
  });

  test('no capitals, no hook', () => {
    const { doc, index } = read('INT. HUT - DAY\n\nMara walks in, tired.\n\nMARA\nHello again.\n');
    expect(hookOf(doc, index, 'MARA')).toEqual({ hook: null, age: null });
    const uncased = read('INT. 家 - DAY\n\n春子が来る。\n\n春子\nただいま。\n');
    expect(hookOf(uncased.doc, uncased.index, '春子')).toEqual({ hook: null, age: null });
  });
});

describe('threads', () => {
  test('threads join a setup to its payoff by scene, and an unpaid setup has no end', () => {
    expect(drift.map.threads).toEqual([
      { label: 'the glass', from: 1, to: 4 },
      { label: 'the moorings', from: 2, to: 5 },
      { label: 'the red boat', from: 3, to: null },
    ]);
  });

  test('no setups, no threads; threads off, none', () => {
    expect(build(HARBOUR).map.threads).toEqual([]);
    const off = build(DRIFT, {
      include: { summaries: true, lines: true, threads: false, contact: false },
    }).map;
    expect(off.threads).toEqual([]);
    const payoffOnly = build('INT. HUT - DAY\n\nA door. [[Payoff: the door]]\n').map;
    expect(payoffOnly.threads).toEqual([]);
  });

  test('a thread’s label is all the page holds of its notes', () => {
    const html = JSON.stringify(drift.map);
    expect(html).not.toContain('Setup:');
    expect(html).not.toContain('Payoff:');
  });
});

describe('the options', () => {
  test('summaries off and lines off empty the model’s fields', () => {
    const map = build(DRIFT, {
      include: { summaries: false, lines: false, threads: true, contact: false },
    }).map;
    expect(map.scenes.every((s) => s.what === null && s.quote === null)).toBe(true);
    expect(map.acts.every((a) => a.mood === null)).toBe(true);
    expect(map.quotes).toEqual([]);
    expect(map.characters.every((c) => c.signature === null)).toBe(true);
    // Hooks are the characters', not the summaries'.
    expect(map.characters.find((c) => c.key === 'PIP')?.age).toBe('9');
  });
});
