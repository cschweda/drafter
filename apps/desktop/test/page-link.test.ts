import { EventEmitter } from 'node:events';
import { describe, expect, test } from 'vitest';
import { PageLink } from '../src/page-link';

/** A stand-in for the editor's webContents. */
class Contents extends EventEmitter {
  sent: unknown[][] = [];
  destroyed = false;
  crashed = false;
  isDestroyed() {
    return this.destroyed;
  }
  isCrashed() {
    return this.crashed;
  }
  send(...args: unknown[]) {
    this.sent.push(args);
  }
}

const link = (c: Contents) => new PageLink(c as never, 'ch', () => {});

describe('PageLink', () => {
  test('asks and settles on the reply', async () => {
    const c = new Contents();
    const l = link(c);
    const answer = l.request('state');
    expect(c.sent[0]).toEqual(['ch', 1, 'state']);
    l.reply(1, true, { unsaved: true });
    expect(await answer).toEqual({ unsaved: true });
  });

  test('a navigation, a crash, or a destroy rejects what was asked', async () => {
    for (const event of ['did-start-navigation', 'render-process-gone', 'destroyed']) {
      const c = new Contents();
      const l = link(c);
      const answer = l.request('save');
      c.emit(
        event,
        event === 'did-start-navigation' ? { isMainFrame: true, isSameDocument: false } : {},
      );
      await expect(answer).rejects.toThrow();
    }
  });

  test('a same-document navigation changes nothing', async () => {
    const c = new Contents();
    const l = link(c);
    const answer = l.request('state');
    c.emit('did-start-navigation', { isMainFrame: true, isSameDocument: true });
    l.reply(1, true, 1);
    expect(await answer).toBe(1);
  });

  test('calls onGone when the page navigates away, so the link can be dropped', () => {
    const c = new Contents();
    let gone = 0;
    new PageLink(c as never, 'ch', () => gone++);
    c.emit('did-start-navigation', { isMainFrame: true, isSameDocument: false });
    expect(gone).toBe(1);
  });

  test('dispose removes every listener it added, however many links were made', () => {
    const c = new Contents();
    const before = c.eventNames().length;
    for (let i = 0; i < 50; i++) link(c).dispose();
    expect(c.eventNames().length).toBe(before);
    for (const name of c.eventNames()) expect(c.listenerCount(name)).toBe(0);
  });
});
