import { changesOf, markPages, type PageMarks } from '@drafter/compare';
import { type Doc, metadataSpan, parse } from '@drafter/fountain';
import type { Layout, LockedPages, Marks } from '@drafter/layout';
import { paginate } from '@drafter/layout';
import { lockedPagesOf, productionMarks } from '@drafter/production';
import type { LayoutProductionFacts, LayoutReply, LayoutRequest } from '../editor/layout-client';

/**
 * The script's text without its `/* drafter *\/` block, as `scriptText` makes it, from a parse
 * already made. The block is the last thing in the text, so everywhere before it an offset into
 * this text is the same offset into the whole text: the anchors and marks found in it fit the
 * layout of the whole text.
 */
function scriptOf(doc: Doc): string {
  const span = metadataSpan(doc);
  return span ? doc.source.slice(0, span.from) + doc.source.slice(span.to) : doc.source;
}

/** The paginate options for a locked script; none when its pages can't be placed, so it is laid out unlocked. */
function lockedOf(doc: Doc, facts: LayoutProductionFacts | undefined): { locked?: LockedPages } {
  if (!facts) return {};
  try {
    return { locked: lockedPagesOf(facts.pages, facts.baseline, scriptOf(doc)) };
  } catch (error) {
    console.error(`Locked pages failed: ${error instanceof Error ? error.message : String(error)}`);
    return {};
  }
}

/** A request's parse and its reply: the layout, on the locked pages with `facts`; or what went wrong. */
function layoutOf(
  { seq, source, template }: LayoutRequest,
  facts?: LayoutProductionFacts,
): { doc: Doc | null; reply: LayoutReply } {
  let doc: Doc | null = null;
  try {
    doc = parse(source);
    return { doc, reply: { seq, layout: paginate(doc, template, lockedOf(doc, facts)) } };
  } catch (error) {
    return { doc, reply: { seq, error: error instanceof Error ? error.message : String(error) } };
  }
}

/**
 * Parses and paginates one request; with `facts` (a locked script's), on its locked pages. An error
 * is a reply, so the worker never throws.
 */
export function computeLayout(request: LayoutRequest, facts?: LayoutProductionFacts): LayoutReply {
  return layoutOf(request, facts).reply;
}

export interface LayoutCompute {
  /**
   * Answers `request`: its layout, then, with a baseline, Show changes' marks (version-history
   * design §4.2), then, with a production, its revision marks (production design §6.2). Resolves
   * once every reply is posted.
   */
  handle(request: LayoutRequest, post: (reply: LayoutReply) => void): Promise<void>;
}

/** Show changes' marks of `layout` (the text `newer`) against `older`. */
const marksOf = (layout: Layout, older: string, newer: string): PageMarks =>
  markPages(layout, changesOf(older, newer));

/** No marks: what a layout gets when its marks fail. */
const NO_MARKS: PageMarks = { lines: [], gaps: [], stops: [] };

/**
 * A locked script's revision marks in `current`, its text without the block. A closed set with no
 * marks (the locked White draft's, until Clear marks…) is left out: it marks nothing, and leaving it
 * out spares fingerprinting every line at each keystroke.
 */
const revisionMarksOf = (facts: LayoutProductionFacts, current: string): Promise<Marks> =>
  productionMarks({
    current,
    baseline: facts.baseline,
    open: facts.open,
    closed: facts.closed.filter((set) => (set.lines?.length ?? 0) + (set.gaps?.length ?? 0) > 0),
  });

/** No revision marks: what a locked layout gets when its marks fail. */
const NO_REVISION_MARKS: Marks = { spans: [], gaps: [] };

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * The layout worker's logic. It keeps the baseline it was last sent (Show changes' text to compare
 * with), whose text comes only when its id changes. A request with a baseline is answered twice
 * with its own number: the layout first, so the pages never wait on a diff, then the marks of that
 * same text against the baseline (Call 17), so a layout's marks are always its own.
 *
 * A locked script (production design §6.2, §7.2) is answered the same way: the request carries the
 * production's id, and its facts only when the id changes. Its layout is of the locked pages, and
 * after it (and after Show changes' marks) come its revision marks, of the same text, with the same
 * number. The marks are offsets into the text without its block, which are offsets into the whole
 * text (`scriptOf`); the client puts them on the layout (`applyMarks`) and shows it once. An id the
 * worker has no facts for is laid out unlocked, and answered no revision marks.
 */
export function createLayoutCompute(mark = marksOf, revise = revisionMarksOf): LayoutCompute {
  let baseline: { id: number; text: string } | null = null;
  let production: { id: number; facts: LayoutProductionFacts } | null = null;
  /** The newest request handled, so a locked request's marks aren't made once a newer one has come. */
  let latest = 0;
  return {
    async handle(request, post) {
      latest = Math.max(latest, request.seq);
      const asked = request.baseline;
      if (asked?.text !== undefined) baseline = { id: asked.id, text: asked.text };
      const wanted = request.production;
      if (wanted?.locked) production = { id: wanted.id, facts: wanted.locked };
      const facts = wanted && production?.id === wanted.id ? production.facts : undefined;

      const { doc, reply } = layoutOf(request, facts);
      post(reply);
      if (!('layout' in reply)) return;

      if (asked && baseline?.id === asked.id) {
        let marks: PageMarks;
        try {
          marks = mark(reply.layout, baseline.text, request.source);
        } catch (error) {
          // The pages are drawn and the layout hasn't failed: they get no marks, rather than keep
          // waiting with the last layout's.
          console.error(`Show changes’ marks failed: ${messageOf(error)}`);
          marks = NO_MARKS;
        }
        post({ seq: request.seq, marks });
      }

      // The client holds a locked request's layout until its revision marks come, so a request
      // with a production is always answered them: none when the worker has no facts for its id.
      if (!wanted) return;
      if (!facts || !doc) {
        post({ seq: request.seq, production: NO_REVISION_MARKS });
        return;
      }
      // Requests that came while typing go first. The client waits only for the newest layout,
      // so marks for one a newer request has replaced would be thrown away: they aren't made.
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (latest > request.seq) return;
      let marks: Marks;
      try {
        marks = await revise(facts, scriptOf(doc));
      } catch (error) {
        console.error(`Revision marks failed: ${messageOf(error)}`);
        marks = NO_REVISION_MARKS;
      }
      if (latest > request.seq) return;
      post({ seq: request.seq, production: marks });
    },
  };
}
