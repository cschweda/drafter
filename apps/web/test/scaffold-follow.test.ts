// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { nextTick, ref } from 'vue';
import { FOLLOW_MARK, FOLLOW_REST_MS, restingValue } from '../app/scaffold/follow';

// Scaffold's scene page follows the cursor when it rests (seeing-the-script design §5.2, Call 25):
// FOLLOW_REST_MS after the last cursor move or the cast's update, it reads the cursor's scene again.
// It never moves focus and says nothing: the heading changes quietly.

beforeEach(() => {
  // The timers only: the page's performance timeline stays real, for the mark.
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('following the cursor', () => {
  test('updates 150 ms after the cursor rests', async () => {
    expect(FOLLOW_REST_MS).toBe(150);
    const cursor = ref(1);
    const cast = ref(0);
    const read = vi.fn(() => `scene at ${cursor.value}`);
    const rest = restingValue(() => [cursor.value, cast.value], read);
    expect(rest.value.value).toBe('scene at 1');
    cursor.value = 2;
    await nextTick();
    vi.advanceTimersByTime(100);
    expect(rest.value.value).toBe('scene at 1');
    // Another move starts the wait again.
    cursor.value = 3;
    await nextTick();
    vi.advanceTimersByTime(149);
    expect(rest.value.value).toBe('scene at 1');
    vi.advanceTimersByTime(1);
    expect(rest.value.value).toBe('scene at 3');
    // The cast's update reads it again too, once it has rested.
    const reads = read.mock.calls.length;
    cast.value = 1;
    await nextTick();
    vi.advanceTimersByTime(FOLLOW_REST_MS);
    expect(read.mock.calls.length).toBe(reads + 1);
    rest.stop();
    cursor.value = 4;
    await nextTick();
    vi.advanceTimersByTime(FOLLOW_REST_MS);
    expect(rest.value.value).toBe('scene at 3');
  });

  test('never moves focus', async () => {
    const field = document.createElement('input');
    document.body.append(field);
    field.focus();
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');
    const cursor = ref(1);
    const rest = restingValue(
      () => cursor.value,
      () => cursor.value,
    );
    for (let n = 2; n < 6; n++) {
      cursor.value = n;
      await nextTick();
      vi.advanceTimersByTime(FOLLOW_REST_MS);
    }
    expect(rest.value.value).toBe(5);
    expect(focus).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(field);
    rest.stop();
    field.remove();
  });

  test('keeps one performance mark, the last rest’s', async () => {
    performance.clearMarks(FOLLOW_MARK);
    const cursor = ref(1);
    const rest = restingValue(
      () => cursor.value,
      () => cursor.value,
    );
    for (let n = 2; n < 5; n++) {
      cursor.value = n;
      await nextTick();
      vi.advanceTimersByTime(FOLLOW_REST_MS);
    }
    expect(performance.getEntriesByName(FOLLOW_MARK)).toHaveLength(1);
    rest.stop();
  });
});
