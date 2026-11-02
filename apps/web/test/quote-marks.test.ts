import { parse, type TextChange } from '@drafter/fountain';
import { sceneIndex } from '@drafter/outline';
import { quoteCandidates } from '@drafter/story-map';
import { builtins } from '@drafter/templates';
import { describe, expect, test } from 'vitest';
import { markSpeech, speechAt } from '../app/story-map/quote-marks';

/** The changes applied from last to first, so each keeps its old-document offsets. */
function apply(source: string, changes: readonly TextChange[]): string {
  let text = source;
  for (const { from, to, insert } of [...changes].sort((a, b) => b.from - a.from)) {
    text = text.slice(0, from) + insert + text.slice(to);
  }
  return text;
}

const SCRIPT = [
  'EXT. BOATYARD - DUSK',
  '',
  'Hulls on blocks.',
  '',
  'ODILE',
  '(wiping her hands)',
  'Nobody sails a boat they never mended.',
  'Not on my slipway.',
  '',
  'TEO',
  'Then teach me how.',
  '',
  'BRANN',
  'Left side.',
  '',
  'CASS ^',
  'Right side.',
  '',
].join('\n');

const at = (source: string, needle: string) => source.indexOf(needle);
const mark = (source: string, offset: number, kind: 'quote' | 'no-quote' | null) => {
  const doc = parse(source);
  const cue = speechAt(doc, offset);
  if (cue === null) throw new Error('no speech');
  return apply(source, markSpeech(doc, cue, kind));
};

describe('speechAt', () => {
  test('finds the speech from its cue, parenthetical, or dialogue', () => {
    const doc = parse(SCRIPT);
    const cue = doc.blocks.findIndex((b) => b.kind === 'character');
    expect(speechAt(doc, at(SCRIPT, 'ODILE') + 2)).toBe(cue);
    expect(speechAt(doc, at(SCRIPT, 'wiping'))).toBe(cue);
    expect(speechAt(doc, at(SCRIPT, 'Nobody'))).toBe(cue);
    expect(speechAt(doc, at(SCRIPT, 'slipway.') + 8)).toBe(cue);
    expect(speechAt(doc, at(SCRIPT, 'Then teach'))).toBe(cue + 3);
  });

  test('is null outside a speech', () => {
    const doc = parse(SCRIPT);
    expect(speechAt(doc, at(SCRIPT, 'Hulls'))).toBeNull();
    expect(speechAt(doc, at(SCRIPT, 'BOATYARD'))).toBeNull();
    expect(speechAt(doc, at(SCRIPT, '\n\nTEO') + 1)).toBeNull();
  });

  test('dual dialogue is never marked', () => {
    const doc = parse(SCRIPT);
    expect(speechAt(doc, at(SCRIPT, 'Left side'))).toBeNull();
    expect(speechAt(doc, at(SCRIPT, 'Right side'))).toBeNull();
  });
});

describe('markSpeech', () => {
  test('marking adds [[Quote]] at the end of the last line, one undo', () => {
    const doc = parse(SCRIPT);
    const cue = speechAt(doc, at(SCRIPT, 'Nobody')) as number;
    const changes = markSpeech(doc, cue, 'quote');
    // One change: one transaction, so one undo.
    expect(changes).toHaveLength(1);
    const out = apply(SCRIPT, changes);
    expect(out).toContain('Not on my slipway. [[Quote]]\n\nTEO');
    // The story map reads it as marked.
    const index = sceneIndex(parse(out), builtins['us-screenplay']);
    const marked = quoteCandidates(parse(out), index).find((c) => c.character === 'ODILE');
    expect(marked?.marked).toBe('quote');
  });

  test('marking again swaps the mark', () => {
    const once = mark(SCRIPT, at(SCRIPT, 'Nobody'), 'quote');
    const twice = mark(once, at(once, 'Nobody'), 'no-quote');
    expect(twice).toContain('Not on my slipway. [[No quote]]\n');
    expect(twice).not.toContain('[[Quote]]');
    // The same mark again changes nothing.
    const doc = parse(twice);
    expect(markSpeech(doc, speechAt(doc, at(twice, 'Nobody')) as number, 'no-quote')).toEqual([]);
  });

  test('a mark elsewhere in the speech, or alone on the line under it, is moved', () => {
    const inside = SCRIPT.replace('mended.', 'mended. [[quote]]');
    const out = mark(inside, at(inside, 'Nobody'), 'no-quote');
    expect(out).toContain('never mended.\nNot on my slipway. [[No quote]]\n');
    const under = SCRIPT.replace('slipway.\n', 'slipway.\n[[No Quote]]\n');
    expect(mark(under, at(under, 'Nobody'), 'quote')).toContain(
      'Not on my slipway. [[Quote]]\n\nTEO',
    );
  });

  test('null removes it', () => {
    const once = mark(SCRIPT, at(SCRIPT, 'Then'), 'quote');
    expect(once).toContain('Then teach me how. [[Quote]]');
    expect(mark(once, at(once, 'Then'), null)).toBe(SCRIPT);
    const doc = parse(SCRIPT);
    expect(markSpeech(doc, speechAt(doc, at(SCRIPT, 'Then')) as number, null)).toEqual([]);
  });

  test('other notes in the speech are left alone', () => {
    const noted = SCRIPT.replace('how.', 'how. [[TODO: louder]]');
    expect(mark(noted, at(noted, 'Then'), 'quote')).toContain(
      'Then teach me how. [[TODO: louder]] [[Quote]]',
    );
  });
});
