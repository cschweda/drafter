import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { MAX_ANSWER_CHARS } from '../src/envelope';
import { answerOf, type Connected, connect, refusalOf } from './connect';
import { EPISODE_101, makeLibrary } from './library';
import { put, tempFolder } from './temp';

interface Lines {
  character: {
    name: string;
    speeches: number;
    words: number;
    share: number;
    scenes: number;
    first: number | null;
    last: number | null;
  };
  speeches: Array<{
    scene: number | null;
    extension: string | null;
    dual: boolean;
    lines: Array<{ kind: 'parenthetical' | 'dialogue'; text: string }>;
  }>;
  left_out: { notes: number; boneyard: number };
  next?: string;
}

let open: Connected | undefined;
afterEach(async () => {
  await open?.close();
  open = undefined;
});

const EP101 = `Scripts/Signal Hill/${EPISODE_101}`;

const lines = async (args: object) =>
  answerOf<Lines>(await (open as Connected).call('character_lines', args));

/** An original scene of three speakers, one forced `@McBRIDE`, one `ÉLODIE`, and a dual pair. */
const NAMES = `INT. HARBOUR OFFICE - NIGHT

ÉLODIE
(quietly)
The ferry's late.

@McBRIDE (V.O.)
It's always late.

ÉLODIE (CONT'D)
Not this late. [[she's lying]]

INT. QUAY - LATER

@McBRIDE
Left.

ÉLODIE ^
Right.

@McBRIDE
(beat)
Fine.
`;

describe('character_lines', () => {
  it('a character is found by any case and without the extension', async () => {
    const { scripts } = makeLibrary(tempFolder());
    open = await connect({ folders: [scripts] });
    const june = await lines({ script: EP101, character: 'june' });
    expect(june.character.name).toBe('JUNE');
    for (const name of ['JUNE', 'June', 'JUNE (V.O.)', "JUNE (CONT'D)", ' june ']) {
      expect((await lines({ script: EP101, character: name })).character).toEqual(june.character);
    }
    await open.close();
    const dir = tempFolder();
    put(join(dir, 'Lib', 'names.fountain'), NAMES);
    open = await connect({ folders: [join(dir, 'Lib')] });
    const mcbride = await lines({ script: 'Lib/names.fountain', character: '@McBRIDE' });
    expect(mcbride.character).toMatchObject({ name: 'McBRIDE', speeches: 3 });
    expect((await lines({ script: 'Lib/names.fountain', character: 'mcbride' })).character).toEqual(
      mcbride.character,
    );
    const elodie = await lines({ script: 'Lib/names.fountain', character: 'élodie' });
    expect(elodie.character).toMatchObject({ name: 'ÉLODIE', speeches: 3 });
  });

  it('speeches in order with extension, parenthetical, and dual marked', async () => {
    const dir = tempFolder();
    put(join(dir, 'Lib', 'names.fountain'), NAMES);
    open = await connect({ folders: [join(dir, 'Lib')] });
    const elodie = await lines({ script: 'Lib/names.fountain', character: 'ÉLODIE' });
    expect(elodie.speeches).toEqual([
      {
        scene: 1,
        extension: null,
        dual: false,
        lines: [
          { kind: 'parenthetical', text: '(quietly)' },
          { kind: 'dialogue', text: "The ferry's late." },
        ],
      },
      {
        scene: 1,
        extension: "(CONT'D)",
        dual: false,
        lines: [{ kind: 'dialogue', text: 'Not this late. ' }],
      },
      { scene: 2, extension: null, dual: true, lines: [{ kind: 'dialogue', text: 'Right.' }] },
    ]);
    expect(elodie.left_out).toEqual({ notes: 1, boneyard: 0 });
    expect(elodie.character).toMatchObject({ scenes: 2, first: 1, last: 2 });
    const included = await lines({
      script: 'Lib/names.fountain',
      character: 'ÉLODIE',
      include: ['notes'],
    });
    expect(included.speeches[1]?.lines[0]?.text).toBe("Not this late. [[she's lying]]");
    const mcbride = await lines({ script: 'Lib/names.fountain', character: 'McBride' });
    expect(mcbride.speeches.map((s) => [s.extension, s.dual])).toEqual([
      ['(V.O.)', false],
      [null, true],
      [null, false],
    ]);
    expect(mcbride.speeches[2]?.lines).toEqual([
      { kind: 'parenthetical', text: '(beat)' },
      { kind: 'dialogue', text: 'Fine.' },
    ]);
  });

  it('from and to limit the scenes', async () => {
    const { scripts } = makeLibrary(tempFolder());
    open = await connect({ folders: [scripts] });
    const all = await lines({ script: EP101, character: 'ELI' });
    const some = await lines({ script: EP101, character: 'ELI', from: '5', to: '8' });
    expect(some.speeches.length).toBeGreaterThan(0);
    expect(some.speeches.length).toBeLessThan(all.speeches.length);
    expect(some.speeches.every((s) => (s.scene as number) >= 5 && (s.scene as number) <= 8)).toBe(
      true,
    );
    expect(some.character).toEqual(all.character);
    const fromOnly = await lines({ script: EP101, character: 'ELI', from: '11' });
    expect(fromOnly.speeches.every((s) => (s.scene as number) >= 11)).toBe(true);
    const backwards = refusalOf(
      await (open as Connected).call('character_lines', {
        script: EP101,
        character: 'ELI',
        from: '8',
        to: '5',
      }),
    );
    expect(backwards.error).toMatch(/comes before/);
  });

  it('a name nobody speaks refuses with the nearest names', async () => {
    const { scripts } = makeLibrary(tempFolder());
    open = await connect({ folders: [scripts] });
    const body = refusalOf(
      await (open as Connected).call('character_lines', { script: EP101, character: 'Jane' }),
    );
    expect(body.error).toBe('No one called Jane speaks in this script.');
    expect(body.names).toHaveLength(5);
    expect((body.names as string[])[0]).toBe('JUNE');
  });

  it('a document has no characters', async () => {
    const { scripts } = makeLibrary(tempFolder());
    open = await connect({ folders: [scripts] });
    const body = refusalOf(
      await (open as Connected).call('character_lines', {
        script: 'Scripts/Signal Hill/Series bible.md',
        character: 'June',
      }),
    );
    expect(body.error).toMatch(/document/);
  });
});

describe('character_lines in parts and around notes', () => {
  it('a speech too long for a page comes in parts, each under the cap, and they rejoin', async () => {
    const dir = tempFolder();
    const line = 'June reads the log aloud, every entry, in the same patient voice. ';
    const long = Array.from({ length: 8_000 }, (_, i) => `${line}Entry ${i}.`).join('\n');
    expect(long.split(/\s+/).length).toBeGreaterThan(100_000);
    put(
      join(dir, 'Lib', 'log.fountain'),
      `INT. KITCHEN - NIGHT\n\nJUNE\n(reading)\n${long}\n\nELI\nGran?\n\nJUNE\nNearly done.\n`,
    );
    open = await connect({ folders: [join(dir, 'Lib')] });
    const rebuilt: Array<{ kind: string; text: string }> = [];
    const seen: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const result = await open.call('character_lines', {
        script: 'Lib/log.fountain',
        character: 'JUNE',
        ...(cursor ? { cursor } : {}),
      });
      expect((result.content[0] as { text: string }).text.length).toBeLessThanOrEqual(
        MAX_ANSWER_CHARS,
      );
      const page = answerOf<Lines & { speeches: Array<{ part?: number; parts?: number }> }>(result);
      for (const speech of page.speeches) {
        if (speech.parts !== undefined) {
          seen.push(`${speech.part}/${speech.parts}`);
          for (const each of speech.lines as Array<{
            kind: string;
            text: string;
            continues?: true;
          }>) {
            const last = rebuilt.at(-1);
            if (each.continues && last) last.text += each.text;
            else rebuilt.push({ kind: each.kind, text: each.text });
          }
        } else {
          expect(speech.lines).toEqual([{ kind: 'dialogue', text: 'Nearly done.' }]);
        }
      }
      cursor = page.next;
      pages++;
    } while (cursor && pages < 100);
    expect(seen.length).toBeGreaterThan(1);
    expect(seen.at(-1)).toBe(`${seen.length}/${seen.length}`);
    expect(rebuilt).toEqual([
      { kind: 'parenthetical', text: '(reading)' },
      { kind: 'dialogue', text: long },
    ]);
  });

  it('a note between a cue’s lines is counted when left out and shown when included', async () => {
    const dir = tempFolder();
    put(
      join(dir, 'Lib', 'aside.fountain'),
      'INT. KITCHEN - NIGHT\n\nJUNE\n(beat)\n[[an aside]]\nHello.\n/* a cut line */\nGoodbye.\n',
    );
    open = await connect({ folders: [join(dir, 'Lib')] });
    const plain = await lines({ script: 'Lib/aside.fountain', character: 'JUNE' });
    expect(plain.left_out).toEqual({ notes: 1, boneyard: 1 });
    expect(JSON.stringify(plain.speeches)).not.toContain('aside');
    expect(JSON.stringify(plain.speeches)).toContain('Goodbye.');
    const shown = await lines({
      script: 'Lib/aside.fountain',
      character: 'JUNE',
      include: ['notes', 'boneyard'],
    });
    expect(shown.left_out).toEqual({ notes: 0, boneyard: 0 });
    const text = JSON.stringify(shown.speeches);
    expect(text).toContain('[[an aside]]');
    expect(text).toContain('/* a cut line */');
  });

  it('a note inside a heading or a cue never shows in names or headings', async () => {
    const dir = tempFolder();
    put(
      join(dir, 'Lib', 'marked.fountain'),
      'INT. HOUSE [[secret-one]] - DAY /* bone-two */\n\nJUNE [[secret-three]]\nHi.\n\nELI /* bone-four */\nYo.\n',
    );
    open = await connect({ folders: [join(dir, 'Lib')] });
    const texts = [
      (await open.call('script_overview', { script: 'Lib/marked.fountain' })).content,
      (await open.call('read_scene', { script: 'Lib/marked.fountain', scene: '1' })).content,
      (await open.call('character_lines', { script: 'Lib/marked.fountain', character: 'eli' }))
        .content,
      (await open.call('character_lines', { script: 'Lib/marked.fountain', character: 'Nobody' }))
        .content,
    ].map((content) => (content[0] as { text: string }).text);
    for (const text of texts)
      for (const secret of ['secret-one', 'bone-two', 'secret-three', 'bone-four'])
        expect(text).not.toContain(secret);
    const overview = JSON.parse(texts[0] as string);
    expect(overview.scenes[0].heading).toMatch(/^INT\. HOUSE +- DAY$/);
    expect(overview.scenes[0].who.sort()).toEqual(['ELI', 'JUNE']);
    expect(JSON.parse(texts[3] as string).names.sort()).toEqual(['ELI', 'JUNE']);
  });
});
