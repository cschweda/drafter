import { toFdx } from '@drafter/fdx';
import { parse } from '@drafter/fountain';
import { paginate } from '@drafter/layout';
import { FONT_FILES, type FontSet, renderPdf } from '@drafter/render-pdf';
import { renderText } from '@drafter/render-text';
import type { Template } from '@drafter/templates';

/** What the main thread sends the export worker: the whole text, and the template to lay it out with. */
export type ExportRequest = { kind: 'pdf' | 'txt' | 'fdx'; source: string; template: Template };
export type ExportReply = { data: Uint8Array | string } | { error: string };

/** Where the app serves Courier Prime (the same files the PDF embeds). */
const FONT_FOLDER = '/fonts/courier-prime/';

/** Fetches the four Courier Prime files from the app's own origin, which `connect-src 'self'` allows. */
export async function fetchFonts(
  fetcher: (url: string) => Promise<Response> = (url) => fetch(url),
): Promise<FontSet> {
  const styles = Object.keys(FONT_FILES) as (keyof FontSet)[];
  const loaded = await Promise.all(
    styles.map(async (style) => {
      const file = FONT_FILES[style];
      const response = await fetcher(`${FONT_FOLDER}${file}`);
      if (!response.ok) throw new Error(`Couldn’t load the font ${file}.`);
      return [style, new Uint8Array(await response.arrayBuffer())] as const;
    }),
  );
  return Object.fromEntries(loaded) as unknown as FontSet;
}

/**
 * Parses, paginates, and renders one request: what `drafter build --pdf` and `--txt` do. A Final
 * Draft file is the parsed script as `toFdx` writes it, with no pages. The fonts are loaded by the
 * first PDF and kept; a failed load is tried again next time. An error is a reply, so the worker
 * never throws.
 */
export function createExporter(loadFonts: () => Promise<FontSet> = fetchFonts) {
  let fonts: Promise<FontSet> | undefined;
  const fontsOnce = () => {
    fonts ??= loadFonts().catch((error) => {
      fonts = undefined;
      throw error;
    });
    return fonts;
  };

  return async ({ kind, source, template }: ExportRequest): Promise<ExportReply> => {
    try {
      if (kind === 'fdx') return { data: toFdx(parse(source), template) };
      const layout = paginate(parse(source), template);
      if (kind === 'txt') return { data: renderText(layout, template) };
      return { data: await renderPdf(layout, template, { fonts: await fontsOnce() }) };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  };
}
