import { readFileSync } from 'node:fs';
import { structureOf } from '@drafter/cm-fountain';
import { type Block, type BlockKind, parse } from '@drafter/fountain';
import { paginate } from '@drafter/layout';
import { lint } from '@drafter/lint';
import { builtins, type Template } from '@drafter/templates';
import { describe, expect, test } from 'vitest';
import { COMMAND_DATA } from '../app/commands/data';
import { barFor } from '../app/editor/element-bar';
import { STARTER_KINDS } from '../app/editor/starter-kinds';
import { buttonsNamed, STARTERS } from '../app/editor/starters';
import { templateIdOf } from '../app/editor/template';

// The guided starters (out-the-door design §1): every element a note explains is that element,
// every button a note names is on the bar, and each opens with no Problems (controller ruling:
// the screenplay's Your turn heading is complete, and its notes say why a heading has a time).

const file = (name: string) =>
  readFileSync(new URL(`../app/editor/sample-scripts/${name}`, import.meta.url), 'utf8');

const screenplay = file('guided-screenplay.fountain');
const stagePlay = file('guided-stage-play.fountain');

const CASES = [
  { name: 'screenplay', text: screenplay, templateId: 'us-screenplay' },
  { name: 'stage play', text: stagePlay, templateId: 'stage-play-standard' },
] as const;

const templateOf = (id: string) => builtins[id] as Template;
const lineOf = (text: string, block: Block) => text.slice(block.span.from, block.span.to);

describe('the guided starters', () => {
  test('are the two starters, in the menus’ order, with the files’ text', () => {
    expect(STARTERS.map((s) => [s.kind, s.command, s.title, s.menuLabel])).toEqual([
      ['screenplay', 'new-guided-screenplay', 'New guided screenplay', 'Guided first screenplay'],
      ['stage-play', 'new-guided-stage-play', 'New guided stage play', 'Guided first stage play'],
    ]);
    expect(STARTERS.map((s) => s.text)).toEqual([screenplay, stagePlay]);
    // The command data takes its list from the text-free half.
    expect(STARTER_KINDS).not.toHaveProperty('0.text');
    for (const s of STARTERS) {
      expect(COMMAND_DATA.find((c) => c.id === s.command)).toMatchObject({
        title: s.title,
        group: 'File',
      });
    }
  });

  test('reads every block as its note says', () => {
    const N = 'note';
    const screenplayKinds: BlockKind[] = [
      // Title page, then How to read this.
      N,
      N,
      'section',
      'synopsis',
      N,
      'scene_heading',
      N,
      'action',
      N,
      'character',
      'dialogue',
      N,
      // TOMAS (O.S.)
      'character',
      'dialogue',
      N,
      // The parenthetical.
      'character',
      'parenthetical',
      'dialogue',
      N,
      // The same character after action.
      'action',
      'character',
      'dialogue',
      N,
      // !SMOKE.
      'action',
      N,
      // @McKAY
      'character',
      'parenthetical',
      'dialogue',
      N,
      'transition',
      N,
      // The second scene, with emphasis.
      'scene_heading',
      'action',
      'character',
      'dialogue',
      'character',
      'dialogue',
      N,
      'boneyard',
      N,
      // Your turn.
      'section',
      N,
      'scene_heading',
      'action',
      'centered',
      N,
    ];
    const stageKinds: BlockKind[] = [
      N,
      N,
      // The cast list, then the page break.
      'centered',
      'action',
      'action',
      N,
      'page_break',
      N,
      // # Act One, ## Scene 1.
      'section',
      N,
      'section',
      N,
      'action',
      'action',
      N,
      // The entrance.
      'action',
      N,
      'character',
      'dialogue',
      'character',
      'parenthetical',
      'dialogue',
      N,
      'character',
      'dialogue',
      'action',
      'character',
      'dialogue',
      // The exit.
      'action',
      N,
      // ## Scene 2, ending on Blackout.
      'section',
      'action',
      'action',
      'character',
      'parenthetical',
      'dialogue',
      'action',
      N,
      // ## Scene 3, Your turn.
      'section',
      N,
      'action',
      'character',
      'dialogue',
      N,
      // The metadata block.
      'boneyard',
    ];
    const expected = { screenplay: screenplayKinds, 'stage play': stageKinds };
    for (const { name, text, templateId } of CASES) {
      const doc = parse(text);
      expect(templateIdOf(doc), name).toBe(templateId);
      expect(
        doc.blocks.map((b) => b.kind),
        name,
      ).toEqual(expected[name]);
    }
  });

  test('lays out with no diagnostics', () => {
    for (const { name, text, templateId } of CASES) {
      const layout = paginate(parse(text), templateOf(templateId));
      expect(layout.diagnostics, name).toEqual([]);
      expect(layout.pages.length, name).toBeGreaterThan(1);
    }
  });

  test('each opens with no Problems', () => {
    for (const { name, text, templateId } of CASES) {
      const problems = lint(parse(text), templateOf(templateId)).filter(
        (d) => d.severity !== 'info',
      );
      expect(
        problems.map((d) => `${d.ruleId}: ${d.message}`),
        name,
      ).toEqual([]);
    }
  });

  test('the screenplay’s headings all have a time of day, and a note says why', () => {
    const doc = parse(screenplay);
    const headings = doc.blocks
      .filter((b) => b.kind === 'scene_heading')
      .map((b) => lineOf(screenplay, b));
    expect(headings).toEqual([
      'INT. CORNER BAKERY - DAY',
      'EXT. BAKERY YARD - NIGHT',
      'INT. YOUR FIRST LOCATION - DAY',
    ]);
    expect(screenplay).toMatch(/\[\[This is a scene heading\.[^\]]*time of day[^\]]*\]\]/);
  });

  test('names only buttons the bar has, and every main button', () => {
    for (const { name, text, templateId } of CASES) {
      const bar = barFor(structureOf(templateOf(templateId)));
      const labels = new Set([...bar.buttons, ...bar.more].map((b) => b.label));
      const named = buttonsNamed(text);
      expect(
        named.filter((label) => !labels.has(label)),
        name,
      ).toEqual([]);
      expect(
        bar.buttons.map((b) => b.label).filter((label) => !named.includes(label)),
        name,
      ).toEqual([]);
    }
    // The screenplay's bar, and the play's.
    expect(buttonsNamed(screenplay)).toContain('Section');
    expect(buttonsNamed(stagePlay)).toContain('Stage direction');
  });

  test('buttonsNamed finds each “the X button”, one- and two-word', () => {
    expect(
      buttonsNamed(
        'The Scene button, marked INT., and the Page break button. Not the Act and Scene buttons.',
      ),
    ).toEqual(['Scene', 'Page break']);
  });

  test('the screenplay shows each main mark', () => {
    const marks: [string, RegExp][] = [
      ['forced action', /^![A-Z]/m],
      ['forced character', /^@[A-Za-z]/m],
      ['centered', /^>.*<$/m],
      ['section', /^# /m],
      ['synopsis', /^= /m],
      ['boneyard', /^\/\*$/m],
      ['italic', /(^|[^*])\*[^*\s][^*]*\*/m],
      ['bold', /\*\*[^*]+\*\*/],
      ['underline', /_[^_\s][^_]*_/],
      ['transition', /^[A-Z ]+TO:$/m],
      ['note', /^\[\[/m],
      ['extension', /^[A-Z]+ \((O\.S\.|V\.O\.)\)$/m],
    ];
    expect(marks.filter(([, re]) => !re.test(screenplay)).map(([name]) => name)).toEqual([]);
  });

  test('the stage play has a cast list before Act One that reads as action, then a page break', () => {
    const doc = parse(stagePlay);
    const first = doc.blocks.findIndex((b) => b.kind === 'section');
    // What prints before the first act: the notes are left out.
    const before = doc.blocks.slice(0, first).filter((b) => b.kind !== 'note');
    expect(before.map((b) => b.kind)).toEqual(['centered', 'action', 'action', 'page_break']);
    expect(lineOf(stagePlay, before[0] as Block)).toBe('> CHARACTERS <');
    expect(lineOf(stagePlay, before[1] as Block)).toMatch(/^JUNE, [a-z]/);
    expect(lineOf(stagePlay, doc.blocks[first] as Block)).toBe('# Act One');
  });

  test('its entrances and exits are stage directions', () => {
    const doc = parse(stagePlay);
    const actions = doc.blocks.filter((b) => b.kind === 'action').map((b) => lineOf(stagePlay, b));
    expect(actions.some((line) => /^ARLO enters\b/.test(line))).toBe(true);
    expect(actions.some((line) => /^JUNE enters\b/.test(line))).toBe(true);
    expect(actions.some((line) => /exits\.$/.test(line))).toBe(true);
    // And nothing with "enters" or "exits" in it reads as anything else.
    const others = doc.blocks
      .filter((b) => b.kind !== 'action' && b.kind !== 'note')
      .map((b) => lineOf(stagePlay, b));
    expect(others.filter((line) => /\b(enters|exits)\b/.test(line))).toEqual([]);
  });

  test('the title page has a title and an author', () => {
    for (const { name, text } of CASES) {
      const keys = parse(text).titlePage?.fields.map((f) => f.key) ?? [];
      expect(keys, name).toEqual(expect.arrayContaining(['Title', 'Author']));
    }
    expect(stagePlay).toMatch(/^Credit: A play in one act by$/m);
  });
});
