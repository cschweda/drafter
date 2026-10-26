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
