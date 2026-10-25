import type { Doc, DocJSON } from './types';

/** The CST as plain data, for `drafter build --json` and other tools. */
export function toJSON(doc: Doc): DocJSON {
  return {
    v: 1,
    titlePage: doc.titlePage && {
      span: { ...doc.titlePage.span },
      raw: doc.titlePage.raw,
      fields: doc.titlePage.fields.map(({ key, value, span }) => ({
        key,
        value: [...value],
        span: { ...span },
      })),
    },
    blocks: doc.blocks.map((block) => ({
      kind: block.kind,
      forced: block.forced,
      span: { ...block.span },
      leading: block.leading,
      lines: block.lines.map((line) => line.raw),
      sem: block.sem,
    })),
    trailing: doc.trailing,
    meta: doc.meta,
    diagnostics: doc.diagnostics.map((d) => ({ ...d, span: { ...d.span } })),
  };
}
