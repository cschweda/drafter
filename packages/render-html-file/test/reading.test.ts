import type { Block } from '@drafter/fountain';
import { describe, expect, it } from 'vitest';
import { CHARACTER_COLORS, characterKey, readingHtml } from '../src/reading';
import { colorRules } from '../src/rules';
import { dom, type Laid, lay, SCREENPLAY, STAGE_PLAY, stagePlay } from './scripts';

function read(laid: Laid, notes: 'leave-out' | 'include' = 'leave-out') {
  const out = readingHtml(laid.doc, laid.layout, notes);
  return { out, host: dom(out.html) };
}

/** Text with all whitespace taken out, so a line break and a space compare equal. */
const squash = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, '');

/** Every speech in the source, in order: the cue's name and the words said. */
function speechesOf({ doc }: Laid): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  doc.blocks.forEach((block, i) => {
    if (block.kind !== 'character') return;
    let said = '';
    for (let j = i + 1; j < doc.blocks.length; j++) {
      const next = doc.blocks[j] as Block;
      if (next.kind !== 'dialogue' && next.kind !== 'parenthetical' && next.kind !== 'lyric') break;
      if (next.kind === 'dialogue') said += next.sem.text;
    }
    out.push([block.sem.name, squash(said)]);
  });
  return out;
}

/** The Reading view's speeches, in order: the name (without its extension) and the words said. */
function speechesIn(host: HTMLElement): Array<[string, string]> {
  return [...host.querySelectorAll('.speech')].map((speech) => {
    const who = speech.querySelector('.who')?.cloneNode(true) as HTMLElement;
    who.querySelector('.ext')?.remove();
    const said = [...speech.querySelectorAll('.said > :not(.paren)')]
      .map((p) => p.textContent)
      .join('');
    return [who.textContent ?? '', squash(said)];
  });
}

/** The character color class (`k3`) of a speech's name. */
const colorOf = (speech: Element) =>
  [...(speech.querySelector('.who')?.classList ?? [])].find((c) => /^k\d+$/.test(c));

describe('characterKey', () => {
  it('folds case, extensions, the dual mark, and spacing to one name', () => {
    for (const cue of [
      'Tom',
      'TOM',
      'TOM (V.O.)',
      "TOM (CONT'D)",
      ' tom  (O.S.) (CONT’D) ^',
      'TOM ^',
    ]) {
      expect(characterKey(cue), cue).toBe('TOM');
    }
    expect(characterKey('Mary  Ann (V.O.)')).toBe('MARY ANN');
    expect(characterKey('@McAllister')).toBe('MCALLISTER');
    expect(characterKey('TOM ((x))')).toBe('TOM');
    expect(characterKey('TOM (V.O. (sort of)) (CONT’D)')).toBe('TOM');
    expect(characterKey('ANN (B) LEE')).toBe('ANN LEE');
  });

  it('takes linear time on a long cue full of parentheses', () => {
    const cue = `${'('.repeat(50_000)}TOM${')'.repeat(50_000)}`;
    const started = performance.now();
    characterKey(cue);
    expect(performance.now() - started).toBeLessThan(500);
  });
});

describe('readingHtml', () => {
  it('every speech appears once, in order', () => {
    const laid = lay(SCREENPLAY);
    const { host } = read(laid);
    const expected = speechesOf(laid);
    expect(expected.length).toBe(6);
    expect(speechesIn(host)).toEqual(expected);
  });

  it('action, transitions, centered, and lyrics have their elements', () => {
    const { host } = read(lay(SCREENPLAY));
    const reading = host.querySelector('section.reading');
    expect(reading?.hasAttribute('hidden')).toBe(true);
    const action = [...host.querySelectorAll('.reading > p:not([class])')].map(
      (p) => p.textContent,
    );
    // The note's place closes up, as on the page.
    expect(action[0]?.replace(/ +/g, ' ')).toBe(
      'Rain needles the window. A kettle begins to shake on the stove.',
    );
    expect(host.querySelector('p.tr')?.textContent).toBe('CUT TO:');
    expect(host.querySelector('p.ct')?.textContent).toBe('THE END');
    expect(host.querySelector('p.ly')?.textContent).toBe(
      'Bring the boats home, bring the boats home',
    );
    // Emphasis keeps its classes.
    const styled = host.querySelector('.reading > p .b');
    expect(styled?.textContent).toBe('The wind');
    expect(host.querySelector('.reading > p .i')?.textContent).toBe('scarf');
    expect(host.querySelector('.reading > p .u')?.textContent).toBe('flings');
  });

  it('scene headings and sections are headings, with the ids the band links to', () => {
    const laid = lay(SCREENPLAY, undefined, { sceneNumbers: 'all' });
    const { host } = read(laid);
    const acts = [...host.querySelectorAll('h2')];
    expect(acts.map((h) => h.textContent)).toEqual(['ACT ONE', 'ACT TWO']);
    const scenes = [...host.querySelectorAll('h3.sh')];
    expect(scenes.map((h) => h.textContent)).toEqual([
      '1 INT. LIGHTHOUSE KITCHEN - NIGHT',
      '2 EXT. CLIFF PATH - CONTINUOUS',
      '3 INT. LANTERN ROOM - LATER',
    ]);
    expect(scenes[0]?.querySelector('.sn')?.textContent).toBe('1');
    laid.doc.blocks.forEach((block, i) => {
      if (block.kind === 'section' || block.kind === 'scene_heading') {
        expect(host.querySelector(`#r-b-${i}`)?.tagName, `block ${i}`).toMatch(/^H[2-6]$/);
      }
    });
  });

  it('heading levels never skip, whatever depths the sections use', () => {
    const source = `### A

INT. ONE - DAY

X.

# B

## B1

INT. TWO - DAY

Y.

### C

#### D

INT. THREE - DAY

Z.
`;
    const { host } = read(lay(source));
    const levels = [...host.querySelectorAll('h1, h2, h3, h4, h5, h6')].map((h) => [
      h.textContent,
      Number(h.tagName[1]),
    ]);
    expect(levels).toEqual([
      ['A', 2],
      ['INT. ONE - DAY', 3],
      ['B', 2],
      ['B1', 3],
      ['INT. TWO - DAY', 4],
      ['C', 4],
      ['D', 5],
      ['INT. THREE - DAY', 6],
    ]);
  });

  it('prints no scene number when the layout prints none', () => {
    const { host } = read(lay(SCREENPLAY, undefined, { sceneNumbers: 'none' }));
    expect(host.querySelector('.sn')).toBeNull();
    expect(host.querySelector('h3.sh')?.textContent).toBe('INT. LIGHTHOUSE KITCHEN - NIGHT');
  });

  it('a stage play reads the same way', () => {
    const laid = lay(STAGE_PLAY, stagePlay);
    const { host } = read(laid);
    expect([...host.querySelectorAll('h2')].map((h) => h.textContent)).toEqual([
      'ACT ONE',
      'ACT TWO',
    ]);
    expect([...host.querySelectorAll('h3')].map((h) => h.textContent)).toEqual([
      'SCENE 1',
      'SCENE 2',
    ]);
    const directions = [...host.querySelectorAll('.reading > p')].map((p) => p.textContent);
    expect(directions).toEqual([
      'A ferry waiting room. Benches. A clock that has stopped.',
      'The quay at dawn.',
    ]);
    expect(speechesIn(host)).toEqual(speechesOf(laid));
    expect(host.querySelector('.speech .paren')?.textContent).toBe('(to no one)');
  });

  it('dual dialogue is side by side', () => {
    const { host } = read(lay(SCREENPLAY));
    const duals = [...host.querySelectorAll('.dual')];
    expect(duals.length).toBe(1);
    const pair = [...(duals[0]?.children ?? [])];
    expect(pair.map((s) => s.className)).toEqual(['speech', 'speech']);
    expect(speechesIn(duals[0] as HTMLElement).map(([who]) => who)).toEqual(['TESSA', 'DECLAN']);
  });

  it('shows the extension in grey beside the name, and the parenthetical above the words', () => {
    const { host } = read(lay(SCREENPLAY));
    const first = host.querySelector('.speech') as HTMLElement;
    expect(first.querySelector('.who')?.textContent).toBe('MARA (V.O.)');
    expect(first.querySelector('.ext')?.textContent?.trim()).toBe('(V.O.)');
    const said = [...(first.querySelector('.said')?.children ?? [])];
    expect(said[0]?.className).toBe('paren');
    expect(said[0]?.textContent).toBe('(not looking up)');
    expect(said[1]?.querySelectorAll('br').length).toBe(1);
  });

  it('a ^ speech with no free speech before it stands alone, as on the page', () => {
    const source = `INT. HALL - DAY

The door opens.

ANNE ^
Hello?

BEN
Here.

CARL ^
And here.

DORA ^
Me too.
`;
    const { host } = read(lay(source));
    const reading = host.querySelector('.reading') as HTMLElement;
    // ANNE alone; BEN and CARL side by side; DORA alone again, since CARL is taken.
    expect(
      [...reading.children]
        .filter((e) => e.matches('.speech, .dual'))
        .map((e) =>
          e.matches('.dual')
            ? `dual:${speechesIn(e as HTMLElement).map(([w]) => w)}`
            : speechesIn(dom(e.outerHTML))[0]?.[0],
        ),
    ).toEqual(['ANNE', 'dual:BEN,CARL', 'DORA']);
  });

  it("one color for Tom, TOM, TOM (V.O.), and TOM (CONT'D)", () => {
    const source = `INT. HALL - DAY

@Tom
One.

TOM
Two.

ANNE
Three.

TOM (V.O.)
Four.

TOM (CONT'D)
Five.
`;
    const { host } = read(lay(source));
    const colors = [...host.querySelectorAll('.speech')].map(colorOf);
    expect(colors).toEqual(['k0', 'k0', 'k1', 'k0', 'k0']);
  });

  it('colors follow first speech and repeat past the palette', () => {
    const n = CHARACTER_COLORS.length + 3;
    const names = Array.from({ length: n }, (_, i) => `SPEAKER ${String.fromCharCode(65 + i)}`);
    // Each speaks, in order, then the first speaks again.
    const source = `INT. ROOM - DAY\n\n${[...names, names[0]].map((name) => `${name}\nHello.\n`).join('\n')}`;
    const { out, host } = read(lay(source));
    const colors = [...host.querySelectorAll('.speech')].map(colorOf);
    expect(colors).toEqual([...names.map((_, i) => `k${i % CHARACTER_COLORS.length}`), 'k0']);
    // Exactly the palette's rules, once each.
    expect(out.rules).toBe(colorRules(CHARACTER_COLORS));
  });

  it('writes rules only for the colors used', () => {
    const { out } = read(lay(STAGE_PLAY, stagePlay));
    expect(out.rules).toBe(colorRules(CHARACTER_COLORS.slice(0, 2)));
    expect(read(lay('A gull.\n')).out.rules).toBe('');
  });

  it('notes are left out by default and appear as asides when included', () => {
    const laid = lay(SCREENPLAY);
    const without = read(laid).host;
    expect(without.querySelector('aside')).toBeNull();
    expect(without.textContent).not.toContain('Make the rain louder');
    expect(without.textContent).not.toContain('[[');

    const { host } = read(laid, 'include');
    const asides = [...host.querySelectorAll('aside.note')].map((a) => a.textContent);
    // The scene's [[Color: Blue]] is the Outline's, not a note to a reader.
    expect(asides).toEqual(['Make the rain louder here.', 'Jonah should sound tired, not cross.']);
    // Each at its place: after what holds it, before what follows.
    const order = [...host.querySelectorAll('.reading > *')].map((e) => e.textContent ?? '');
    const at = (text: string) => order.findIndex((t) => t.includes(text));
    expect(at('Make the rain louder')).toBe(at('Rain needles') + 1);
    expect(at('sound tired')).toBe(at('Somebody has to') + 1);
    expect(host.textContent).not.toContain('[[');
  });

  it("leaves out Drafter's own keyed notes, and keeps the writer's own heads", () => {
    const source = `INT. HALL - DAY [[Goal: get the key]] [[Storyline: A, B]]

Ann waits. [[Setup: the key]] [[payoff : the door]] [[Card: Ann waits for Ben.]]

[[Note: fix this]]

[[Sam: too long?]] [[TODO: trim]] [[Color: red]]

Ben comes. [[Conflict: he forgot]] [[Outcome: no key]] [[Shift: up]] [[plain words]]
`;
    const { host } = read(lay(source), 'include');
    expect([...host.querySelectorAll('aside.note')].map((a) => a.textContent)).toEqual([
      'Note: fix this',
      'Sam: too long?',
      'TODO: trim',
      'plain words',
    ]);
  });

  it('boneyard never appears, even with notes included', () => {
    const laid = lay(SCREENPLAY);
    for (const notes of ['leave-out', 'include'] as const) {
      const { host } = read(laid, notes);
      expect(host.textContent).not.toContain('I cut this speech');
      expect(host.textContent).not.toContain('/*');
      // Nor the synopsis, which doesn't print.
      expect(host.textContent).not.toContain("Jonah won't let it go");
    }
  });

  it('an unknown kind falls back to a paragraph', () => {
    const laid = lay(SCREENPLAY);
    const i = laid.doc.blocks.findIndex((b) => b.kind === 'transition');
    const blocks = laid.doc.blocks.map((block, k) =>
      k === i ? ({ ...block, kind: 'flashback' } as unknown as Block) : block,
    );
    const { host } = read({ ...laid, doc: { ...laid.doc, blocks } });
    expect(host.querySelector('.tr')).toBeNull();
    const p = [...host.querySelectorAll('.reading > p')].find((e) => e.textContent === 'CUT TO:');
    expect(p?.className).toBe('');
  });

  it('leaves out the title page, which the header carries', () => {
    const { host } = read(lay(SCREENPLAY));
    expect(host.textContent).not.toContain('Wren Okafor');
    expect(host.textContent).not.toContain('The Salt Road');
  });

  it('hostile cue and dialogue stay text', () => {
    const hostile = '<script>alert(1)</script><img src=x onerror="alert(2)"> & \'"';
    const source = `INT. HALL - DAY [[${hostile}]]

@<B>Eve</B> & "Co"
(${hostile})
${hostile}

${hostile}
`;
    const { out, host } = read(lay(source), 'include');
    expect(host.querySelector('script, img, b')).toBeNull();
    expect(host.querySelector('.who')?.textContent).toBe('<B>Eve</B> & "Co"');
    expect(host.querySelector('.said > p:not(.paren)')?.textContent).toBe(hostile);
    expect(host.querySelector('.paren')?.textContent).toBe(`(${hostile})`);
    expect(host.querySelector('aside')?.textContent).toBe(hostile);
    expect(out.html).not.toMatch(/style=/i);
  });

  it('characters outside Courier Prime are kept', () => {
    const text = '东京の夜 🎬 café naïve Ἀθῆναι שלום';
    const { host } = read(lay(`INT. 东京 - NIGHT\n\n${text}\n\n@Mírë\n${text}\n`));
    expect(host.querySelector('h2.sh')?.textContent).toBe('INT. 东京 - NIGHT');
    expect(host.querySelector('.reading > p')?.textContent).toBe(text);
    expect(host.querySelector('.who')?.textContent).toBe('Mírë');
    expect(host.querySelector('.said p')?.textContent).toBe(text);
  });
});

describe('CHARACTER_COLORS', () => {
  it('has a color for each palette, distinct, as #rrggbb', () => {
    expect(CHARACTER_COLORS.length).toBeGreaterThanOrEqual(8);
    for (const pair of CHARACTER_COLORS) {
      expect(pair.dark).toMatch(/^#[0-9a-f]{6}$/);
      expect(pair.light).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect(new Set(CHARACTER_COLORS.map((p) => p.dark)).size).toBe(CHARACTER_COLORS.length);
    expect(new Set(CHARACTER_COLORS.map((p) => p.light)).size).toBe(CHARACTER_COLORS.length);
  });
});
