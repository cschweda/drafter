import { type Block, type Doc, parse } from '@drafter/fountain';
import { type Scene, sceneIndex } from '@drafter/outline';
import { builtins, type Template } from '@drafter/templates';
import { hash32, hash53 } from './hash';

// Scene prints (version-history design §3.2): what a scene version is reduced to, so versions
// can be told apart by hash and matched by a bottom-k sketch of their three-word shingles.

/** How many of a scene's smallest shingle hashes its sketch keeps (Call 5). */
export const SKETCH_K = 64;

/** How prints are made; a cached print of another version is read as a miss (design §3.6). */
export const PRINT_VERSION = 1;

export interface ScenePrint {
  /** `hash53` of the scene's source, normalized: the same hash is the same version. */
  hash: string;
  /** The heading, folded for matching (`headingKey`). */
  headingKey: string;
  /** The heading as the scene index gives it, for display. */
  heading: string;
  /** How many distinct three-word shingles the scene's printed words make. */
  shingles: number;
  /** The `SKETCH_K` smallest 32-bit shingle hashes (all of them when there are fewer), ascending. */
  sketch: Uint32Array;
  /** Printed words, as the scene index counts them. */
  words: number;
  /** The scene's first three printed lines after its heading, at most 240 characters. */
  preview: string;
}

/** A scene's place in one version of the text. */
export interface SceneSlot {
  hash: string;
  /** 1, 2, 3… in script order. */
  ordinal: number;
  /** The scene's span in that text: from its heading to the end of its last block. */
  from: number;
  to: number;
  /** A section heading (an act, in a play) came right before it. */
  section: boolean;
  /** That section heading's title, when there is one (Put back opens the section again). */
  sectionTitle?: string;
}

/** A section heading in one version of the text: its title, and where its start is. */
export interface SectionPlace {
  title: string;
  /** The end of the heading (and of a synopsis under it): where a scene opening it goes. */
  at: number;
}

export interface SnapshotScenes {
  /** Every scene, in order. */
  slots: SceneSlot[];
  /** Every section heading, in order. */
  sections: SectionPlace[];
  /** One print for each distinct version among them, but for the ones the caller already has. */
  prints: ScenePrint[];
}

const PREVIEW_LINES = 3;
const PREVIEW_MAX = 240;

/** Kinds that print nothing, whose words are not a scene's (the heading is left out apart). */
const UNPRINTED = new Set(['section', 'synopsis', 'note', 'boneyard', 'page_break']);

/** Words as the scene index counts them (`wordsIn` in `@drafter/outline`'s timing). */
const WORD = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;

const SCREENPLAY = builtins['us-screenplay'] as Template;

/** The template `doc` names in its settings, else the screenplay. */
export function templateOf(doc: Doc): Template {
  const id = doc.meta?.template;
  return (typeof id === 'string' ? builtins[id] : undefined) ?? SCREENPLAY;
}

/**
 * A heading folded for matching: upper case, the locked number (`#12A#`) dropped, every dash
 * read as `-`, whitespace collapsed, and trailing punctuation dropped.
 */
export function headingKey(heading: string): string {
  return heading
    .toUpperCase()
    .replace(/\s*#[^#\s]*#\s*$/u, '')
    .replace(/[‐‑‒–—―]/gu, '-')
    .replace(/\s+/gu, ' ')
    .trim()
    .replace(/[.,;:!?]+$/u, '')
    .trim();
}

/** A scene's source as hashed: `\r\n` as `\n`, trailing spaces off each line, no trailing blank lines. */
function normalized(source: string): string {
  return source
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n+$/, '');
}

/**
 * The shingle count and sketch of a run of words (lowercased already): every three in a row,
 * joined by a space. A scene too short to make three of those (under five words) adds every two
 * in a row, and one under three words every word, so a line or two grown longer under its heading
 * still shares shingles with what it was. None make none.
 */
export function sketchOf(words: readonly string[]): { shingles: number; sketch: Uint32Array } {
  if (words.length === 0) return { shingles: 0, sketch: new Uint32Array(0) };
  const sizes = words.length < 3 ? [3, 2, 1] : words.length < 5 ? [3, 2] : [3];
  const hashes: number[] = [];
  for (const size of sizes) {
    for (let i = 0; i + size <= words.length; i++) {
      const w = words[i] as string;
      hashes.push(
        hash32(
          size === 3
            ? `${w} ${words[i + 1]} ${words[i + 2]}`
            : size === 2
              ? `${w} ${words[i + 1]}`
              : w,
        ),
      );
    }
  }
  const all = Uint32Array.from(hashes).sort();
  let distinct = 0;
  for (let i = 0; i < all.length; i++) {
    if (i === 0 || all[i] !== all[i - 1]) all[distinct++] = all[i] as number;
  }
  return { shingles: distinct, sketch: all.slice(0, Math.min(distinct, SKETCH_K)) };
}

/** The scene's printed words (lowercased) and preview lines, from the blocks after its heading. */
function printedOf(blocks: readonly Block[], scene: Scene): { words: string[]; preview: string } {
  const words: string[] = [];
  const lines: string[] = [];
  for (let i = scene.block + 1; i < blocks.length; i++) {
    const block = blocks[i] as Block;
    if (block.span.from >= scene.span.to) break;
    if (UNPRINTED.has(block.kind)) continue;
    for (const line of block.lines) {
      if (line.transparent) continue;
      let text = '';
      for (const run of line.inline) text += run.text;
      for (const word of text.toLowerCase().match(WORD) ?? []) words.push(word);
      const shown = text.trim();
      if (shown !== '' && lines.length < PREVIEW_LINES) lines.push(shown);
    }
  }
  const preview = lines.join('\n');
  return {
    words,
    preview: preview.length > PREVIEW_MAX ? `${preview.slice(0, PREVIEW_MAX - 1)}…` : preview,
  };
}

/** Parses `text` with the template it names (else the screenplay), and prints each scene. */
export function scenePrints(text: string, known?: (hash: string) => boolean): SnapshotScenes {
  const doc = parse(text);
  const index = sceneIndex(doc, templateOf(doc));
  const slots: SceneSlot[] = [];
  const sections: SectionPlace[] = [];
  const prints: ScenePrint[] = [];
  const seen = new Set<string>();
  /** The section heading right before the scene, if one was. */
  let section: string | null = null;
  for (const item of index.items) {
    if (item.kind === 'section') {
      sections.push({ title: item.title, at: item.introEnd });
      section = item.title;
      continue;
    }
    const scene = item;
    const hash = hash53(normalized(text.slice(scene.span.from, scene.span.to)));
    slots.push({
      hash,
      ordinal: scene.ordinal,
      from: scene.span.from,
      to: scene.span.to,
      section: section !== null,
      ...(section !== null && { sectionTitle: section }),
    });
    section = null;
    if (seen.has(hash)) continue;
    seen.add(hash);
    if (known?.(hash)) continue;
    const { words, preview } = printedOf(doc.blocks, scene);
    prints.push({
      hash,
      headingKey: headingKey(scene.heading),
      heading: scene.heading,
      ...sketchOf(words),
      words: scene.words,
      preview,
    });
  }
  return { slots, sections, prints };
}
