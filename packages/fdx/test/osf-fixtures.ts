// Open Screenplay Format documents for the tests, written by hand in the shape the spec describes
// (OSF 4.0, docs/DECISIONS.md, Imports and Markdown out): a `document` root holding `info`,
// `settings`, `styles`, `paragraphs` of `para`, each with a `style` and `text` runs, a `titlepage`,
// `spelling`, and `lists`. Only the element and attribute names come from the spec; every value
// and every word of text is the tests' own.

/** Text as XML wants it inside an element or an attribute. */
export const xmlText = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The built-in styles, by name, with the tests' own made-up layout. */
export const BUILTIN_STYLES = `
    <style name="Normal Text" font="Drafter Mono" size="11"/>
    <style name="Scene Heading" basestyle="Normal Text" allcaps="1"/>
    <style name="Action" basestyle="Normal Text"/>
    <style name="Character" basestyle="Normal Text" leftindent="500" allcaps="1"/>
    <style name="Parenthetical" basestyle="Normal Text" leftindent="400"/>
    <style name="Dialogue" basestyle="Normal Text" leftindent="300"/>
    <style name="Transition" basestyle="Normal Text" align="center" allcaps="1"/>
    <style name="Shot" basestyle="Normal Text" allcaps="1"/>`;

/** A document holding these paragraphs, with these styles (the built-ins by default) and extras. */
export function osf(
  paragraphs: string,
  { styles = BUILTIN_STYLES, titlepage = '', after = '' } = {},
): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<document type="Open Screenplay Format document" version="40">
  <info uuid="00000000-0000-4000-8000-000000000001" pagecount="1"/>
  <settings page_width="2100" page_height="2970" cont_text="(still)" more_text="(on)"/>
  <styles>${styles}
  </styles>
  <paragraphs>${paragraphs}
  </paragraphs>${titlepage ? `\n  <titlepage>${titlepage}</titlepage>` : ''}${after}
</document>`;
}

/** One `para`: its style (the `style` element's attributes), its runs, and its own attributes. */
export function para(
  style: string,
  runs: string | Array<[string, string]>,
  attrs = '',
  styleAttrs = '',
): string {
  const texts =
    typeof runs === 'string'
      ? `<text>${xmlText(runs)}</text>`
      : runs.map(([t, a]) => `<text${a ? ` ${a}` : ''}>${xmlText(t)}</text>`).join('');
  return `\n    <para${attrs ? ` ${attrs}` : ''}><style basestyle="${xmlText(style)}"${styleAttrs ? ` ${styleAttrs}` : ''}/>${texts}</para>`;
}

/** Every element of the format a script uses, once, in the shape the spec describes. */
export const ELEMENTS = osf(
  [
    para('Scene Heading', 'Ext. salt marsh - dawn', 'page_number="1" number="7"'),
    para('Action', 'Herons stand in the shallows.', 'synopsis="Fog lifts off the reeds."'),
    para('Action', [
      ['The tide ', ''],
      ['turns', 'bold="1"'],
      ['. A ', ''],
      ['slow', 'italic="1"'],
      [' gurgle, then ', ''],
      ['quiet', 'underline="1"'],
      ['.', ''],
    ]),
    para('Character', 'Wren', '', ''),
    para('Parenthetical', 'whispering'),
    para('Dialogue', 'Don’t move. Not yet.'),
    para('Transition', 'Smash cut to:'),
    para('Scene Heading', 'Int. boathouse - day', '', 'pagebreakbefore="1"'),
    para('Action', 'Low tide', '', 'align="center"'),
    para('Character', 'Wren', '', 'dualdialogue="1"'),
    para('Dialogue', 'Now.'),
    para('Character', 'Abel'),
    para('Dialogue', 'Now!'),
    para('Shot', 'Close on the oars'),
  ].join(''),
);

/** Styles of the writer's own on top of the built-ins: a chain to Action, and some with no base. */
export const CUSTOM_STYLES = `${BUILTIN_STYLES}
    <style name="Insert" basestyle="Action"/>
    <style name="Lower Third" basestyle="Insert"/>
    <style name="Cast List" basestyle="Normal Text"/>
    <style name="Act Break" basestyle="Normal Text" align="center" allcaps="1"/>
    <style name="Banner" basestyle="Action" bold="1" underline="1" align="center"/>`;
