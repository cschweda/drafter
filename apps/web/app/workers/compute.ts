import { changesOf, markPages, type PageMarks } from '@drafter/compare';
import { parse } from '@drafter/fountain';
import type { Layout } from '@drafter/layout';
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
/** Show changes' marks of `layout` (the text `newer`) against `older`. */
const marksOf = (layout: Layout, older: string, newer: string): PageMarks =>
  markPages(layout, changesOf(older, newer));

/** No marks: what a layout gets when its marks fail. */
const NO_MARKS: PageMarks = { lines: [], gaps: [], stops: [] };

export function createLayoutCompute(mark = marksOf): LayoutCompute {
  let baseline: { id: number; text: string } | null = null;
  return {
    handle(request, post) {
      const asked = request.baseline;
      if (asked?.text !== undefined) baseline = { id: asked.id, text: asked.text };
      const reply = computeLayout(request);
      post(reply);
      if (!asked || !('layout' in reply) || baseline?.id !== asked.id) return;
      let marks: PageMarks;
      try {
        marks = mark(reply.layout, baseline.text, request.source);
      } catch (error) {
        // The pages are drawn and the layout hasn't failed: they get no marks, rather than keep
        // waiting with the last layout's.
        console.error(
          `Show changes’ marks failed: ${error instanceof Error ? error.message : String(error)}`,
        );
        marks = NO_MARKS;
      }
      post({ seq: request.seq, marks });
    },
  };
}
