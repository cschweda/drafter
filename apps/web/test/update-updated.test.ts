import { describe, expect, test } from 'vitest';
import { markUpdating, takeUpdated, upToDateMessage } from '../app/update/updated';

// "Drafter is up to date (v…)": said once, on the load that a chosen update reloaded into, and
// never on an ordinary load. The mark is in the tab's session storage, which may be refused.

function storage(): Storage & { items: Map<string, string> } {
  const items = new Map<string, string>();
  return {
    items,
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (i) => [...items.keys()][i] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => void items.set(key, String(value)),
  };
}

const refusing = {
  getItem() {
    throw new DOMException('denied', 'SecurityError');
  },
  setItem() {
    throw new DOMException('denied', 'SecurityError');
  },
  removeItem() {
    throw new DOMException('denied', 'SecurityError');
  },
} as unknown as Storage;

describe('the up-to-date note', () => {
  test('an ordinary load has nothing to say', () => {
    expect(takeUpdated(storage())).toBe(false);
  });

  test('the load after a chosen update says it, once', () => {
    const s = storage();
    markUpdating(s);
    expect(takeUpdated(s)).toBe(true);
    expect(takeUpdated(s)).toBe(false);
    expect(s.items.size).toBe(0);
  });

  test('storage that refuses, or isn’t there, says nothing and throws nothing', () => {
    expect(() => markUpdating(refusing)).not.toThrow();
    expect(takeUpdated(refusing)).toBe(false);
    expect(() => markUpdating(undefined)).not.toThrow();
    expect(takeUpdated(undefined)).toBe(false);
  });

  test('names the version', () => {
    expect(upToDateMessage('0.22.1')).toBe('Drafter is up to date (v0.22.1)');
  });
});
