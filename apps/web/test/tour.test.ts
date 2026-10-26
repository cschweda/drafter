// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { closePalette, openPalette } from '../app/commands/palette';
import { tourMessage } from '../app/tour/announce';
import { modalOpen, requestTour, tourRequests, whenClear } from '../app/tour/state';
import {
  buildSteps,
  INTRO_SLIDES,
  paneOf,
  TOUR_STORAGE_PREFIX,
  TOUR_VERSION,
  WELCOME,
} from '../app/tour/tour.config';

describe('the tour’s steps', () => {
  test('are the design’s ten, in order, on the targets the app marks', () => {
    const targets = buildSteps(true).map((s) => s.target);
    expect(targets).toEqual(
      [
        'source',
        'script',
        'source',
        'problems',
        'template',
        'save',
        'status',
        'export',
        'focus',
        'palette',
      ].map((name) => `[data-tour="${name}"]`),
    );
  });

  test('have their own ids, a title, and text that fits the card', () => {
    for (const wide of [true, false]) {
      const steps = buildSteps(wide);
      expect(new Set(steps.map((s) => s.id)).size).toBe(10);
      for (const step of steps) {
        expect(step.title.length).toBeGreaterThan(0);
        // The card's body is a fixed height; about six lines of text.
        expect(step.content.length).toBeLessThan(260);
      }
    }
  });

  test('point at the app menu on a phone, where the template chip is hidden, and say where to choose', () => {
    const template = buildSteps(false)[4];
    expect(template?.target).toBe('[data-tour="menu"]');
    expect(template?.content).toMatch(/menu/);
    expect(template?.content).toMatch(/palette/);
    expect(template?.content).toMatch(/Template:/);
    expect(buildSteps(true)[4]?.target).toBe('[data-tour="template"]');
  });

  test('know which of them point at a pane', () => {
    expect(buildSteps(true).map((s) => paneOf(s))).toEqual([
      'source',
      'script',
      'source',
      'problems',
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
    expect(paneOf(null)).toBeNull();
  });

  test('are version 1 under the drafter-tour prefix, and the welcome offers the two ways', () => {
    expect(TOUR_VERSION).toBe(1);
    expect(TOUR_STORAGE_PREFIX).toBe('drafter-tour');
    expect(WELCOME.startLabel).toBe('Take the tour');
    expect(WELCOME.skipLabel).toBe("No thanks, I'll look around.");
  });

  test('have an intro card of Fountain in 30 seconds, with the five examples', () => {
    expect(INTRO_SLIDES).toHaveLength(1);
    expect(INTRO_SLIDES[0]?.title).toBe('Fountain in 30 seconds');
    const syntax = INTRO_SLIDES[0]?.examples?.map((e) => e.syntax);
    expect(syntax).toEqual([
      'INT. KITCHEN - NIGHT',
      'JOHN\nWhere were you?',
      '(quietly)',
      'CUT TO:',
      '[[a note]]',
    ]);
  });
});

describe('the tour’s announcements', () => {
  test('say how to come back, not the module’s "Tour button"', () => {
    expect(tourMessage('Tour cancelled. You can restart it anytime from the Tour button.')).toMatch(
      /Help.*Drafter menu/,
    );
    expect(tourMessage('Tour step 1 of 10: x. y')).toBe('Tour step 1 of 10: x. y');
  });
});

describe('waiting for other dialogs', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
    closePalette();
  });

  test('a request is counted', () => {
    const before = tourRequests.value;
    requestTour();
    expect(tourRequests.value).toBe(before + 1);
  });

  test('an open dialog or the palette is modal; closed, nothing is', () => {
    expect(modalOpen()).toBe(false);
    document.body.innerHTML = '<dialog></dialog>';
    expect(modalOpen()).toBe(false);
    document.body.innerHTML = '<dialog open></dialog>';
    expect(modalOpen()).toBe(true);
    document.body.innerHTML = '<div role="menu"></div>';
    expect(modalOpen()).toBe(true);
    document.body.innerHTML = '';
    openPalette();
    expect(modalOpen()).toBe(true);
  });

  test('starts at once when nothing is open, and waits for an open dialog to close', async () => {
    await expect(whenClear()).resolves.toBe(true);

    document.body.innerHTML = '<dialog open></dialog>';
    let result: boolean | undefined;
    void whenClear().then((clear) => {
      result = clear;
    });
    await vi.advanceTimersByTimeAsync(2000);
    expect(result).toBeUndefined();
    document.body.innerHTML = '<dialog></dialog>';
    await vi.advanceTimersByTimeAsync(500);
    expect(result).toBe(true);
  });

  test('waits for the palette too, and gives up when told to', async () => {
    openPalette();
    let stop = false;
    let result: boolean | undefined;
    void whenClear(() => stop).then((clear) => {
      result = clear;
    });
    await vi.advanceTimersByTimeAsync(1000);
    expect(result).toBeUndefined();
    stop = true;
    await vi.advanceTimersByTimeAsync(500);
    expect(result).toBe(false);
  });
});
