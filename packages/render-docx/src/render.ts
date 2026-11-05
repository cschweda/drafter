// The manuscript as a .docx: every part as UTF-8, stored (not compressed) in a zip by
// `@drafter/archive`'s writer, the content types first, as some readers expect.

import { zipStored } from '@drafter/archive';
import type { Manuscript } from '@drafter/novel';
import type { Paper } from '@drafter/templates';
import {
  appProps,
  contentTypes,
  coreProps,
  document,
  documentRels,
  header,
  packageRels,
  settings,
  styles,
} from './parts';

/**
 * Writes a novel's standard manuscript as a Word file: the same title page, running header, parts,
 * chapters, scene breaks, END, and notes as the PDF, in named styles. `lang` is the document's
 * language (a BCP 47 tag, such as `en-US`); `created`, if given, is the file's creation date. Pure
 * and deterministic: the same manuscript and options always make the same bytes.
 */
export function renderManuscriptDocx(
  ms: Manuscript,
  opts: { paper: Paper; lang: string; created?: Date },
): Uint8Array {
  const encoder = new TextEncoder();
  // A document must name a language; an empty one would say none.
  const lang = opts.lang.trim() || 'en-US';
  const parts: [string, string][] = [
    ['[Content_Types].xml', contentTypes()],
    ['_rels/.rels', packageRels()],
    ['docProps/core.xml', coreProps(ms, opts.created)],
    ['docProps/app.xml', appProps()],
    ['word/document.xml', document(ms, opts.paper)],
    ['word/styles.xml', styles(ms.font, lang, opts.paper)],
    ['word/settings.xml', settings(lang)],
    ['word/header1.xml', header(ms)],
    ['word/_rels/document.xml.rels', documentRels()],
  ];
  return zipStored(parts.map(([name, xml]) => ({ name, data: encoder.encode(xml) })));
}
