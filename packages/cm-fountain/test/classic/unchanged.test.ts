import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CompletionContext } from '@codemirror/autocomplete';
import { EditorState, type StateCommand } from '@codemirror/state';
import {
  fountainCompletionSource,
  fountainEnter,
  fountainInput,
  fountainShiftTab,
  fountainTab,
  parsedDoc,
} from '@drafter/cm-fountain';
import { describe, expect, it } from 'vitest';
import { decorate, render, run } from '../helpers';

// The pin for "Fountain Mode is byte-for-byte unchanged when Classic is off". The snapshot was taken
// from the code as it stood before Classic Mode had any seam in it, so a difference here is a change
// to Fountain Mode, and the snapshot is never updated to make this pass.

const root = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

const classification = readdirSync(join(root, 'fixtures/classification'))
  .filter((name) => name.endsWith('.fountain'))
  .sort()
  .map((name) => `fixtures/classification/${name}`);

const FILES = [
  ...classification,
  'samples/screenplay.fountain',
  'samples/stage-play.fountain',
  'apps/web/scripts/ui-shots-script.fountain',
];

const stateAt = (doc: string, pos: number) =>
  EditorState.create({ doc, selection: { anchor: pos }, extensions: [parsedDoc, fountainInput()] });

/** Five places in the text, as the editor counts it: its ends, and the three quarters between. */
function probes(doc: string): number[] {
  const { length } = stateAt(doc, 0).doc;
  return [0, 1, 2, 3, 4].map((i) => Math.floor((length * i) / 4));
}

/** What changed between two renders: the part of each that differs, so the snapshot stays small. */
function delta(before: string, after: string): string {
  if (before === after) return 'same';
  let start = 0;
  while (before[start] === after[start]) start++;
  let tail = 0;
  while (
    tail < Math.min(before.length, after.length) - start &&
    before[before.length - 1 - tail] === after[after.length - 1 - tail]
  ) {
    tail++;
  }
  const removed = before.slice(start, before.length - tail);
  const added = after.slice(start, after.length - tail);
  return `${start}: ${JSON.stringify(removed)} => ${JSON.stringify(added)}`;
}

function pressed(doc: string, pos: number, command: StateCommand): string {
  const state = stateAt(doc, pos);
  const result = run(state, command);
  return `${result.handled ? 'took' : 'left'} ${delta(render(state), render(result.state))}`;
}

function offered(doc: string, pos: number, explicit: boolean): string {
  const context = new CompletionContext(stateAt(doc, pos), pos, explicit);
  const result = fountainCompletionSource(context);
  if (!result) return 'none';
  return `${result.from}: ${result.options.map((option) => option.label).join(' | ')}`;
}

describe('Fountain Mode is unchanged', () => {
  it.each(FILES)('the decorations of %s', (path) => {
    const doc = read(path);
    const lines = decorate(stateAt(doc, 0)).map((d) => `${d.from}-${d.to} ${d.class}`);
    expect(lines.join('\n')).toMatchSnapshot();
  });

  it.each(FILES)('what completion offers in %s', (path) => {
    const doc = read(path);
    const lines = probes(doc).flatMap((pos) => [
      `${pos} typing: ${offered(doc, pos, false)}`,
      `${pos} asked: ${offered(doc, pos, true)}`,
    ]);
    expect(lines.join('\n')).toMatchSnapshot();
  });

  it.each(FILES)('Enter, Tab, and Shift-Tab in %s', (path) => {
    const doc = read(path);
    const lines = probes(doc).flatMap((pos) => [
      `${pos} Enter: ${pressed(doc, pos, fountainEnter)}`,
      `${pos} Tab: ${pressed(doc, pos, fountainTab)}`,
      `${pos} Shift-Tab: ${pressed(doc, pos, fountainShiftTab)}`,
    ]);
    expect(lines.join('\n')).toMatchSnapshot();
  });
});
