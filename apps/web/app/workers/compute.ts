import { changesOf, markPages } from '@drafter/compare';
import { parse } from '@drafter/fountain';
import { paginate } from '@drafter/layout';
import type { LayoutReply, LayoutRequest } from '../editor/layout-client';

/** Parses and paginates one request. An error is a reply, so the worker never throws. */
export function computeLayout({ seq, source, template }: LayoutRequest): LayoutReply {
  try {
    return { seq, layout: paginate(parse(source), template) };
  } catch (error) {
    return { seq, error: error instanceof Error ? error.message : String(error) };
  }
}

export interface LayoutCompute {
  /** Answers `request`: its layout, then, with a baseline, its marks (version-history design §4.2). */
  handle(request: LayoutRequest, post: (reply: LayoutReply) => void): void;
}

/**
 * The layout worker's logic. It keeps the baseline it was last sent (Show changes' text to compare
 * with), whose text comes only when its id changes. A request with a baseline is answered twice
 * with its own number: the layout first, so the pages never wait on a diff, then the marks of that
 * same text against the baseline (Call 17), so a layout's marks are always its own.
 */
export function createLayoutCompute(): LayoutCompute {
  let baseline: { id: number; text: string } | null = null;
  return {
    handle(request, post) {
      const asked = request.baseline;
      if (asked?.text !== undefined) baseline = { id: asked.id, text: asked.text };
      const reply = computeLayout(request);
      post(reply);
      if (!asked || !('layout' in reply) || baseline?.id !== asked.id) return;
      try {
        post({
          seq: request.seq,
          marks: markPages(reply.layout, changesOf(baseline.text, request.source)),
        });
      } catch (error) {
        // The pages are drawn; without marks they stay unmarked, and the layout hasn't failed.
        console.error(
          `Show changes’ marks failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  };
}
