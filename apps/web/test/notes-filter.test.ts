import { parse } from '@drafter/fountain';
import { noteEntries } from '@drafter/notes';
import { sceneIndex } from '@drafter/outline';
import { builtins, type Template } from '@drafter/templates';
import { describe, expect, test } from 'vitest';
import { categoriesInUse, type NoteFilter, notesShown, openCount } from '../app/notes/filter';

// The Notes tab's groups and filters (Phase 2 design §8): every note and boneyard but the scene
// fields and Beat Board cards, grouped, then filtered by category, person, status, scene, and text.

const SCRIPT = [
  'INT. HALL - DAY',
  '',
  '[[Goal: Find the key.]]',
  '',
  'Ann waits. [[Check the dates. #continuity]]',
  '[[TODO: cut this]]',
  '',
  '[[Sam: Why here? #character]]',
  '[[Ann re Sam: Because. #resolved]]',
  '',
  '/* an old line */',
  '',
  '[[Card: a stray card]]',
  '',
  'EXT. YARD - NIGHT',
  '',
  'Bob runs. [[Setup: the letter]]',
  '[[Ann: Too fast. #resolved #pacing]]',
  '',
].join('\n');

const doc = parse(SCRIPT);
const index = sceneIndex(doc, builtins['us-screenplay'] as Template, null);
const entries = noteEntries(doc);
const lineOf = (offset: number) => SCRIPT.slice(0, offset).split('\n').length;

const ALL: NoteFilter = {
  group: 'all',
  category: null,
  person: null,
  status: 'all',
  scene: null,
  text: '',
};
const shown = (filter: Partial<NoteFilter>) =>
  notesShown(entries, index, { ...ALL, ...filter }, lineOf);
const texts = (filter: Partial<NoteFilter>) => shown(filter).map((row) => row.entry.text.trim());

describe('notesShown', () => {
  test('All lists every note and boneyard but no fields or cards', () => {
    expect(texts({})).toEqual([
      'Check the dates. #continuity',
      'TODO: cut this',
      'Sam: Why here? #character',
      'an old line',
      'Setup: the letter',
      'Ann: Too fast. #resolved #pacing',
    ]);
    const sam = shown({})[2];
    expect(sam?.replies.map((r) => r.text)).toEqual(['Ann re Sam: Because. #resolved']);
    expect(sam?.person).toBe('Sam');
    expect(sam?.categories).toEqual(['character']);
    expect(sam?.scene?.heading).toBe('INT. HALL - DAY');
    expect(sam?.line).toBe(8);
    expect(shown({})[1]?.categories).toEqual(['todo']);
    expect(shown({})[3]?.categories).toEqual([]);
    expect(shown({})[4]?.scene?.heading).toBe('EXT. YARD - NIGHT');
  });

  test('My notes holds headless and category notes', () => {
    expect(texts({ group: 'mine' })).toEqual(['Check the dates. #continuity', 'TODO: cut this']);
  });

  test('Readers holds person notes', () => {
    expect(texts({ group: 'readers' })).toEqual([
      'Sam: Why here? #character',
      'Ann: Too fast. #resolved #pacing',
    ]);
    expect(texts({ group: 'setups' })).toEqual(['Setup: the letter']);
    expect(texts({ group: 'boneyard' })).toEqual(['an old line']);
  });

  test('filters by category, person, status, scene, and text', () => {
    expect(texts({ category: 'continuity' })).toEqual(['Check the dates. #continuity']);
    // A category head is a category.
    expect(texts({ category: 'todo' })).toEqual(['TODO: cut this']);
    // A person's note, or a thread with a reply of theirs; matched without regard to case.
    expect(texts({ person: 'ann' })).toEqual([
      'Sam: Why here? #character',
      'Ann: Too fast. #resolved #pacing',
    ]);
    expect(texts({ person: 'Sam' })).toEqual(['Sam: Why here? #character']);
    // Status is a note's: boneyards and marks show only with All.
    expect(texts({ status: 'open' })).toEqual([
      'Check the dates. #continuity',
      'TODO: cut this',
      'Sam: Why here? #character',
    ]);
    expect(texts({ status: 'resolved' })).toEqual([
      'Sam: Why here? #character',
      'Ann: Too fast. #resolved #pacing',
    ]);
    expect(texts({ scene: 2 })).toEqual(['Setup: the letter', 'Ann: Too fast. #resolved #pacing']);
    expect(texts({ text: 'DATES' })).toEqual(['Check the dates. #continuity']);
    expect(texts({ text: 'because' })).toEqual(['Sam: Why here? #character']);
    expect(texts({ group: 'mine', status: 'resolved' })).toEqual([]);
  });
});

describe('openCount', () => {
  test('counts open notes in My notes and Readers', () => {
    // The two open notes of the writer's and Sam's; not the resolved ones, the field, the mark,
    // the card, or the boneyard.
    expect(openCount(entries)).toBe(3);
    expect(openCount([])).toBe(0);
  });
});

describe('categoriesInUse', () => {
  test('lists categories in use, then the starting set', () => {
    expect(categoriesInUse(entries)).toEqual([
      'continuity',
      'todo',
      'character',
      'pacing',
      'story',
      'dialogue',
      'format',
      'question',
    ]);
  });
});
