/** A range of character offsets into the source: `from` inclusive, `to` exclusive. */
export interface Span {
  from: number;
  to: number;
}

export type BlockKind =
  | 'scene_heading'
  | 'action'
  | 'character'
  | 'parenthetical'
  | 'dialogue'
  | 'transition'
  | 'centered'
  | 'lyric'
  | 'section'
  | 'synopsis'
  | 'note'
  | 'boneyard'
  | 'page_break';

/** A styled piece of a line's printable text, mapped back to the source. */
export interface InlineRun {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  /** From the run's first character to just past its last one, in the source. */
  span: Span;
}

export interface Line {
  readonly span: Span;
  /** The exact source text, including trailing spaces and a CRLF's `\r`. */
  readonly raw: string;
  /** The printable text as styled runs, with markers, notes, and boneyard removed. */
  readonly inline: InlineRun[];
  /**
   * The line holds only notes or boneyard: it prints nothing. (An empty line
   * that isn't transparent, such as a two-space line in a speech, prints blank.)
   */
  readonly transparent: boolean;
}

export interface SceneHeadingSem {
  /** The heading without its marker or scene number. */
  text: string;
  /** `INT.`, `EXT.`, `INT./EXT.`, `I/E`, or `EST.` as typed; null when there is none. */
  prefix: string | null;
  location: string;
  time: string | null;
  /** The locked scene number from a trailing `#…#`. */
  number: string | null;
}

export interface CharacterSem {
  name: string;
  /** The parenthetical extensions as typed, such as `(V.O.)`; null when there are none. */
  extension: string | null;
  dual: boolean;
}

export interface SectionSem {
  depth: number;
  text: string;
}

export interface TextSem {
  text: string;
}

interface SemByKind {
  scene_heading: SceneHeadingSem;
  character: CharacterSem;
  section: SectionSem;
  page_break: null;
  action: TextSem;
  parenthetical: TextSem;
  dialogue: TextSem;
  transition: TextSem;
  centered: TextSem;
  lyric: TextSem;
  synopsis: TextSem;
  note: TextSem;
  boneyard: TextSem;
}

export type BlockSem = Exclude<SemByKind[BlockKind], null>;

interface BlockOf<K extends BlockKind> {
  readonly kind: K;
  /** True when a marker (`!`, `@`, `~`, `>`, `.`) decided the kind. */
  readonly forced: boolean;
  /** From the first character of the first line to the end of the last line. */
  readonly span: Span;
  /** The line break before the block, if any, plus the blank lines before it. */
  readonly leading: string;
  readonly lines: readonly Line[];
  /** Semantic data, computed on first read and cached. */
  readonly sem: SemByKind[K];
}

export type Block = { [K in BlockKind]: BlockOf<K> }[BlockKind];

export interface TitleField {
  /** The key as typed, such as `Draft date`. */
  key: string;
  /** One entry per value line: the inline value, then any indented continuation lines. */
  value: string[];
  /** The printable text of each value line as styled runs, emphasis markers removed. */
  runs: InlineRun[][];
  span: Span;
}

export interface TitlePage {
  span: Span;
  raw: string;
  fields: TitleField[];
}

/** The JSON stored in the trailing `/* drafter … *\/` block (technical design §8.6). */
export interface DrafterMeta {
  v?: number;
  template?: string;
  [key: string]: unknown;
}

export interface ParseDiagnostic {
  code: string;
  severity: 'error' | 'warning' | 'info';
  span: Span;
  message: string;
  /** Marks a lenient reading (technical design §2.5) for the Strict Fountain lint rules. */
  portability?: true;
}

/** A note (`[[…]]`) or a boneyard (`/* … *\/`) in the source. */
export interface Region {
  kind: 'note' | 'boneyard';
  /** From the opening `[[` or `/*` to just past the closing `]]` or `*\/`. */
  span: Span;
  /** False for a boneyard with no closing `*\/`: it runs to the end of the source. */
  closed: boolean;
}

export interface Doc {
  readonly titlePage: TitlePage | null;
  readonly blocks: readonly Block[];
  /** Whatever follows the last block, usually a final newline. */
  readonly trailing: string;
  readonly meta: DrafterMeta | null;
  readonly diagnostics: readonly ParseDiagnostic[];
  /**
   * Every note and boneyard, in source order. A `[[` that doesn't close before the next
   * blank line isn't one: it stays text, and a diagnostic reports it.
   */
  readonly regions: readonly Region[];
  readonly source: string;
}

/** A replacement in old-document offsets, the shape of one range of a CodeMirror ChangeSet. */
export interface TextChange {
  from: number;
  to: number;
  insert: string;
}

export interface DocJSON {
  v: 1;
  /** Derived runs are left out, as they are for lines. */
  titlePage: { span: Span; raw: string; fields: Array<Omit<TitleField, 'runs'>> } | null;
  blocks: Array<{
    kind: BlockKind;
    forced: boolean;
    span: Span;
    leading: string;
    lines: string[];
    sem: BlockSem | null;
  }>;
  trailing: string;
  meta: DrafterMeta | null;
  diagnostics: ParseDiagnostic[];
}
