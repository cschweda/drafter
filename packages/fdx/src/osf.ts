// Open Screenplay Format import (Imports, Call 1): Fade In's document format, read in the shape
// its spec describes (OSF 4.0, with 2.0's names too; docs/DECISIONS.md, Imports and Markdown
// out). An OSF document is turned into the tree the Final Draft importer already reads, so every
// rule that importer proved (forced markers, escaping, speeches, the title page by order, notes
// kept whole, the `ignored` cap, linear time) holds for OSF unchanged.
//
// The adapter copies no attribute through (Call 7): it writes only the attributes it maps, so an
// OSF file can't set one of Drafter's own marks. Every attribute it doesn't map is named once in
// `ignored`, as `para@name`, `style@name`, or `text@name`.
import { type FdxImport, type ImportSource, importTree, MAX_IGNORED } from './import';
import { readXml, type XmlElement, XmlError, type XmlNode } from './xml';

/** Why a document was refused: it isn't XML the reader accepts, or isn't an OSF document. */
export class OsfError extends Error {
  constructor(
    readonly reason: string,
    options?: ErrorOptions,
  ) {
    super(`This isn’t an Open Screenplay Format document: ${reason}`, options);
    this.name = 'OsfError';
  }
}

/**
 * The elements of an OSF document that hold its settings and formatting rather than its writing:
 * the document's identity, page and numbering settings, the style sheet (read for the paragraphs'
 * styles, never brought in), spelling, the lists of names and colours, and revision marks.
 */
export const OSF_IGNORED: ReadonlySet<string> = new Set([
  'info',
  'settings',
  'styles',
  'style',
  'header_style',
  'footer_style',
  'spelling',
  'user_dictionary',
  'lists',
  'marks',
  'mark',
]);

/** The base styles that are kinds of Final Draft's, by the same name. */
const MAPPED: ReadonlySet<string> = new Set([
  'Scene Heading',
  'Action',
  'Character',
  'Parenthetical',
  'Dialogue',
  'Transition',
  'Shot',
]);

/** The built-in styles that print in capitals when the document's style sheet doesn't say. */
const CAPS_BY_DEFAULT: ReadonlySet<string> = new Set([
  'Scene Heading',
  'Character',
  'Transition',
  'Shot',
]);

/** The most base-style links followed from a paragraph's style (Call 8). */
const MAX_CHAIN = 8;

/** The most characters (code points) of a style or element name a note shows. */
const MAX_LABEL_CHARS = 255;

/** The style every other descends from, and a paragraph's when it names none. */
const NORMAL_TEXT = 'Normal Text';

/**
 * The names of the Final Draft tree the importer reads as its own. An OSF element of one of these
 * names, which no OSF document has, is renamed so it can only be a note.
 */
const RESERVED: ReadonlySet<string> = new Set([
  'FinalDraft',
  'Content',
  'TitlePage',
  'AltCollection',
  'Alt',
  'Alts',
  'AltId',
  'ListItems',
  'ListItem',
  'ScriptNotes',
  'ScriptNote',
  'Paragraph',
  'Text',
  'SceneProperties',
  'DualDialogue',
  'OmittedScene',
  'Picture',
]);

/** The attributes a `para`, its `style`, and a `text` run have that the adapter maps. */
const PARA_ATTRS: ReadonlySet<string> = new Set(['number', 'scene_number', 'note', 'synopsis']);
const STYLE_ATTRS: ReadonlySet<string> = new Set([
  'basestyle',
  'basestylename',
  'align',
  'allcaps',
  'bold',
  'italic',
  'underline',
  'dualdialogue',
  'pagebreakbefore',
]);
const TEXT_ATTRS: ReadonlySet<string> = new Set(['bold', 'italic', 'underline']);

/** A style's own settings that the adapter maps, each unset when the style doesn't say. */
interface Look {
  align?: string;
  allcaps?: boolean;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}

interface StyleDef extends Look {
  base: string | undefined;
}

/** A flag attribute: `1` (or `true`) on, anything else off, absent unset. */
function flag(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  return value === '1' || value === 'true';
}

/** The style's base: `basestyle` (4.0) or `basestylename` (2.0). */
const baseOf = (element: XmlElement) => element.attrs.basestyle ?? element.attrs.basestylename;

function lookOf(element: XmlElement): Look {
  const { align, allcaps, bold, italic, underline } = element.attrs;
  return {
    align: align?.trim().toLowerCase(),
    allcaps: flag(allcaps),
    bold: flag(bold),
    italic: flag(italic),
    underline: flag(underline),
  };
}

/** Fills what `look` leaves unset from `from`. */
function inherit(look: Look, from: Look): void {
  look.align ??= from.align;
  look.allcaps ??= from.allcaps;
  look.bold ??= from.bold;
  look.italic ??= from.italic;
  look.underline ??= from.underline;
}

/**
 * A name as a note shows it: on one line, unable to end or open a note or a boneyard (a space
 * inside each `]]`, `[[`, `/*`, and `*\/`), and at most 255 characters, a longer one ending in "…".
 */
function label(name: string): string {
  let safe = name
    .replace(/\s+/g, ' ')
    .replace(/\](?=\])/g, '] ')
    .replace(/\[(?=\[)/g, '[ ')
    .replace(/\/(?=\*)/g, '/ ')
    .replace(/\*(?=\/)/g, '* ');
  // Only a long name is cut, so only it is split into characters.
  if (safe.length > MAX_LABEL_CHARS) {
    const chars = Array.from(safe);
    if (chars.length > MAX_LABEL_CHARS) safe = `${chars.slice(0, MAX_LABEL_CHARS - 1).join('')}…`;
  }
  return safe;
}

const element = (name: string, attrs: Record<string, string>, children: XmlNode[]): XmlElement => ({
  name,
  attrs,
  children,
});

const isElement = (node: XmlNode): node is XmlElement => typeof node !== 'string';

/** A paragraph of the Final Draft tree, with what the adapter must place after it. */
interface Item {
  node: XmlElement;
  /** Its Final Draft type, or null for an element that isn't a paragraph. */
  type: string | null;
  /** The first speaker of a dual dialogue pair. */
  dual: boolean;
  /** Its note, as a `General` paragraph Drafter reads as a note. */
  note: XmlElement | null;
}

const SPEECH_PARTS: ReadonlySet<string> = new Set(['Parenthetical', 'Dialogue']);

class Adapter {
  private readonly styles = new Map<string, StyleDef>();
  private readonly ignoredNames = new Set<string>();

  constructor(private readonly root: XmlElement) {}

  private ignore(name: string) {
    this.ignoredNames.add(name);
  }

  run(): { tree: XmlElement; ignored: string[] } {
    const root = this.root;
    if (
      root.name !== 'document' ||
      !root.children.some((c) => isElement(c) && c.name === 'paragraphs')
    ) {
      throw new OsfError('it has no document root holding paragraphs.');
    }
    for (const child of root.children) {
      if (isElement(child) && child.name === 'styles') this.readStyles(child);
    }
    const content: XmlNode[] = [];
    const after: XmlNode[] = [];
    for (const child of root.children) {
      if (!isElement(child)) {
        const note = this.loose(child, 'document');
        if (note) after.push(note);
      } else if (child.name === 'paragraphs') {
        for (const node of this.place(this.items(child))) content.push(node);
      } else if (child.name === 'titlepage') {
        after.push(this.titlePage(child));
      } else {
        const other = this.other(child);
        if (other) after.push(other);
      }
    }
    const tree = element('FinalDraft', {}, [element('Content', {}, content), ...after]);
    return { tree, ignored: [...this.ignoredNames] };
  }

  /** The style sheet: each `style` by its name (the first of a name), with its base and look. */
  private readStyles(styles: XmlElement) {
    for (const child of styles.children) {
      if (!isElement(child) || child.name !== 'style') continue;
      const name = child.attrs.name;
      if (name === undefined || this.styles.has(name)) continue;
      this.styles.set(name, { base: baseOf(child), ...lookOf(child) });
    }
  }

  /**
   * A paragraph style's kind and look: its name read through the style sheet, base by base, at
   * most 8 links, until a base style Drafter maps. A cycle, a missing style, or a longer chain
   * gives the paragraph's own style name, which comes in through the unmapped path. Its look is
   * the first each setting is given on the way.
   */
  private resolve(name: string, look: Look): string {
    const seen = new Set<string>();
    let current = name;
    for (let links = 0; ; links++) {
      const def = this.styles.get(current);
      if (def) inherit(look, def);
      if (MAPPED.has(current)) {
        look.allcaps ??= CAPS_BY_DEFAULT.has(current);
        return current;
      }
      if (!def || def.base === undefined || seen.has(current) || links === MAX_CHAIN) return name;
      seen.add(current);
      current = def.base;
    }
  }

  /** Loose text in a container, as an element the importer brings in as a note. */
  private loose(text: string, container: string): XmlElement | null {
    if (text.trim() === '') return null;
    return element(`${container} text`, {}, [text.trim()]);
  }

  /**
   * An element the adapter doesn't map: a setting is named in `ignored`; one holding text is an
   * element of its own name, holding only its text, which the importer brings in as a note.
   */
  private other(node: XmlElement): XmlElement | null {
    if (OSF_IGNORED.has(node.name)) {
      this.ignore(node.name);
      return null;
    }
    const texts: string[] = [];
    const walk = (at: XmlElement) => {
      for (const child of at.children) {
        if (!isElement(child)) {
          if (child.trim() !== '') texts.push(child.trim());
        } else if (OSF_IGNORED.has(child.name)) this.ignore(child.name);
        else walk(child);
      }
    };
    walk(node);
    const name = RESERVED.has(node.name) ? `${node.name} element` : label(node.name);
    if (texts.length === 0) {
      this.ignore(name);
      return null;
    }
    return element(name, {}, [texts.join('\n')]);
  }

  /** The text of a run, an element inside it included, but a setting's. */
  private textOf(node: XmlElement): string {
    let text = '';
    for (const child of node.children) {
      if (!isElement(child)) text += child;
      else if (OSF_IGNORED.has(child.name)) this.ignore(child.name);
      else text += this.textOf(child);
    }
    return text;
  }

  /** The paragraphs of a `paragraphs` (or a title page's), each with its type and note. */
  private items(container: XmlElement, titlePage = false): Item[] {
    const items: Item[] = [];
    for (const child of container.children) {
      if (!isElement(child)) {
        const note = this.loose(child, container.name);
        if (note) items.push({ node: note, type: null, dual: false, note: null });
      } else if (child.name === 'para') items.push(this.para(child, titlePage));
      else {
        const other = this.other(child);
        if (other) items.push({ node: other, type: null, dual: false, note: null });
      }
    }
    return items;
  }

  private para(para: XmlElement, titlePage: boolean): Item {
    for (const name of Object.keys(para.attrs)) {
      if (titlePage || !PARA_ATTRS.has(name)) this.ignore(`para@${name}`);
    }
    const styleElement = para.children.find(
      (c): c is XmlElement => isElement(c) && c.name === 'style',
    );
    const look: Look = styleElement ? lookOf(styleElement) : {};
    if (styleElement) {
      for (const name of Object.keys(styleElement.attrs)) {
        if (!STYLE_ATTRS.has(name)) this.ignore(`style@${name}`);
      }
    }
    const own = styleElement ? baseOf(styleElement) : undefined;
    const styleName = own === undefined || own.trim() === '' ? NORMAL_TEXT : own;
    const resolved = this.resolve(styleName, look);
    const mapped = MAPPED.has(resolved);

    const children: XmlNode[] = [];
    for (const child of para.children) {
      if (!isElement(child)) {
        if (child.trim() !== '') children.push(element('Text', {}, [child]));
      } else if (child.name === 'text') children.push(this.textRun(child, look));
      else if (child !== styleElement) {
        const other = this.other(child);
        if (other) children.push(other);
      }
    }

    const attrs: Record<string, string> = {};
    const center = look.align === 'center';
    if (titlePage) {
      if (center) attrs.Alignment = 'Center';
      return {
        node: element('Paragraph', attrs, children),
        type: 'Title',
        dual: false,
        note: null,
      };
    }
    const type = mapped ? resolved : label(styleName);
    attrs.Type = type;
    if (resolved === 'Action' && center) attrs.Alignment = 'Center';
    if (flag(styleElement?.attrs.pagebreakbefore)) attrs.StartsNewPage = 'Yes';
    const number = para.attrs.number ?? para.attrs.scene_number;
    if (number !== undefined) attrs.Number = number;
    const synopsis = para.attrs.synopsis;
    if (synopsis !== undefined && synopsis.trim() !== '') {
      children.push(element('SceneProperties', { Summary: synopsis }, []));
    }
    const noteText = para.attrs.note;
    const note =
      noteText !== undefined && noteText.trim() !== ''
        ? element('Paragraph', { Type: 'General', DrafterNote: 'Yes' }, [
            element('Text', {}, [noteText]),
          ])
        : null;
    const dual = type === 'Character' && flag(styleElement?.attrs.dualdialogue) === true;
    return { node: element('Paragraph', attrs, children), type, dual, note };
  }

  /** A `text` run as a Final Draft `Text`, its emphasis and capitals from it or its paragraph. */
  private textRun(text: XmlElement, paragraph: Look): XmlElement {
    for (const name of Object.keys(text.attrs)) {
      if (!TEXT_ATTRS.has(name)) this.ignore(`text@${name}`);
    }
    const own = lookOf(text);
    const parts: string[] = [];
    if (own.bold ?? paragraph.bold) parts.push('Bold');
    if (own.italic ?? paragraph.italic) parts.push('Italic');
    if (own.underline ?? paragraph.underline) parts.push('Underline');
    if (paragraph.allcaps) parts.push('AllCaps');
    return element('Text', parts.length > 0 ? { Style: parts.join('+') } : {}, [this.textOf(text)]);
  }

  /**
   * The items in their places: a dual dialogue pair (a `Character` marked `dualdialogue`, its
   * speech, the next `Character` and its speech) in a `DualDialogue`, and each note after its
   * paragraph, or after the speech or pair it sits in, which a note can't break.
   */
  private place(items: Item[]): XmlNode[] {
    const out: XmlNode[] = [];
    let pending: XmlElement[] = [];
    const flush = () => {
      for (const note of pending) out.push(note);
      pending = [];
    };
    let k = 0;
    while (k < items.length) {
      const item = items[k] as Item;
      if (item.type === null || !SPEECH_PARTS.has(item.type)) flush();
      if (item.dual) {
        // The first speaker, its parts, then the second speaker and its parts, if one follows.
        let end = k + 1;
        while (end < items.length && SPEECH_PARTS.has(items[end]?.type ?? '')) end++;
        if (items[end]?.type === 'Character') {
          end++;
          while (end < items.length && SPEECH_PARTS.has(items[end]?.type ?? '')) end++;
        }
        const pair = items.slice(k, end);
        out.push(
          element('Paragraph', {}, [
            element(
              'DualDialogue',
              {},
              pair.map((i) => i.node),
            ),
          ]),
        );
        for (const i of pair) if (i.note) out.push(i.note);
        k = end;
        continue;
      }
      out.push(item.node);
      if (item.note) {
        if (item.type === 'Character' || SPEECH_PARTS.has(item.type ?? '')) pending.push(item.note);
        else out.push(item.note);
      }
      k++;
    }
    flush();
    return out;
  }

  /** The title page: its paragraphs, centered or not, which the importer reads by their order. */
  private titlePage(titlePage: XmlElement): XmlElement {
    const items = this.items(titlePage, true);
    const paragraphs = items.filter((i) => i.type !== null).map((i) => i.node);
    const others = items.filter((i) => i.type === null).map((i) => i.node);
    return element('TitlePage', {}, [element('Content', {}, paragraphs), ...others]);
  }
}

/**
 * An OSF document's tree as the Final Draft tree `importTree` reads: `FinalDraft` › `Content` ›
 * `Paragraph Type StartsNewPage Number Alignment` › `Text Style`, with `DualDialogue`,
 * `SceneProperties Summary`, and `TitlePage`; only text and the attributes it maps. `ignored`
 * names the settings and the attributes it left out, each once. Throws `OsfError` when the root
 * isn't a `document` holding `paragraphs`.
 */
export function osfToFdxTree(root: XmlElement): { tree: XmlElement; ignored: string[] } {
  return new Adapter(root).run();
}

const SOURCE: ImportSource = { prefix: 'osf', ignored: OSF_IGNORED };

/**
 * Reads an Open Screenplay Format document as Fountain text, with `[[osf: …]]` notes for what
 * Drafter has no element for. Throws `OsfError` when the text isn't XML the strict reader accepts
 * (the reader's `XmlError` is its `cause`) or isn't an OSF document.
 */
export function fromOsf(xml: string): FdxImport {
  let root: XmlElement;
  try {
    root = readXml(xml);
  } catch (error) {
    if (error instanceof XmlError) throw new OsfError(error.message, { cause: error });
    throw error;
  }
  const { tree, ignored } = osfToFdxTree(root);
  const result = importTree(tree, SOURCE);
  // The adapter's names first, then any the importer added; the importer's beyond its first
  // `MAX_IGNORED` are counted, not named.
  // The count can run a little over: a name the importer counted but didn't list may be one the
  // adapter already named, and is then counted twice. That only happens past `MAX_IGNORED` names,
  // by a few at most, where an exact count matters little.
  const names = new Set(ignored);
  for (const name of result.ignored) names.add(name);
  return {
    ...result,
    ignored: [...names].slice(0, MAX_IGNORED),
    ignoredCount: names.size + (result.ignoredCount - result.ignored.length),
  };
}
