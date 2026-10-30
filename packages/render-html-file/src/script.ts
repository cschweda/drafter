import type { Doc, TitleField } from '@drafter/fountain';
import type { Layout } from '@drafter/layout';
import type { Template } from '@drafter/templates';
import { bandHtml } from './band';
import { type FontStyle, fontFaces, stylesUsed } from './fonts';
import { pagesHtml } from './pages';
import { readingHtml } from './reading';
import { headerHtml, htmlShell } from './shell';

/** What a script's file is made from. */
export interface ScriptHtmlInput {
  /** The parsed script, with the export's title page already applied (`titlePageFor`). */
  doc: Doc;
  /** Its pages: `paginate(doc, template, { sceneNumbers })`. */
  layout: Layout;
  template: Template;
  /** Whether `[[notes]]` appear, in Reading only (design §3.3). */
  notes: 'leave-out' | 'include';
  /** Courier Prime's bytes by style; the styles the pages use must be here. */
  fonts: Partial<Record<FontStyle, Uint8Array>>;
  /** The file's title, as plain text: the export's title, else the file's name. */
  title: string;
  lang: string;
  /** For `<meta name="generator">`, e.g. "Drafter 0.22.0". */
  generator: string;
  /** The header's small line, made by the caller, e.g. "Stage play · 94 pages · About 1 h 50 min". */
  kindLine: string;
}

/** A title-page field's text, its value lines joined by a space; '' when it has none. */
const fieldText = (field: TitleField | undefined) =>
  field?.runs
    .map((runs) =>
      runs
        .map((run) => run.text)
        .join('')
        .trim(),
    )
    .filter(Boolean)
    .join(' ') ?? '';

/** A title-page field's text by its key (any of `keys`, in lower case), or ''. */
export function titleField(doc: Doc, ...keys: string[]): string {
  const fields = doc.titlePage?.fields ?? [];
  return fieldText(fields.find((f) => keys.includes(f.key.trim().toLowerCase())));
}

/**
 * The lines under the header's title, from the title page as the export kept it (design §3.3):
 * the credit and the author as one line ("Written by Wren Okafor"), then the source and the draft
 * date, each when there is one. The title itself is the header's own; a script with no title
 * page (the export's "none") has only the title.
 */
export function titleLines(doc: Doc): string[] {
  const field = (...keys: string[]) => titleField(doc, ...keys);
  const byline = [field('credit'), field('author', 'authors')].filter(Boolean).join(' ');
  return [byline, field('source'), field('draft date')].filter(Boolean);
}

/**
 * A script's whole file (design §3): the header (the caller's kind line, the title, and the title
 * page's credit, author, source, and draft date), the band, and `<main>` with the Pages view and
 * then the hidden Reading view, in the Studio frame (`htmlShell`). The Pages view carries the
 * band's targets as `b-<block>` and Reading as `r-b-<block>`; the file's script sends a band link
 * to the second while Reading shows. Courier Prime is embedded in the styles the pages use, and
 * the generated rules of the pages, the band, and the character colors go into the one style.
 */
export function renderScriptHtml(input: ScriptHtmlInput): string {
  const { doc, layout, template } = input;
  const band = bandHtml(doc, template, layout);
  const pages = pagesHtml(layout, template, band.blocks);
  const reading = readingHtml(doc, layout, input.notes);
  return htmlShell({
    title: input.title,
    lang: input.lang,
    generator: input.generator,
    kind: 'script',
    header: headerHtml(input.kindLine, input.title, titleLines(doc)),
    nav: band.html,
    body: pages.html + reading.html,
    fontFaces: fontFaces(input.fonts, stylesUsed(layout)),
    rules: [pages.rules, band.rules, reading.rules].filter(Boolean).join('\n'),
  });
}
