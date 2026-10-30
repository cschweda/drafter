import { isSpace } from './words';

// Every scan of the writer's text here is linear: the window's title asks after every key, and a
// pattern that backtracks (a lazy `(.*?)` before optional spaces and `#`s, or `[^\]]*` tried from
// every `[`) took seconds on one long heading.

const isBlank = (c: string | undefined) => c === ' ' || c === '\t';

/**
 * An ATX heading's parts, read by hand: up to three spaces, 1 to 6 `#` (`prefix`), then a space or
 * a tab or the line's end, and the text, without the blanks around it or a closing run of `#`s (one
 * that follows a blank, or is all the text). Undefined when the line isn't one.
 */
function atx(line: string): { prefix: string; text: string } | undefined {
  let i = 0;
  while (i < 3 && line[i] === ' ') i++;
  let hashes = 0;
  while (line[i + hashes] === '#') hashes++;
  if (hashes < 1 || hashes > 6) return undefined;
  const prefix = line.slice(0, i + hashes);
  i += hashes;
  if (i < line.length && !isBlank(line[i])) return undefined;
  let start = i;
  while (start < line.length && isBlank(line[start])) start++;
  let end = line.length;
  while (end > start && isBlank(line[end - 1])) end--;
  let close = end;
  while (close > start && line[close - 1] === '#') close--;
  if (close < end && (close === start || isBlank(line[close - 1]))) {
    end = close;
    while (end > start && isBlank(line[end - 1])) end--;
  }
  return { prefix, text: line.slice(start, end) };
}
const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const SETEXT = /^ {0,3}(?:=+|-+)[ \t]*$/;

/**
 * The label of a footnote definition at a line's start, after any indentation, quote marks, and
 * list marks (`- `, `1. `), read by hand; undefined when the line has none.
 */
function definitionLabel(line: string): string | undefined {
  let i = 0;
  for (;;) {
    while (isBlank(line[i]) || line[i] === '>') i++;
    const c = line[i];
    if ((c === '-' || c === '*' || c === '+') && isBlank(line[i + 1])) {
      i++;
      continue;
    }
    let j = i;
    while (j - i < 9 && (line[j] ?? '') >= '0' && (line[j] ?? '') <= '9') j++;
    if (j > i && (line[j] === '.' || line[j] === ')') && isBlank(line[j + 1])) {
      i = j + 1;
      continue;
    }
    break;
  }
  if (line[i] !== '[' || line[i + 1] !== '^') return undefined;
  let j = i + 2;
  while (j < line.length && !/[\s[\]]/.test(line[j] as string)) j++;
  return j > i + 2 && line[j] === ']' && line[j + 1] === ':' ? line.slice(i + 2, j) : undefined;
}

/**
 * The labels (lowercased, as the parser compares them) of the footnotes `source` defines: lines
 * that start with `[^label]:` (in a quote or a list too), outside code fences. A line scan, made only for a heading with a mark.
 */
function definedLabels(source: string): Set<string> {
  const labels = new Set<string>();
  let fence: string | undefined;
  for (let start = 0; start <= source.length; ) {
    let end = source.indexOf('\n', start);
    if (end < 0) end = source.length;
    const line = source.slice(start, end);
    start = end + 1;
    const opens = FENCE.exec(line);
    if (fence !== undefined) {
      if (opens?.[1]?.startsWith(fence.charAt(0)) && opens[1].length >= fence.length)
        fence = undefined;
      continue;
    }
    if (opens) {
      fence = opens[1];
      continue;
    }
    const label = definitionLabel(line);
    if (label) labels.add(label.toLowerCase());
  }
  return labels;
}

/**
 * `text` without its footnotes' marks: each `[^label]` whose label the document defines (the
 * parser leaves any other as text), outside code spans. A code span is a run of backticks and the
 * next run of the same length; each run's next of its length is found from the end first, so the
 * scan is one pass, and a label stops at a space or a bracket, so no label is read twice.
 */
function withoutNoteMarks(text: string, defined: () => Set<string>): string {
  if (!text.includes('[^')) return text;
  const runs: { from: number; to: number }[] = [];
  for (let i = 0; i < text.length; ) {
    if (text[i] !== '`') {
      i++;
      continue;
    }
    let j = i;
    while (text[j] === '`') j++;
    runs.push({ from: i, to: j });
    i = j;
  }
  const nextSame: (number | undefined)[] = new Array(runs.length);
  const seen = new Map<number, number>();
  for (let k = runs.length - 1; k >= 0; k--) {
    const run = runs[k] as { from: number; to: number };
    nextSame[k] = seen.get(run.to - run.from);
    seen.set(run.to - run.from, k);
  }
  /** Where each code span starts, and where it ends. */
  const spans = new Map<number, number>();
  for (let k = 0; k < runs.length; ) {
    const close = nextSame[k];
    if (close === undefined) {
      k++;
      continue;
    }
    spans.set((runs[k] as { from: number }).from, (runs[close] as { to: number }).to);
    k = close + 1;
  }
  let out = '';
  for (let i = 0; i < text.length; ) {
    const spanEnd = spans.get(i);
    if (spanEnd !== undefined) {
      out += text.slice(i, spanEnd);
      i = spanEnd;
      continue;
    }
    if (text[i] === '[' && text[i + 1] === '^') {
      let j = i + 2;
      while (j < text.length && !/[\s[\]`]/.test(text[j] as string)) j++;
      if (j > i + 2 && text[j] === ']' && defined().has(text.slice(i + 2, j).toLowerCase())) {
        i = j + 1;
        continue;
      }
    }
    out += text[i];
    i++;
  }
  return out;
}

/**
 * `text` with each link and image, `[words](address)` or `![words](address)`, as its words: a `[`,
 * anything up to the next `]`, then `(` and anything up to the next `)`. The next `]` and the next
 * `)` are found by two pointers that only move forward (each `[` asks from further on than the one
 * before), so the whole is one pass.
 */
function linkWords(text: string): string {
  if (!text.includes('](')) return text;
  const n = text.length;
  let close = 0;
  let paren = 0;
  const parts: string[] = [];
  /** The text from here to the next link is kept as it is. */
  let kept = 0;
  for (let i = 0; i < n; i++) {
    const open = text[i] === '!' && text[i + 1] === '[' ? i + 1 : text[i] === '[' ? i : -1;
    if (open < 0) continue;
    close = Math.max(close, open + 1);
    while (close < n && text[close] !== ']') close++;
    if (close >= n || text[close + 1] !== '(') continue;
    paren = Math.max(paren, close + 2);
    while (paren < n && text[paren] !== ')') paren++;
    if (paren >= n) continue;
    parts.push(text.slice(kept, i), text.slice(open + 1, close));
    kept = paren + 1;
    i = paren;
  }
  parts.push(text.slice(kept));
  return parts.join('');
}

/**
 * `text` without `*`, `_`, and backticks, each run of spaces (what `\s` matches) as one space, and
 * none at either end: one pass, joining slices (a regular expression's replace with as many matches
 * as characters slowed by far more than the length on a long line).
 */
function squeeze(text: string): string {
  const parts: string[] = [];
  let from = -1;
  let space = false;
  for (let i = 0; i <= text.length; i++) {
    const c = text[i];
    const mark = c === '*' || c === '_' || c === '`';
    const blank = c !== undefined && !mark && isSpace(text.charCodeAt(i));
    if (c !== undefined && !mark && !blank) {
      if (from < 0) {
        if (space && parts.length > 0) parts.push(' ');
        space = false;
        from = i;
      }
      continue;
    }
    if (from >= 0) {
      parts.push(text.slice(from, i));
      from = -1;
    }
    if (blank) space = true;
  }
  return parts.join('');
}

/** Emphasis, code, link, and footnote markup taken out of a heading's text, leaving what is read. */
function plain(text: string, defined: () => Set<string>): string {
  return squeeze(linkWords(withoutNoteMarks(text, defined)));
}

/**
 * A Markdown document's title: its first heading, ATX (`# Title`) or Setext (a line over `===`),
 * outside code fences, without emphasis or link markup; undefined when it has none. A line scan,
 * not a parse: the recovery copy asks on every write.
 */
export function markdownTitle(source: string): string | undefined {
  let labels: Set<string> | undefined;
  const defined = () => {
    labels ??= definedLabels(source);
    return labels;
  };
  let fence: string | undefined;
  let before = '';
  // Line by line without splitting the text: the window's title asks after every key, and the
  // first heading is usually near the top.
  for (let start = 0; start <= source.length; ) {
    let end = source.indexOf('\n', start);
    if (end < 0) end = source.length;
    const line = source.slice(start, end);
    start = end + 1;
    const opens = FENCE.exec(line);
    if (fence !== undefined) {
      if (opens?.[1]?.startsWith(fence.charAt(0)) && opens[1].length >= fence.length)
        fence = undefined;
      before = '';
      continue;
    }
    if (opens) {
      fence = opens[1];
      before = '';
      continue;
    }
    const heading = atx(line);
    if (heading) {
      const text = plain(heading.text, defined);
      if (text) return text;
      before = '';
      continue;
    }
    // A paragraph line directly over `===` or `---` is a Setext heading.
    if (before && SETEXT.test(line)) return plain(before, defined) || undefined;
    before = line.trim() === '' || /^ {4}/.test(line) ? '' : line;
  }
  return undefined;
}

/**
 * `source` with its title set to `title`: the first ATX heading's text is replaced (its level
 * kept), else a `# title` heading and a blank line are put in front. A document is called by its
 * first heading, so this is what names a copy.
 */
export function retitleMarkdown(source: string, title: string): string {
  const heading = title.replace(/\s+/g, ' ').trim();
  let fence: string | undefined;
  let offset = 0;
  for (const line of source.split('\n')) {
    const opens = FENCE.exec(line);
    if (fence !== undefined) {
      if (opens?.[1]?.startsWith(fence.charAt(0)) && opens[1].length >= fence.length)
        fence = undefined;
    } else if (opens) {
      fence = opens[1];
    } else {
      const found = atx(line);
      if (found?.text) {
        return `${source.slice(0, offset)}${found.prefix} ${heading}${source.slice(offset + line.length)}`;
      }
    }
    offset += line.length + 1;
  }
  return `# ${heading}\n\n${source}`;
}
