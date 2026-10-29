import { type BlockKind, type Doc, parse } from '@drafter/fountain';
import { readXml, type XmlElement, XmlError } from './xml';

// Final Draft import (technical design §6.3): the inverse of `toFdx`, written as Fountain text,
// never as a `Doc`, so an imported script is parsed and checked like any other. Fountain decides
// a block's kind from its text, so every block is read back by the parser before it is written:
// when the plain text would read as another kind, the block gets its forced marker, and when no
// marker can hold it, it comes in as action with a `[[fdx: Type]]` note, counted in `mapped`.

/** What an import produced, and what it could not map. */
export interface FdxImport {
  /** The script as Fountain text. */
  text: string;
  /** The title page's Title, as plain text, or null when there is none. */
  title: string | null;
  /**
   * What came in as notes because Drafter has no element for it, with how many of each: paragraph
   * types and elements as `[[fdx: …]]` notes, and Final Draft's script notes (`Script note`), which
   * are `[[Writer: …]]` notes when they name their writer.
   */
  mapped: Array<{ type: string; count: number }>;
  /**
   * The formatting and settings elements of the file that were left out, each named once: the
   * first `MAX_IGNORED` of them, so a hostile file can't make the list as large as itself.
   */
  ignored: string[];
  /** How many different names were left out, `ignored`'s included. */
  ignoredCount: number;
}

/** Why a file was refused: it isn't XML the reader accepts, or isn't a Final Draft document. */
export class FdxError extends Error {
  constructor(reason: string, options?: ErrorOptions) {
    super(`This isn’t a Final Draft file: ${reason}`, options);
    this.name = 'FdxError';
  }
}

/**
 * The elements of a Final Draft file that hold its formatting and settings rather than its
 * writing: page layout, element settings, header and footer, fonts, smart type lists, revisions,
 * macros, and the like. They are reported by name in `ignored`, not brought in as notes.
 */
export const IGNORED: ReadonlySet<string> = new Set([
  'ElementSettings',
  'PageLayout',
  'HeaderAndFooter',
  'TextState',
  'WindowState',
  'SplitState',
  'SmartType',
  'MoresAndContinueds',
  'LockedPages',
  'Revisions',
  'Macros',
  'SceneNumberOptions',
  'PageNumberFormat',
  'SpellCheckIgnoreLists',
  'Watermarking',
  'DisplayBoards',
  'FontSpec',
  // Breakdown tags: categories, and ids naming stretches of the script's own text.
  'TagData',
  // Blocks a Final Draft 13 file carries (names seen in its own sample script): an embedded
  // image's encoded bytes, references, the cast and voices, the writers and their markup, the
  // navigator, outline and length settings, and character charts. None is the script's writing.
  'Images',
  'Image',
  'DocumentRef',
  'Actors',
  'Cast',
  'CastList',
  'CharacterHighlighting',
  'ScriptNavigatorPreferences',
  'Writers',
  'WriterMarkup',
  'Navigator',
  'Outlines',
  'TargetScriptLength',
  'Characters',
  // A display setting: the columns of a list view (the beat board's, among others).
  'TableColumnSettings',
]);

/** The most names `ignored` lists; `ignoredCount` says how many there were. */
export const MAX_IGNORED = 50;

/** An element whose content is never text for the script: a setting, or an image's bytes. */
const skipped = (name: string) => IGNORED.has(name) || name === 'Picture';

/** An `Outline N (label)` paragraph type: a section of depth N. */
const OUTLINE = /^Outline ([1-9])(?:\s|$)/;

/**
 * All the text inside an element, each child on its own line: its paragraphs, and anything else it
 * holds beside them, so nothing in a note, an alternate, or a beat is left out.
 */
function paragraphsText(element: XmlElement): string {
  return element.children
    .map((c) => (typeof c === 'string' ? c : skipped(c.name) ? '' : textOf(c)))
    .map((t) => t.trim())
    .filter(Boolean)
    .join('\n');
}

/** Text with its runs of whitespace made one space, for comparing what reads the same. */
const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim();

/**
 * Text that can't end a note early: a space after each `]` that a `]` follows, and after a last
 * `]`, as `@drafter/notes` writes a note's body (`safeBody`, `writeNote`).
 */
const closeSafe = (text: string) => {
  const safe = text.replace(/\](?=\])/g, '] ');
  return safe.endsWith(']') ? `${safe} ` : safe;
};

/** A note on its own line holding `text`, on one line. */
const ownNote = (text: string) => `[[${closeSafe(oneLine(text))}]]`;

interface Style {
  bold: boolean;
  italic: boolean;
  underline: boolean;
}

/** One character of a paragraph with its style, or a whole `[[…]]` note, which has none. */
type Tok = { ch: string; style: Style; raw?: string } | { note: string };

type Flag = keyof Style;

const isNote = (tok: Tok): tok is { note: string } => 'note' in tok;
const isSpace = (ch: string) => /\s/.test(ch);

/**
 * The emphasis markers, in the order they are preferred when they cover the same stretch:
 * underline outermost (its `_` never merges with `*`), then `***` for bold and italic together.
 */
const MARKERS: ReadonlyArray<{ flags: Flag[]; marker: string }> = [
  { flags: ['underline'], marker: '_' },
  { flags: ['bold', 'italic'], marker: '***' },
  { flags: ['bold'], marker: '**' },
  { flags: ['italic'], marker: '*' },
];

/** The marker a scene number has to fit, as the parser reads it. */
const SCENE_NUMBER = /^[\p{L}\p{N}.-]+$/u;
/** A title-page key the parser accepts. */
const TITLE_KEY = /^[\p{L}\p{N}][\p{L}\p{N} _'-]*$/u;

/** Text as Fountain lines want it: one kind of line break, and four spaces for a tab. */
const normalize = (text: string) => text.replace(/\r\n?/g, '\n').replace(/\t/g, '    ');

/** A note's text with any blank line inside it made a two-space line, so the note stays closed. */
const noteText = (text: string) =>
  text
    .split('\n')
    .map((line, k) => (k > 0 && /^\s*$/.test(line) ? '  ' : line))
    .join('\n');

/**
 * All the text inside an element, an element inside it included (`<Text>a<B>b</B></Text>`), except
 * what a setting or an image holds.
 */
function textOf(element: XmlElement): string {
  return element.children
    .map((c) => (typeof c === 'string' ? c : skipped(c.name) ? '' : textOf(c)))
    .join('');
}

/** The text directly inside an element, outside its children, or '' when that is only spaces. */
function bareText(element: XmlElement): string {
  const text = element.children.filter((c) => typeof c === 'string').join('');
  return text.trim() === '' ? '' : text.trim();
}

/** A `[[fdx: …]]` note naming what Drafter couldn't map; a `]]` inside can't end it early. */
const fdxNote = (label: string) => `[[fdx: ${closeSafe(label.replace(/\s+/g, ' '))}]]`;

/** The paragraph's `<Text>` runs, as lines of styled characters and notes. */
function linesOf(paragraph: XmlElement): Tok[][] {
  // A paragraph with no `<Text>` but text of its own (`<Paragraph>Hi</Paragraph>`) is read as it.
  const hasText = paragraph.children.some((c) => typeof c !== 'string' && c.name === 'Text');
  const bare = bareText(paragraph);
  if (!hasText && bare !== '') return fromPlain(bare);
  let plain = '';
  const styles: Style[] = [];
  for (const child of paragraph.children) {
    if (typeof child === 'string' || child.name !== 'Text') continue;
    const parts = (child.attrs.Style ?? '').split('+');
    const style = {
      bold: parts.includes('Bold'),
      italic: parts.includes('Italic'),
      underline: parts.includes('Underline'),
    };
    const text = normalize(textOf(child));
    plain += text;
    for (let k = 0; k < text.length; k++) styles.push(style);
  }
  return splitLines(plain, styles);
}

/** Cuts styled text into lines, keeping each `[[…]]` whole: notes stay notes (controller ruling 2). */
function splitLines(plain: string, styles: readonly Style[]): Tok[][] {
  const lines: Tok[][] = [[]];
  // Once a search for `]]` fails, none follows, so later `[[` aren't searched for again: a text
  // full of unclosed openers is read in one pass rather than one pass per opener.
  let closes = true;
  let i = 0;
  while (i < plain.length) {
    const line = lines[lines.length - 1] as Tok[];
    if (closes && plain.startsWith('[[', i)) {
      const close = plain.indexOf(']]', i + 2);
      if (close === -1) closes = false;
      if (close !== -1) {
        line.push({ note: noteText(plain.slice(i, close + 2)) });
        i = close + 2;
        continue;
      }
    }
    const ch = plain[i] as string;
    if (ch === '\n') lines.push([]);
    else line.push({ ch, style: styles[i] as Style });
    i++;
  }
  return lines;
}

/** A line with nothing on it but spaces. */
const blank = (line: readonly Tok[]) => line.every((tok) => !isNote(tok) && isSpace(tok.ch));

/** The lines without blank ones at either end, for kinds where those can't be written. */
function trimBlank(lines: Tok[][]): Tok[][] {
  let from = 0;
  let to = lines.length;
  while (from < to && blank(lines[from] as Tok[])) from++;
  while (to > from && blank(lines[to - 1] as Tok[])) to--;
  return lines.slice(from, to);
}

/**
 * Lines with each `[[` that has no `]]` in its own paragraph written `[\[`. The lines of a speech
 * and of the title page have no blank line between their paragraphs, so a stray `[[` in one could
 * close in the next and hide both as a note. Fountain has no escape for `[`, so the backslash shows.
 */
function breakStrays(lines: Tok[][]): Tok[][] {
  return lines.map((line) =>
    line.map((tok, k) => {
      const before = line[k - 1];
      return !isNote(tok) && tok.ch === '[' && before && !isNote(before) && before.ch === '['
        ? { ...tok, raw: '\\[' }
        : tok;
    }),
  );
}

/** The lines with each note's line breaks made spaces, so no note runs over a line. */
const flatNotes = (lines: Tok[][]): Tok[][] =>
  lines.map((line) =>
    line.map((tok) => (isNote(tok) ? { note: tok.note.replace(/\s*\n\s*/g, ' ') } : tok)),
  );

const plainStyle: Style = { bold: false, italic: false, underline: false };
const fromPlain = (text: string): Tok[][] =>
  trimBlank(
    splitLines(
      normalize(text),
      Array.from({ length: text.length }, () => plainStyle),
    ),
  );

/** The visible text of some lines, notes left out. */
const visible = (lines: readonly Tok[][]) =>
  lines.map((line) => line.map((tok) => (isNote(tok) ? '' : tok.ch)).join(''));

/**
 * A line for a kind the parser reads no emphasis in (heading, cue, transition, section, synopsis).
 * Backslashes are literal there, so the only thing to break is a `/*` that would open a boneyard.
 * These kinds are one line long, so a note's line breaks become spaces.
 */
function plainLine(line: readonly Tok[]): string {
  let out = '';
  for (const tok of line) {
    if (isNote(tok)) out += tok.note.replace(/\s*\n\s*/g, ' ');
    else if (tok.raw !== undefined) out += tok.raw;
    else out += tok.ch === '*' && out.endsWith('/') ? '\\*' : tok.ch;
  }
  return out;
}

const escapeChar = (ch: string) => (ch === '*' || ch === '_' || ch === '\\' ? `\\${ch}` : ch);
const emit = (tok: Tok) => (isNote(tok) ? tok.note : (tok.raw ?? escapeChar(tok.ch)));

/** The end of the stretch from `from` whose characters all carry `flags`, edge spaces left out. */
function stretchEnd(line: readonly Tok[], from: number, to: number, flags: readonly Flag[]) {
  let last = from;
  for (let e = from; e < to; e++) {
    const tok = line[e] as Tok;
    if (isNote(tok)) continue;
    if (!flags.every((f) => tok.style[f])) break;
    if (!isSpace(tok.ch)) last = e;
  }
  return last + 1;
}

/**
 * Emphasis, written as nested markers. At each place a style starts, the marker that covers the
 * longest stretch is opened, and what differs inside it is written inside, one level down. Spaces
 * at a stretch's edges go outside its markers, since a marker beside a space doesn't open or close.
 */
function styled(line: readonly Tok[], from: number, to: number, active: ReadonlySet<Flag>): string {
  let out = '';
  let k = from;
  while (k < to) {
    const tok = line[k] as Tok;
    const fits = (flags: Flag[]) =>
      !isNote(tok) && flags.every((f) => tok.style[f] && !active.has(f));
    if (isNote(tok) || isSpace(tok.ch) || !MARKERS.some((m) => fits(m.flags))) {
      out += emit(tok);
      k++;
      continue;
    }
    let best = MARKERS[0] as (typeof MARKERS)[number];
    let bestEnd = -1;
    for (const m of MARKERS) {
      if (!fits(m.flags)) continue;
      const end = stretchEnd(line, k, to, m.flags);
      if (end > bestEnd) {
        best = m;
        bestEnd = end;
      }
    }
    const inner = styled(line, k, bestEnd, new Set([...active, ...best.flags]));
    out += best.marker + inner + best.marker;
    k = bestEnd;
  }
  return out;
}

/** Each visible character that isn't a space, with its style, as a string to compare. */
function signature(chars: Array<{ ch: string } & Style>): string {
  return chars
    .filter((c) => !isSpace(c.ch))
    .map((c) => `${c.ch}${+c.bold}${+c.italic}${+c.underline}`)
    .join('');
}

/**
 * A line for a kind with emphasis. Markers that touch merge into one run the parser reads
 * differently (`*a*` then `**b**` is `*a***b**`), so the written line is read back, as forced
 * action, and when its styles differ it is written plain instead: the words always survive.
 */
function emphasisLine(line: readonly Tok[]): string {
  const plain = line.map(emit).join('');
  if (line.every((tok) => isNote(tok) || !Object.values(tok.style).some(Boolean))) return plain;
  const written = styled(line, 0, line.length, new Set());
  const runs = parse(`!${written}`).blocks.flatMap((b) => b.lines.flatMap((l) => l.inline));
  const actual = runs.flatMap((r) => [...r.text].map((ch) => ({ ...r, ch })));
  const expected = line.flatMap((tok) =>
    isNote(tok) ? [] : [...(tok.raw ?? tok.ch)].map((ch) => ({ ch, ...tok.style })),
  );
  return signature(actual) === signature(expected) ? written : plain;
}

/** Puts a backslash before the first visible character of a line, past spaces and notes. */
function guardStart(text: string): string {
  let i = 0;
  while (i < text.length) {
    if (text.startsWith('[[', i)) {
      const close = text.indexOf(']]', i + 2);
      if (close !== -1) {
        i = close + 2;
        continue;
      }
    }
    if (!isSpace(text[i] as string)) break;
    i++;
  }
  return `${text.slice(0, i)}\\${text.slice(i)}`;
}

/** The first visible character of a written line, past spaces and notes. */
const firstVisible = (text: string) => guardStart(text).match(/\\(.?)/s)?.[1] ?? '';

/** The kinds of the blocks a piece of text reads as, or null when it reads as a title page. */
function readAs(text: string): { kinds: BlockKind[]; doc: Doc } | null {
  const doc = parse(text);
  if (doc.titlePage) return null;
  return { kinds: doc.blocks.map((b) => b.kind), doc };
}

/** Text without its spaces, for comparing what prints where the edges' spaces may be trimmed. */
const squash = (text: string) => text.replace(/\s+/g, '');

const same = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((x, k) => x === b[k]);

/** Speech parts in order, with neighbouring dialogue (or lyric) lines read as one block. */
function collapse(kinds: readonly BlockKind[]): BlockKind[] {
  const out: BlockKind[] = [];
  for (const kind of kinds) {
    if (kind !== 'parenthetical' && out[out.length - 1] === kind) continue;
    out.push(kind);
  }
  return out;
}

type SpeechKind = 'parenthetical' | 'dialogue' | 'lyric';

interface Speech {
  cue: Tok[][];
  parts: Array<{ kind: SpeechKind; lines: Tok[][] }>;
  dual: boolean;
}

interface Field {
  key: string;
  lines: Tok[][];
}

class Importer {
  private readonly blocks: string[] = [];
  private readonly mappedCounts = new Map<string, number>();
  private readonly ignoredNames = new Set<string>();
  private pageBreak = false;
  private speech: Speech | null = null;
  /** The cue being read is the second speaker of a `DualDialogue`. */
  private dualCue = false;
  /** Synopses from paragraphs inside the open speech, written once it is. */
  private afterSpeech: string[] = [];
  /** The alternates of the file's `AltCollection`, by id, and the ids a paragraph has used. */
  private readonly alts = new Map<string, string>();
  private readonly usedAlts = new Set<string>();

  run(root: XmlElement): FdxImport {
    const content = root.children.find(
      (c): c is XmlElement => typeof c !== 'string' && c.name === 'Content',
    );
    if (root.name !== 'FinalDraft' || !content) {
      throw new FdxError('it has no FinalDraft root holding a Content element.');
    }
    for (const child of root.children) {
      if (typeof child !== 'string' && child.name === 'AltCollection') this.collectAlts(child);
    }
    this.content(content);
    let titlePage: { text: string; title: string | null } | null = null;
    for (const child of root.children) {
      if (typeof child === 'string' || child === content) continue;
      if (child.name === 'TitlePage' && !titlePage) titlePage = this.titlePage(child);
      else if (child.name === 'AltCollection') this.unusedAlts(child);
      else if (child.name === 'ListItems') this.listItems(child);
      else if (child.name === 'ScriptNotes') this.scriptNotes(child);
      else this.other(child);
    }
    this.flushSpeech();

    const body = this.blocks.join('\n\n');
    const parts = [titlePage?.text, body].filter((part): part is string => !!part);
    return {
      text: parts.length > 0 ? `${parts.join('\n\n')}\n` : '',
      title: titlePage?.title ?? null,
      mapped: [...this.mappedCounts].map(([type, count]) => ({ type, count })),
      ignored: [...this.ignoredNames].slice(0, MAX_IGNORED),
      ignoredCount: this.ignoredNames.size,
    };
  }

  /** Pushes a block where it belongs: after the open speech, which can't be broken, or now. */
  private place(text: string) {
    if (this.speech) this.afterSpeech.push(text);
    else this.push(text);
  }

  /** Reads each `Alt` of an `AltCollection`: its text, by its `Id`. */
  private collectAlts(collection: XmlElement) {
    for (const alt of collection.children) {
      if (typeof alt === 'string' || alt.name !== 'Alt') continue;
      const id = alt.attrs.Id;
      if (id !== undefined && !this.alts.has(id)) this.alts.set(id, paragraphsText(alt));
    }
  }

  /**
   * A paragraph's `Alts`: its text is the current one, so every alternate whose text differs from
   * it comes in as a note after it, the first time any paragraph names it. Which one is current (`Current`) needn't be trusted: the text
   * in the paragraph is what Final Draft shows.
   */
  private alternates(alts: XmlElement, shown: () => string) {
    for (const child of alts.children) {
      if (typeof child === 'string' || child.name !== 'AltId') continue;
      const id = textOf(child).trim();
      // Each alternate comes in once, at its first reference: a file naming one large alternate
      // from many places would otherwise make a script far larger than the file.
      if (this.usedAlts.has(id)) continue;
      const text = this.alts.get(id);
      this.usedAlts.add(id);
      if (text === undefined || text === '' || oneLine(text) === shown()) continue;
      this.count('Alternate');
      this.place(fdxNote(`Alternate: ${text}`));
    }
  }

  /**
   * The alternates no paragraph named come in as notes, after the script; the rest are used. A
   * later `Alt` with an id already seen (only the first is looked up) comes in too, unless its text
   * is the first's.
   */
  private unusedAlts(collection: XmlElement) {
    const seen = new Set<string>();
    for (const alt of collection.children) {
      if (typeof alt === 'string' || alt.name !== 'Alt') continue;
      const id = alt.attrs.Id;
      const text = paragraphsText(alt);
      if (id !== undefined) {
        const first = !seen.has(id);
        seen.add(id);
        if (first ? this.usedAlts.has(id) : oneLine(text) === oneLine(this.alts.get(id) ?? ''))
          continue;
        this.usedAlts.add(id);
      }
      if (text === '') continue;
      this.flushSpeech();
      this.count('Alternate');
      this.push(fdxNote(`Alternate: ${text}`));
    }
  }

  /** Beat cards (`ListItem Type="Beat"`), one note each, after the script, with their titles. */
  private listItems(items: XmlElement) {
    for (const item of items.children) {
      if (typeof item === 'string') continue;
      if (item.name !== 'ListItem' || item.attrs.Type !== 'Beat') {
        this.other(item);
        continue;
      }
      const title = oneLine(item.attrs.Title ?? '');
      const content = item.children.find(
        (c): c is XmlElement => typeof c !== 'string' && c.name === 'Content',
      );
      const text = content ? oneLine(paragraphsText(content)) : '';
      if (title === '' && text === '') {
        this.ignore('ListItem');
        continue;
      }
      this.flushSpeech();
      this.count('Beat');
      const label =
        title === '' ? `Beat: ${text}` : text === '' ? `Beat, ${title}` : `Beat, ${title}: ${text}`;
      this.push(fdxNote(label));
    }
  }

  /**
   * Final Draft's script notes, one note each, after the script (they anchor to a `Range` of the
   * script's text, which Drafter can't place yet). A note with a `WriterName` is headed by it, as
   * Drafter writes a reader's note (`[[Name: …]]`); one without says where it came from.
   */
  private scriptNotes(notes: XmlElement) {
    for (const note of notes.children) {
      if (typeof note === 'string') continue;
      if (note.name !== 'ScriptNote') {
        this.other(note);
        continue;
      }
      const text = oneLine(paragraphsText(note));
      if (text === '') {
        this.ignore('ScriptNote');
        continue;
      }
      this.flushSpeech();
      this.count('Script note');
      const writer = oneLine(note.attrs.WriterName ?? '').replaceAll(']]', '] ]');
      this.push(writer ? ownNote(`${writer}: ${text}`) : fdxNote(`Script note: ${text}`));
    }
  }

  private ignore(name: string) {
    this.ignoredNames.add(name);
  }

  private count(type: string) {
    this.mappedCounts.set(type, (this.mappedCounts.get(type) ?? 0) + 1);
  }

  /** Adds a block, after the page break waiting for it. */
  private push(text: string) {
    if (this.pageBreak) {
      this.blocks.push('===');
      this.pageBreak = false;
    }
    this.blocks.push(text);
  }

  private content(content: XmlElement) {
    for (const child of content.children) {
      if (typeof child === 'string') continue;
      if (child.name === 'Paragraph') this.paragraph(child);
      else this.other(child);
    }
  }

  /** An element Drafter doesn't map: settings are ignored, anything holding text is a note. */
  private other(element: XmlElement) {
    if (IGNORED.has(element.name)) {
      this.ignore(element.name);
      return;
    }
    const texts: string[] = [];
    const walk = (node: XmlElement) => {
      for (const child of node.children) {
        if (typeof child !== 'string') {
          if (skipped(child.name)) this.ignore(child.name);
          else walk(child);
        } else if (child.trim() !== '') texts.push(child.trim());
      }
    };
    walk(element);
    if (texts.length === 0) {
      this.ignore(element.name);
      return;
    }
    this.flushSpeech();
    this.action(fromPlain(texts.join('\n')), element.name);
  }

  private paragraph(paragraph: XmlElement) {
    const attrs = paragraph.attrs;
    const dual = paragraph.children.find(
      (c): c is XmlElement => typeof c !== 'string' && c.name === 'DualDialogue',
    );
    if (dual) {
      this.flushSpeech();
      // Anything beside the pair in its paragraph, or between its speeches, has no place there.
      this.strayText(paragraph);
      for (const child of paragraph.children) {
        if (typeof child === 'string' || child === dual) continue;
        if (child.name === 'SceneProperties') this.propertiesContent(child);
        else this.other(child);
      }
      let speakers = 0;
      for (const child of dual.children) {
        if (typeof child === 'string') {
          // Text written straight into the pair, between its speeches, is kept as a note there.
          if (child.trim() === '') continue;
          this.flushSpeech();
          this.action(fromPlain(child.trim()), 'DualDialogue text');
          continue;
        }
        if (child.name !== 'Paragraph') {
          this.other(child);
          continue;
        }
        if (child.attrs.Type === 'Character') speakers++;
        this.dualCue = speakers === 2 && child.attrs.Type === 'Character';
        this.paragraph(child);
      }
      this.dualCue = false;
      this.flushSpeech();
      // A summary on the pair's paragraph is a synopsis after it, as on any other paragraph.
      const summary = this.synopses(paragraph);
      if (summary !== null) this.push(summary);
      return;
    }

    const type = attrs.Type ?? 'Paragraph';
    // Blank lines print in action and dialogue, even a paragraph of nothing else (a blank line
    // the writer typed, written as a two-space line); in every other kind they are dropped.
    // A paragraph holding only a picture has no text to bring in; its note comes after.
    const pictureOnly =
      bareText(paragraph) === '' &&
      paragraph.children.some((c) => typeof c !== 'string' && c.name === 'Picture') &&
      !paragraph.children.some((c) => typeof c !== 'string' && c.name === 'Text');
    const all = pictureOnly ? [] : linesOf(paragraph);
    const lines = type === 'Action' || type === 'Dialogue' ? all : trimBlank(all);
    const inSpeech = type === 'Parenthetical' || type === 'Dialogue';
    const lyricMark = type === 'Dialogue' && attrs.DrafterLyric === 'Yes';
    if (attrs.StartsNewPage === 'Yes' && !(inSpeech && this.speech && !lyricMark)) {
      // Fountain can't break a page inside a speech, so a break there is left out, except before
      // a lyric Drafter wrote: it stands alone, and export put the break before it.
      this.flushSpeech();
      this.pageBreak = true;
    }
    // A summary or a note inside a speech waits for its end rather than breaking it.
    const aside = (type === 'Summary' || type === 'Note') && this.speech !== null;
    if (!inSpeech && !aside) this.flushSpeech();

    // A section's depth is 1 to 6, as export writes it; any other value (a huge one would make a
    // huge script) is a mark Drafter can't trust, so the paragraph comes in as unmapped.
    const sectionMark = attrs.DrafterSection;
    const section =
      sectionMark !== undefined && /^[1-6]$/.test(sectionMark) ? Number(sectionMark) : 0;
    const sectionType = type === 'General' || type === 'Scene Heading';
    // Final Draft's outline paragraphs (`Outline 1 (Acts)` and so on) are sections of their
    // depth, or of their `OutlineLevel` when they carry one; deeper than six is six.
    const outline = OUTLINE.exec(type);
    const level = attrs.OutlineLevel?.trim() ?? '';
    const outlineDepth = outline
      ? Math.min(Number(/^[1-9]$/.test(level) ? level : outline[1]), 6)
      : 0;
    const depth = sectionType && section > 0 ? section : outlineDepth;
    const isSection = depth > 0;
    if (sectionType && sectionMark !== undefined && !(section > 0)) {
      this.action(lines, type);
    } else if (isSection) {
      if (outlineDepth === 0 || lines.length > 0)
        this.push(`${'#'.repeat(depth)} ${lines.map(plainLine).join(' ').trim()}`.trimEnd());
    } else if (type === 'Summary') {
      // Final Draft's summary of the item before it: a synopsis in its place, which keeps the order
      // (after the speech, inside one).
      if (lines.length > 0) this.place(this.synopsisLines(lines));
    } else if ((type === 'General' && attrs.DrafterNote === 'Yes') || type === 'Note') {
      if (lines.length > 0 || type !== 'Note') this.place(this.note(lines));
    } else if (type === 'General' && attrs.DrafterSynopsis === 'Yes') {
      if (lines.length > 0) this.push(this.synopsisLines(lines));
    } else if (type === 'Scene Heading' || type === 'Shot') {
      if (lines.length > 0) this.heading(lines, type, attrs.Number);
    } else if (type === 'Action' && attrs.Alignment === 'Center') {
      if (lines.length > 0) this.centered(lines);
    } else if (type === 'Action') {
      if (lines.length > 0) this.action(lines);
    } else if (type === 'Character') {
      if (lines.length > 0)
        this.speech = { cue: breakStrays(lines), parts: [], dual: this.dualCue };
    } else if (inSpeech) {
      const lyric = type === 'Dialogue' && attrs.DrafterLyric === 'Yes';
      if (lines.length > 0) this.speechPart(type, lines, lyric);
    } else if (type === 'Transition') {
      if (lines.length > 0) this.transition(lines);
    } else {
      this.action(lines, type);
    }

    // A summary belongs on a heading, but one on any other paragraph is kept as a synopsis after
    // it (after its speech, inside one, since a speech can't be broken).
    const summary = this.synopses(paragraph);
    if (summary !== null) {
      const heading = isSection || type === 'Scene Heading' || type === 'Shot';
      if (!heading && this.speech) this.afterSpeech.push(summary);
      else this.push(summary);
    }

    this.strayText(paragraph);
    // The paragraph's text as an alternate is compared with it, worked out once and only if needed:
    // a paragraph can hold many `Alts`.
    let shownText: string | undefined;
    const shown = () => {
      shownText ??= oneLine(visible(all).join('\n'));
      return shownText;
    };
    for (const child of paragraph.children) {
      if (typeof child === 'string' || child.name === 'Text') continue;
      if (child.name === 'SceneProperties') this.propertiesContent(child);
      else if (child.name === 'Alts') this.alternates(child, shown);
      else if (child.name === 'Picture') {
        // A picture's image is in `Images`, which is ignored; a short note says one was here.
        this.count('Picture');
        this.place(fdxNote('Picture'));
      } else this.other(child);
    }
  }

  /** Text directly in a paragraph that also has `<Text>` runs comes in as a note. */
  private strayText(paragraph: XmlElement) {
    const hasText = paragraph.children.some((c) => typeof c !== 'string' && c.name === 'Text');
    const dual = paragraph.children.some((c) => typeof c !== 'string' && c.name === 'DualDialogue');
    const bare = bareText(paragraph);
    if (bare === '' || (!hasText && !dual)) return;
    this.flushSpeech();
    this.action(fromPlain(bare), 'Paragraph text');
  }

  /** What a `SceneProperties` holds besides its attributes has no place, so it comes in as notes. */
  private propertiesContent(properties: XmlElement) {
    for (const child of properties.children) {
      if (typeof child === 'string') continue;
      if (child.name === 'AttributedTitle') {
        // The scene's title again, styled: nothing new when it reads as the `Title` (a synopsis).
        const text = oneLine(paragraphsText(child));
        if (text === '' || text === oneLine(properties.attrs.Title ?? '')) this.ignore(child.name);
        else this.other(child);
      } else if (child.name === 'SceneArcBeats') {
        this.arcBeats(child);
      } else this.other(child);
    }
    const bare = bareText(properties);
    if (bare !== '') {
      this.flushSpeech();
      this.action(fromPlain(bare), 'SceneProperties');
    }
  }

  /** A scene's character arc beats, one note each after its heading, named for the character. */
  private arcBeats(beats: XmlElement) {
    for (const beat of beats.children) {
      if (typeof beat === 'string') continue;
      if (beat.name !== 'CharacterArcBeat') {
        this.other(beat);
        continue;
      }
      const text = oneLine(paragraphsText(beat));
      if (text === '') {
        this.ignore(beat.name);
        continue;
      }
      const name = oneLine(beat.attrs.Name ?? '');
      this.count('Arc beat');
      this.place(fdxNote(name ? `Arc beat, ${name}: ${text}` : `Arc beat: ${text}`));
    }
  }

  /**
   * A note on its own line (Drafter's `DrafterNote`, or Final Draft's `Note` paragraph), its
   * brackets written back. A `]` that would end it early gets a space after it (`closeSafe`).
   */
  private note(lines: Tok[][]): string {
    const text = lines.map((line) => line.map((tok) => (isNote(tok) ? tok.note : tok.ch)).join(''));
    return `[[${closeSafe(noteText(text.join('\n')))}]]`;
  }

  private synopsisLines(lines: Tok[][]): string {
    return lines.map((line) => `= ${plainLine(line)}`.trimEnd()).join('\n');
  }

  /** A scene's summary, one `=` line for each of its lines, or null when there is none. */
  private synopses(paragraph: XmlElement): string | null {
    const properties = paragraph.children.find(
      (c): c is XmlElement => typeof c !== 'string' && c.name === 'SceneProperties',
    );
    if (!properties) return null;
    // A scene title is Final Draft's short description of the scene: a synopsis, first.
    const text = [properties.attrs.Title, properties.attrs.Summary]
      .filter((part): part is string => !!part && part.trim() !== '')
      .join('\n');
    const lines = fromPlain(text);
    return lines.length > 0 ? this.synopsisLines(lines) : null;
  }

  private heading(source: Tok[][], type: string, numberAttr: string | undefined) {
    const number = numberAttr?.trim() ?? '';
    const valid = SCENE_NUMBER.test(number);
    let lines = source;
    if (number !== '' && !valid) {
      // A number the parser can't read as one (`12 A`) is kept in a note on the heading.
      this.count('Number');
      const last = [...(lines[lines.length - 1] ?? []), { ch: ' ', style: plainStyle }];
      lines = [...lines.slice(0, -1), [...last, { note: fdxNote(`Number ${number}`) }]];
    }
    const text = lines.map(plainLine).join(' ').trim();
    const suffix = valid ? ` #${number}#` : '';
    // A shot is forced even when it reads as a heading: Fountain has no shot, and a forced
    // heading prints like one.
    const candidates = type === 'Shot' ? [`.${text}`] : [text, `.${text}`];
    for (const candidate of candidates) {
      const read = readAs(candidate + suffix);
      const block = read?.doc.blocks[0];
      if (
        read &&
        same(read.kinds, ['scene_heading']) &&
        block?.kind === 'scene_heading' &&
        block.sem.number === (suffix ? number : null)
      ) {
        this.push(candidate + suffix);
        return;
      }
    }
    this.action(lines, type);
  }

  private centered(lines: Tok[][]) {
    for (const source of [lines, flatNotes(lines)]) {
      const text = source.map((line) => `> ${emphasisLine(line)} <`).join('\n');
      const read = readAs(text);
      if (read && same(read.kinds, ['centered'])) {
        this.push(text);
        return;
      }
    }
    this.action(lines, 'Centered');
  }

  private transition(lines: Tok[][]) {
    const text = lines.map(plainLine).join(' ').trim();
    for (const candidate of [text, `> ${text}`]) {
      const read = readAs(candidate);
      if (read && same(read.kinds, ['transition'])) {
        this.push(candidate);
        return;
      }
    }
    this.action(lines, 'Transition');
  }

  /**
   * Action, forced with `!` when its first line would read as anything else. A later line that
   * starts a section or synopsis gets a backslash: Fountain has no escape for `#` or `=`, so the
   * backslash prints, but the line stays in the action. With `type`, the paragraph is one Drafter
   * doesn't map, and a `[[fdx: Type]]` note at its end says what it was. A note over several lines
   * is kept as it is unless that breaks the block (a line holding only a note's end stands apart
   * as a note), and then it is put on one line.
   */
  private action(lines: Tok[][], type?: string) {
    let note = '';
    if (type !== undefined) {
      this.count(type);
      note = fdxNote(type);
      if (lines.every(blank)) {
        // Nothing to carry: the note alone says the paragraph was there.
        this.push(note);
        return;
      }
    }
    const write = (source: Tok[][]) => {
      const written = source.map((line, k) => {
        const text = emphasisLine(line);
        if (text.trim() === '') return '  ';
        return k > 0 && /^[#=]/.test(firstVisible(text)) ? guardStart(text) : text;
      });
      if (note) written[written.findLastIndex((line) => line.trim() !== '')] += ` ${note}`;
      return written.join('\n');
    };
    // The first line must print as it is: `!Bang` reads as action, but prints `Bang`.
    const firstLine = squash(visible(lines.slice(0, 1)).join(''));
    const reads = (candidate: string) => {
      const read = readAs(candidate);
      const shown = read?.doc.blocks[0]?.lines[0]?.inline.map((r) => r.text).join('') ?? '';
      return !!read && same(read.kinds, ['action']) && squash(shown) === firstLine;
    };
    const text = write(lines);
    const flat = write(flatNotes(lines));
    this.push([text, `!${text}`, flat, `!${flat}`].find(reads) ?? `!${text}`);
  }

  private speechPart(type: string, lines: Tok[][], lyric: boolean) {
    if (!this.speech) {
      if (lines.every(blank)) return;
      // A lyric stands alone in Fountain; dialogue and parentheticals need a speaker.
      if (lyric) this.push(this.lyricLines(lines));
      else this.action(lines, type);
      return;
    }
    const kind: SpeechKind =
      type === 'Parenthetical' ? 'parenthetical' : lyric ? 'lyric' : 'dialogue';
    this.speech.parts.push({ kind, lines: breakStrays(lines) });
  }

  /** A lyric's lines, each with its `~`; export made every run italic, so that is taken off. */
  private lyricLines(lines: Tok[][]): string {
    return lines
      .map((line) => {
        const plain = line.map((tok) =>
          isNote(tok) ? tok : { ch: tok.ch, style: { ...tok.style, italic: false } },
        );
        return `~${emphasisLine(plain)}`.trimEnd();
      })
      .join('\n');
  }

  /** Dialogue lines; one that would start a parenthetical, lyric, section, or synopsis is guarded. */
  private dialogueLines(lines: Tok[][]): string {
    return lines
      .map((line) => {
        const text = emphasisLine(line);
        if (text.trim() === '') return '  ';
        return /^[#=(~]/.test(firstVisible(text)) ? guardStart(text) : text;
      })
      .join('\n');
  }

  /**
   * A parenthetical keeps its parentheses, plain, since the parser looks for them as the line's
   * first and last characters and a style marker beside one would hide it. One Final Draft stored
   * without them gets them back.
   */
  private parentheticalLines(lines: Tok[][], joined: boolean): string {
    const space: Tok = { ch: ' ', style: plainStyle };
    const all = (
      joined ? [lines.flatMap((line, k) => (k > 0 ? [space, ...line] : line))] : lines
    ).map((line) => [...line]);
    const firstLine = all[0] as Tok[];
    const lastLine = all[all.length - 1] as Tok[];
    const edge = (line: Tok[], from: number, step: number) => {
      for (let k = from; k >= 0 && k < line.length; k += step) {
        const tok = line[k] as Tok;
        if (!isNote(tok) && !isSpace(tok.ch)) return k;
      }
      return -1;
    };
    const first = edge(firstLine, 0, 1);
    if (first !== -1 && (firstLine[first] as { ch: string }).ch === '(')
      firstLine[first] = { ch: '(', style: plainStyle };
    else firstLine.unshift({ ch: '(', style: plainStyle });
    const last = edge(lastLine, lastLine.length - 1, -1);
    if (last !== -1 && (lastLine[last] as { ch: string }).ch === ')')
      lastLine[last] = { ch: ')', style: plainStyle };
    else lastLine.push({ ch: ')', style: plainStyle });
    return all.map((line) => emphasisLine(line).trim() || '  ').join('\n');
  }

  /**
   * Writes the open speech: the cue, then its parts with no blank line between. The cue is forced
   * with `@` when the speech wouldn't read as one without it; a parenthetical over several lines
   * that still doesn't read as one is joined onto one line, and then notes over several lines are.
   */
  private flushSpeech() {
    const speech = this.speech;
    if (!speech) return;
    this.speech = null;
    const cue = speech.cue.map(plainLine).join(' ').trim() + (speech.dual ? ' ^' : '');
    // Lyric lines one after another are one block, so a lyric paragraph that follows another is
    // written on its own after a blank line, where it still joins this speech on export. That
    // holds only when nothing but lyrics follows: dialogue can't stand without its speaker.
    let cut = speech.parts.length;
    for (let k = speech.parts.length - 1; k > 0; k--) {
      if (speech.parts[k]?.kind !== 'lyric') break;
      if (speech.parts[k - 1]?.kind === 'lyric') cut = k;
    }
    const parts = speech.parts.slice(0, cut);
    const expected = collapse(['character', ...parts.map((p) => p.kind)]);
    const body = (joined: boolean, flat: boolean) =>
      parts.map(({ kind, lines }) => {
        const source = flat ? flatNotes(lines) : lines;
        return kind === 'parenthetical'
          ? this.parentheticalLines(source, joined)
          : kind === 'lyric'
            ? this.lyricLines(source)
            : this.dialogueLines(source);
      });
    const attempts = [
      [cue, false, false],
      [`@${cue}`, false, false],
      [`@${cue}`, true, false],
      [`@${cue}`, true, true],
    ] as const;
    const text = attempts
      .map(([line, joined, flat]) => [line, ...body(joined, flat)].join('\n'))
      .find((candidate) => {
        const read = readAs(candidate);
        const first = read?.doc.blocks[0];
        return (
          !!read &&
          same(read.kinds, expected) &&
          first?.kind === 'character' &&
          first.sem.dual === speech.dual
        );
      });
    if (text !== undefined) this.push(text);
    // No marker holds it (a dual cue whose `(` never closes can't take its `^`): the speech's
    // lines come in as action, with a note.
    else this.action([...speech.cue, ...parts.flatMap((p) => p.lines)], 'Character');
    for (const part of speech.parts.slice(cut)) this.push(this.lyricLines(part.lines));
    for (const summary of this.afterSpeech) this.push(summary);
    this.afterSpeech = [];
  }

  /** The title page: by Drafter's keys when the file has them, else by order and wording. */
  private titlePage(titlePage: XmlElement): { text: string; title: string | null } | null {
    const content = titlePage.children.find(
      (c): c is XmlElement => typeof c !== 'string' && c.name === 'Content',
    );
    // What the title page holds outside its paragraphs comes in as notes after the script.
    for (const child of titlePage.children) {
      if (typeof child === 'string') continue;
      if (child !== content) this.other(child);
      else
        for (const c of child.children)
          if (typeof c !== 'string' && c.name !== 'Paragraph') this.other(c);
    }
    const paragraphs = (content?.children ?? []).filter(
      (c): c is XmlElement => typeof c !== 'string' && c.name === 'Paragraph',
    );
    const keyed = paragraphs.some((p) => p.attrs.DrafterKey !== undefined);
    const fields = (keyed ? byKey(paragraphs) : byOrder(paragraphs)).map((field) => ({
      ...field,
      lines: breakStrays(field.lines),
    }));
    if (fields.length === 0) return null;

    const text = fields
      .map(({ key, lines }) => {
        const values = lines.map((line) => emphasisLine(line).trim()).filter((v) => v !== '');
        const [first, ...rest] = values;
        return [first ? `${key}: ${first}` : `${key}:`, ...rest.map((v) => `    ${v}`)].join('\n');
      })
      .join('\n');
    const titleField = fields.find((f) => f.key.toLowerCase() === 'title');
    const title = titleField
      ? visible(titleField.lines)
          .map((l) => l.trim())
          .filter(Boolean)
          .join(' ')
      : '';
    return { text, title: title || null };
  }
}

/** Fields by `DrafterKey`; a paragraph without one continues the field before it. */
function byKey(paragraphs: readonly XmlElement[]): Field[] {
  const fields: Field[] = [];
  for (const paragraph of paragraphs) {
    const key = paragraph.attrs.DrafterKey?.trim();
    const lines = linesOf(paragraph);
    const current = fields[fields.length - 1];
    if (key !== undefined && TITLE_KEY.test(key)) fields.push({ key, lines });
    else if (current) current.lines.push(...lines);
    else fields.push({ key: 'Notes', lines });
  }
  return fields;
}

/**
 * Fields by order, for a title page Final Draft wrote: the first centered block is the Title; a
 * centered "by" or "written by" is the Credit, and the centered block after it the Author; every
 * other line goes into one Notes field. Empty paragraphs, and ones holding only spaces (a blank
 * line is likely written as an empty `<Text>`, though no real file has confirmed it), only
 * separate blocks.
 */
function byOrder(paragraphs: readonly XmlElement[]): Field[] {
  const fields: Field[] = [];
  let gap = false;
  let current: Field | null = null;
  const add = (key: string, lines: Tok[][]) => {
    current = { key, lines };
    fields.push(current);
  };
  for (const paragraph of paragraphs) {
    const lines = trimBlank(linesOf(paragraph));
    if (lines.length === 0) {
      gap = true;
      continue;
    }
    const centered = paragraph.attrs.Alignment === 'Center';
    const words = visible(lines).join(' ').trim();
    const last = current as Field | null;
    if (centered && /^(?:written\s+)?by$/i.test(words)) add('Credit', lines);
    else if (centered && last?.key === 'Author' && !gap) last.lines.push(...lines);
    else if (centered && last?.key === 'Credit') add('Author', lines);
    else if (centered && last?.key === 'Title' && !gap) last.lines.push(...lines);
    else if (centered && !fields.some((f) => f.key === 'Title')) add('Title', lines);
    else {
      const notes = fields.find((f) => f.key === 'Notes');
      if (notes) notes.lines.push(...lines);
      else add('Notes', lines);
    }
    gap = false;
  }
  return fields;
}

/**
 * Reads a Final Draft file as Fountain text. Throws `FdxError` when the text isn't XML the strict
 * reader accepts (the reader's `XmlError` is its `cause`) or isn't a Final Draft document.
 */
export function fromFdx(xml: string): FdxImport {
  let root: XmlElement;
  try {
    root = readXml(xml);
  } catch (error) {
    if (error instanceof XmlError) throw new FdxError(error.message, { cause: error });
    throw error;
  }
  return new Importer().run(root);
}
