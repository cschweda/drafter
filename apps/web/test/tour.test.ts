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
        'menu',
        'save',
        'status',
        'export',
        'focus',
        'palette',
      ].map((name) => `[data-tour="${name}"]`),
    );
  });

  // Fresh-look Task 9: a toolbar button the phone's top bar folded into More actions isn't on
  // screen, so its step points at More actions instead, where it went; no step is dropped.
  test('point at More actions for a toolbar button that is folded, and keep ten steps', () => {
    const steps = buildSteps(false, false, new Set(['save', 'export', 'focus']));
    expect(steps).toHaveLength(10);
    expect(new Set(steps.map((s) => s.id)).size).toBe(10);
    const at = (id: string) => steps.find((s) => s.id === id)?.target;
    for (const id of ['save', 'export', 'focus']) expect(at(id)).toBe('[data-tour="toolbar-more"]');
    expect(at('palette')).toBe('[data-tour="palette"]');
    expect(steps.find((s) => s.id === 'save')?.content).toMatch(/More actions/);
    // Nothing folded: their own buttons.
    expect(buildSteps(false, false, new Set()).find((s) => s.id === 'save')?.target).toBe(
      '[data-tour="save"]',
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

  test('point at the app menu for the template on every screen, and say where to choose', () => {
    for (const wide of [true, false]) {
      const template = buildSteps(wide)[4];
      expect(template?.target).toBe('[data-tour="menu"]');
      expect(template?.content).toMatch(/Drafter menu’s Template section/);
      expect(template?.content).toMatch(/palette/);
      expect(template?.content).toMatch(/Template:/);
    }
  });

  test('say what Save does where it does it, and where typewriter scrolling is', () => {
    for (const wide of [true, false]) {
      const steps = buildSteps(wide);
      const save = steps.find((s) => s.id === 'save')?.content ?? '';
      // Chrome and Edge save in place on a computer; on a phone they download, as the rest do.
      expect(save).toMatch(/Chrome and Edge on a computer/);
      expect(save).toMatch(/phones/);
      // The Focus button is focus mode; typewriter scrolling is the Source pane's Typewriter button.
      const focus = steps.find((s) => s.id === 'focus')?.content ?? '';
      expect(focus).toMatch(/Focus mode/);
      expect(focus).toMatch(/Typewriter.*Source pane’s bar/);
    }
  });

  test('point the status step at the status bar from 640px up, and at the title below', () => {
    // Below 640px there is no status bar (fresh-look Task 6): the title's red dot says "unsaved".
    for (const wide of [true, false]) {
      const bar = buildSteps(wide, true).find((s) => s.id === 'status');
      expect(bar?.target).toBe('[data-tour="status"]');
      expect(bar?.content).toMatch(/pages and running time/);
      expect(bar?.content).not.toMatch(/saved/i);
    }
    const narrow = buildSteps(false, false);
    expect(narrow).toHaveLength(10);
    const title = narrow.find((s) => s.id === 'status');
    expect(title?.target).toBe('[data-tour="title"]');
    expect(title?.content).toMatch(/red dot/);
    expect(title?.content.length).toBeLessThan(260);
  });

  test('tell where the status bar is shown that the red dot means unsaved changes', () => {
    // From 640px up the status step is about the bar, so the Save step says what the dot means.
    const DOT = 'A red dot by the title means unsaved changes; click it to save.';
    for (const wide of [true, false]) {
      expect(buildSteps(wide, true).find((s) => s.id === 'save')?.content).toContain(DOT);
    }
    // Below 640px the status step is the dot's own.
    expect(buildSteps(false, false).find((s) => s.id === 'save')?.content).not.toContain(DOT);
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

  test('the welcome marks the name and says what Drafter promises, briefly', () => {
    expect(WELCOME.title).toBe('Welcome to Drafter™');
    expect(WELCOME.subdescription).toBe(
      'Free, with no catch, and no login, ever. Private (no cookies, no tracking), it works offline, and Final Draft files go in and out.',
    );
    // One or two short lines on the 440px card.
    expect(WELCOME.subdescription.length).toBeLessThanOrEqual(140);
  });

  test('say Drafter is Fountain-first and open to other formats, and claim no export it lacks', () => {
    expect(WELCOME.description).toBe(
      'A Fountain-first writing app: screenplays and stage plays in Fountain, and anything else, from a treatment to a novel, in Markdown. Want a two-minute tour?',
    );
    expect(INTRO_SLIDES[0]?.content).toEqual([
      'A Drafter script is plain text, written in a simple format called Fountain. Type it like this, and Drafter lays out the page.',
      'Fountain is the heart of Drafter. You write in it, and the script goes out in the formats the industry uses.',
    ]);
    const exported = buildSteps(true).find((s) => s.id === 'export');
    expect(exported?.title).toBe('Export, and open almost anything');
    const [exports, opens] = (exported?.content ?? '').split('. Open, ');
    // Exported: PDF, Final Draft, Markdown, plain text. Highland and Fade In are only opened.
    expect(exports).toMatch(/PDF.*Final Draft.*Markdown.*plain text/);
    expect(exports).not.toMatch(/Highland|Fade In/);
    expect(opens).toMatch(/Final Draft, Highland, Fade In, Markdown, and plain text/);
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
    // Help is its own menu in the top bar now (fresh-look Task 3b), not a section of the Drafter menu.
    const said = tourMessage('Tour cancelled. You can restart it anytime from the Tour button.');
    expect(said).toMatch(/Help menu/);
    expect(said).not.toMatch(/Drafter menu/);
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
