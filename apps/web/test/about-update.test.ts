import { describe, expect, test } from 'vitest';
import { createAboutCheck } from '../app/about/update-check';
import { type CheckState, createUpdateCheck } from '../app/update/check';

// About Drafter's Check for updates… (fresh-look Task 3b): the same check as Help → Check for
// updates (`update/use-check.ts`), its result said in About, under the version, where focus stays.

function checkThat(answer: CheckState['status'], how?: 'reload' | 'restart' | 'get') {
  let calls = 0;
  const check = createUpdateCheck({
    current: '0.22.0',
    desktop: {
      check: async () => {
        calls += 1;
        if (answer === 'ready')
          return { status: 'found', version: '0.23.0', how: how ?? 'restart' };
        if (answer === 'latest') return { status: 'latest' };
        throw new Error('offline');
      },
    },
    offered: () => null,
  });
  return { check, calls: () => calls };
}

describe('About’s update check', () => {
  test('says nothing until it is asked', () => {
    const { check } = checkThat('latest');
    const about = createAboutCheck(check, check.run, '0.22.0', 'desktop');
    expect(about.message.value).toBe('');
    expect(about.ready.value).toBe(false);
    expect(about.failed.value).toBe(false);
  });

  test('runs the one check, and says it is up to date', async () => {
    const { check, calls } = checkThat('latest');
    const about = createAboutCheck(check, check.run, '0.22.0', 'desktop');
    const run = about.run();
    expect(about.busy.value).toBe(true);
    expect(about.message.value).toBe('Checking for updates…');
    await run;
    expect(calls()).toBe(1);
    expect(about.busy.value).toBe(false);
    expect(about.message.value).toBe('Drafter v0.22.0 is up to date.');
    expect(about.ready.value).toBe(false);
  });

  test('offers the update the check found, by its action', async () => {
    const { check } = checkThat('ready', 'restart');
    const about = createAboutCheck(check, check.run, '0.22.0', 'desktop');
    await about.run();
    expect(about.ready.value).toBe(true);
    expect(about.how.value).toBe('restart');
    expect(about.message.value).toBe('Drafter v0.23.0 is ready. Restart to use it.');
  });

  test('says when it could not check, and can try again', async () => {
    const { check, calls } = checkThat('error');
    const about = createAboutCheck(check, check.run, '0.22.0', 'web');
    await about.run();
    expect(about.failed.value).toBe(true);
    expect(about.message.value).toMatch(/couldn’t check for updates/);
    await about.run();
    expect(calls()).toBe(2);
  });

  test('forgets what it said when About closes', async () => {
    const { check } = checkThat('latest');
    const about = createAboutCheck(check, check.run, '0.22.0', 'web');
    await about.run();
    about.reset();
    expect(about.message.value).toBe('');
  });

  test('runs once for two presses, or a press while the Help menu’s check is under way, and says what it found', async () => {
    let calls = 0;
    let answer: (value: { status: 'latest' }) => void = () => {};
    const check = createUpdateCheck({
      current: '0.22.0',
      desktop: {
        check: () => {
          calls += 1;
          return new Promise((resolve) => {
            answer = resolve;
          });
        },
      },
      offered: () => null,
    });
    const about = createAboutCheck(check, check.run, '0.22.0', 'desktop');
    // The Help menu's Check for updates… is under way; About's button is pressed twice meanwhile.
    const fromMenu = check.run();
    const first = about.run();
    const second = about.run();
    expect(about.message.value).toBe('Checking for updates…');
    answer({ status: 'latest' });
    await Promise.all([fromMenu, first, second]);
    expect(calls).toBe(1);
    expect(about.message.value).toBe('Drafter v0.22.0 is up to date.');
  });
});
