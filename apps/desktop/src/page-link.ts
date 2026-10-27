// The editor's page as the close flow asks it questions over IPC (close.ts): each question has an
// id, and settles when the page replies, or rejects when the page goes (a reload, a crash, a
// destroy). No Electron import, so it is tested with a plain event emitter.

/** The part of a webContents a link uses. */
export interface LinkContents {
  isDestroyed(): boolean;
  isCrashed(): boolean;
  send(channel: string, ...args: unknown[]): void;
  once(event: 'destroyed', listener: () => void): unknown;
  on(event: 'render-process-gone', listener: () => void): unknown;
  on(
    event: 'did-start-navigation',
    listener: (details: { isMainFrame: boolean; isSameDocument: boolean }) => void,
  ): unknown;
  removeListener(event: string, listener: (...args: never[]) => void): unknown;
}

export class PageLink {
  private nextId = 0;
  private readonly pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();
  private readonly onDestroyed = () => this.rejectAll();
  private readonly onGone = () => this.rejectAll();
  private readonly onNavigation = (details: { isMainFrame: boolean; isSameDocument: boolean }) => {
    // A reload or a new page: whatever was asked of the old one will not be answered, and the new
    // one has not said it listens.
    if (details.isMainFrame && !details.isSameDocument) {
      this.rejectAll();
      this.leaving();
    }
  };

  /**
   * @param channel where questions are sent: `(id, kind)`.
   * @param leaving called when the page navigates away, so the owner stops treating it as listening.
   * @param asked called with each kind asked (the e2e suite reads them).
   */
  constructor(
    readonly contents: LinkContents,
    private readonly channel: string,
    private readonly leaving: () => void,
    private readonly asked: (kind: string) => void = () => {},
  ) {
    contents.once('destroyed', this.onDestroyed);
    contents.on('render-process-gone', this.onGone);
    contents.on('did-start-navigation', this.onNavigation);
  }

  request(kind: string): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (this.contents.isDestroyed() || this.contents.isCrashed()) {
        reject(new Error('The page is gone.'));
        return;
      }
      const id = ++this.nextId;
      this.asked(kind);
      this.pending.set(id, { resolve, reject });
      this.contents.send(this.channel, id, kind);
    });
  }

  reply(id: unknown, ok: unknown, value: unknown): void {
    if (typeof id !== 'number') return;
    const waiting = this.pending.get(id);
    if (!waiting) return;
    this.pending.delete(id);
    if (ok === true) waiting.resolve(value);
    else waiting.reject(new Error('The page could not answer.'));
  }

  /** Stops listening to the page (this link was replaced by a newer one), and drops what waits. */
  dispose(): void {
    this.contents.removeListener('destroyed', this.onDestroyed);
    this.contents.removeListener('render-process-gone', this.onGone);
    this.contents.removeListener('did-start-navigation', this.onNavigation);
    this.rejectAll();
  }

  private rejectAll(): void {
    for (const [id, waiting] of this.pending) {
      this.pending.delete(id);
      waiting.reject(new Error('The page is gone.'));
    }
  }
}
