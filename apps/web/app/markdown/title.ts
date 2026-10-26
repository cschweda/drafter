/** An ATX heading: up to three spaces, 1 to 6 `#`, a space or tab (or the end of the line), the text, optional closing `#`s. */
const ATX = /^ {0,3}#{1,6}(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const SETEXT = /^ {0,3}(?:=+|-+)[ \t]*$/;

/** Emphasis, code, and link markup taken out of a heading's text, leaving what is read. */
function plain(text: string): string {
  return text
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
      const text = plain(atx[1] ?? '');
      if (text) return text;
      before = '';
      continue;
    }
    // A paragraph line directly over `===` or `---` is a Setext heading.
    if (before && SETEXT.test(line)) return plain(before) || undefined;
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
