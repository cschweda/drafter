/** An ATX heading: up to three spaces, 1 to 6 `#`, a space or tab (or the end of the line), the text, optional closing `#`s. */
const ATX = /^ {0,3}#{1,6}(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const SETEXT = /^ {0,3}(?:=+|-+)[ \t]*$/;

/** A footnote definition's label at a line's start, after any indentation and quote marks. */
const DEFINITION = /^[ \t>]*\[\^([^\s[\]]+)\]:/;

/**
 * The labels (lowercased, as the parser compares them) of the footnotes `source` defines: lines
 * that start with `[^label]:`, outside code fences. A line scan, made only for a heading with a mark.
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
    const label = DEFINITION.exec(line)?.[1];
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

/** Emphasis, code, link, and footnote markup taken out of a heading's text, leaving what is read. */
function plain(text: string, defined: () => Set<string>): string {
  return withoutNoteMarks(text, defined)
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
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
    const atx = ATX.exec(line);
    if (atx) {
      const text = plain(atx[1] ?? '', defined);
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
      const atx = /^( {0,3}#{1,6})(?:[ \t]+.*)?$/.exec(line);
      if (atx && ATX.exec(line)?.[1]) {
        return `${source.slice(0, offset)}${atx[1]} ${heading}${source.slice(offset + line.length)}`;
      }
    }
    offset += line.length + 1;
  }
  return `# ${heading}\n\n${source}`;
}
