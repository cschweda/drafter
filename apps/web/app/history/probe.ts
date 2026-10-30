import { clearProjectCache } from './cache';
import { type HistoryAsk, type HistoryClient, useHistoryClient } from './client';
import type { HistoryReply } from './protocol';

// For the browser tests only: a test build (`DRAFTER_TEST_MODULES=1`) puts this on `window`
// (plugins/history-probe.client.ts), so e2e/history-scan.spec.ts can time the history worker
// before any view uses it. No other build has it (scripts/check-build.mjs checks).

/** What one scan did, timed from the request on the page's clock. */
export interface ProbeScan {
  /** When the first list holding a row came, in milliseconds; null when none did. */
  firstRowsMs: number | null;
  doneMs: number;
  /** The last list's length, and its headings. */
  rows: number;
  headings: string[];
  progress: Extract<HistoryReply, { kind: 'progress' }> | null;
  updates: number;
  error: string | null;
}

export interface HistoryProbe {
  scan(ask: HistoryAsk): Promise<ProbeScan>;
  /** Ends the worker, so the next scan starts a new one (and reads the cache, not memory). */
  release(): void;
  clearCache(projectId: string): Promise<void>;
}

export function installHistoryProbe(): void {
  let client: HistoryClient | null = null;
  const probe: HistoryProbe = {
    scan(ask) {
      client ??= useHistoryClient();
      const started = performance.now();
      const result: ProbeScan = {
        firstRowsMs: null,
        doneMs: 0,
        rows: 0,
        headings: [],
        progress: null,
        updates: 0,
        error: null,
      };
      return new Promise((resolve) => {
        client?.request(ask, (reply) => {
          const at = performance.now() - started;
          if (reply.kind === 'progress') {
            result.progress = reply;
            return;
          }
          if (reply.kind === 'error') {
            result.error = reply.message;
            result.doneMs = at;
            resolve(result);
            return;
          }
          result.updates++;
          const list = reply.kind === 'deleted' ? reply.scenes : reply.rows;
          if (list.length > 0 && result.firstRowsMs === null) result.firstRowsMs = at;
          result.rows = list.length;
          result.headings =
            reply.kind === 'deleted' ? reply.scenes.map((s) => s.newest.print.heading) : [];
          if (reply.done) {
            result.doneMs = at;
            resolve(result);
          }
        });
      });
    },
    release() {
      client?.release();
      client = null;
    },
    clearCache: clearProjectCache,
  };
  (window as unknown as { drafterHistoryProbe: HistoryProbe }).drafterHistoryProbe = probe;
}
