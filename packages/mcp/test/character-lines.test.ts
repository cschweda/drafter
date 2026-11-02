import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
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
