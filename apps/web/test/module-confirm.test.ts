import { beforeEach, describe, expect, test } from 'vitest';
import { askModule, dropQuestion, moduleQuestion } from '../app/modules/confirm';

beforeEach(() => dropQuestion());

describe("a module's question", () => {
  test('is open until it is answered, and resolves what was answered', async () => {
    const yes = askModule('notes', 'Notes', 'Remove 3 notes?', { confirmLabel: 'Remove notes' });
    expect(moduleQuestion.value).toMatchObject({
      moduleName: 'Notes',
      message: 'Remove 3 notes?',
      confirmLabel: 'Remove notes',
      cancelLabel: 'Cancel',
    });
    moduleQuestion.value?.answer(true);
    await expect(yes).resolves.toBe(true);
    expect(moduleQuestion.value).toBeNull();

    const no = askModule('notes', 'Notes', 'Again?');
    expect(moduleQuestion.value?.confirmLabel).toBe('OK');
    moduleQuestion.value?.answer(false);
    await expect(no).resolves.toBe(false);
  });

  test('answers only once', async () => {
    const question = askModule('notes', 'Notes', 'Sure?');
    const open = moduleQuestion.value;
    open?.answer(true);
    open?.answer(false);
    await expect(question).resolves.toBe(true);
  });

  test('is answered No by a newer question, which takes its place', async () => {
    const first = askModule('notes', 'Notes', 'First?');
    const second = askModule('cast', 'Cast', 'Second?');
    await expect(first).resolves.toBe(false);
    expect(moduleQuestion.value?.message).toBe('Second?');
    moduleQuestion.value?.answer(true);
    await expect(second).resolves.toBe(true);
  });

  test('is answered No when another script opens, or its module is turned off', async () => {
    const a = askModule('notes', 'Notes', 'A?');
    dropQuestion();
    await expect(a).resolves.toBe(false);
    expect(moduleQuestion.value).toBeNull();

    const b = askModule('notes', 'Notes', 'B?');
    dropQuestion('cast');
    expect(moduleQuestion.value?.message).toBe('B?');
    dropQuestion('notes');
    await expect(b).resolves.toBe(false);
  });
});
