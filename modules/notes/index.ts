import type { TextChange } from '@drafter/fountain';
import type { ModuleContext, ModuleProblem, ScriptModule } from '~/modules/types';

// A sample module: lists the notes (`[[like this]]`) in the Problems pane, with their line numbers,
// and removes them all as one undoable change. It has no tab: the Problems pane is where it
// reports. It reads the script and changes it through `ModuleContext` and nothing else, so it works
// as an example of a module that edits.
//
// In a Markdown document there are no notes: `[[…]]` there is usually a link to another page, so
// the module leaves it alone.

interface Span {
  from: number;
  to: number;
}

/** The notes of the script, in order. (A boneyard is not a note.) */
function noteSpans(ctx: ModuleContext): Span[] {
  return ctx
    .doc()
    .regions.filter((region) => region.kind === 'note')
    .map((region) => region.span);
}

/** What a note says, on one line and not too long to read in the Problems pane. */
function summary(source: string, note: Span): string {
  const text = source
    .slice(note.from + 2, note.to - 2)
    .replace(/\s+/g, ' ')
    .trim();
  if (text === '') return '(empty note)';
  return text.length > 120 ? `${text.slice(0, 119).trimEnd()}…` : text;
}

const isSpace = (char: string | undefined) => char === ' ' || char === '\t';

/**
 * The changes that remove `notes` from `source` and leave it tidy: a note that fills its lines
 * takes the lines with it (and one blank line, when that would leave two in a row); a note
 * beside other text takes the space that was beside it.
 */
export function removalChanges(source: string, notes: readonly Span[]): TextChange[] {
  const ranges: Span[] = [];
  const lineStart = (at: number) => source.lastIndexOf('\n', at - 1) + 1;
  const lineEnd = (at: number) => {
    const found = source.indexOf('\n', at);
    return found < 0 ? source.length : found;
  };

  // Notes with nothing but spaces between them (two on one line, or on neighbouring lines, with
  // no blank line between) go together.
  const groups: Span[][] = [];
  for (const note of notes) {
    const group = groups.at(-1);
    const last = group?.at(-1);
    const between = last ? source.slice(last.to, note.from) : '';
    if (group && between.trim() === '' && !/\n[ \t]*\n/.test(between)) group.push(note);
    else groups.push([note]);
  }

  for (const group of groups) {
    const first = group[0] as Span;
    const last = group.at(-1) as Span;
    const start = lineStart(first.from);
    const end = lineEnd(last.to);
    const whole =
      source.slice(start, first.from).trim() === '' && source.slice(last.to, end).trim() === '';
    if (whole) {
      // The lines, with their line break. Then: where a blank line comes before (or the script
      // begins) and another follows, one of them goes too, so no gap is left.
      const to = end < source.length ? end + 1 : end;
      const blankBefore = start === 0 || source[start - 2] === '\n';
      const blankAfter = to < source.length && source[to] === '\n';
      ranges.push({ from: start, to: blankBefore && blankAfter ? to + 1 : to });
      continue;
    }
    // Beside other text: the notes go, with the space that was beside them.
    const before = source.slice(start, first.from);
    const after = source.slice(last.to, end);
    let { from, to } = { from: first.from, to: last.to };
    if (before.trim() === '') {
      // At the start of a line: the spaces after it go.
      while (isSpace(source[to])) to++;
    } else if (after.trim() === '') {
      // At the end of a line: the spaces before it go.
      while (isSpace(source[from - 1])) from--;
    } else if (isSpace(source[from - 1]) && isSpace(source[to])) {
      // Between words, each with a space beside it: one of the two spaces goes.
      to++;
    }
    ranges.push({ from, to });
  }

  // Ranges can touch (a group's blank line, and the next group's note); join them.
  const joined: Span[] = [];
  for (const range of ranges.sort((a, b) => a.from - b.from)) {
    const previous = joined.at(-1);
    if (previous && range.from <= previous.to) previous.to = Math.max(previous.to, range.to);
    else joined.push({ ...range });
  }
  return joined.map(({ from, to }) => ({ from, to, insert: '' }));
}

const notes_ = (n: number) => `${n} ${n === 1 ? 'note' : 'notes'}`;

const notes: ScriptModule = {
  id: 'notes',
  name: 'Notes',
  description: 'Lists the notes in your script in the Problems pane, and removes them all at once.',
  icon: 'i-lucide-sticky-note',
  permissions: {},
  action: {
    label: 'Notes',
    run(ctx) {
      if (ctx.kind() === 'markdown') {
        ctx.setProblems([]);
        ctx.notify('Not available for Markdown documents.');
        return;
      }
      const source = ctx.source();
      const found = noteSpans(ctx);
      const items: ModuleProblem[] = found.map((note) => ({
        message: summary(source, note),
        from: note.from,
        to: note.to,
        severity: 'info',
      }));
      ctx.setProblems(items);
      ctx.notify(
        found.length === 0
          ? 'There are no notes in this script.'
          : `${notes_(found.length)} ${found.length === 1 ? 'is' : 'are'} listed in Problems.`,
      );
    },
  },
  commands: (ctx) => [
    {
      id: 'remove-all',
      title: 'Notes: remove all notes',
      group: 'Edit',
      enabled: () => ctx.kind() === 'fountain',
      run() {
        if (ctx.kind() === 'markdown') {
          ctx.notify('Not available for Markdown documents.');
          return;
        }
        const found = noteSpans(ctx);
        if (found.length === 0) {
          ctx.notify('There are no notes to remove.');
          return;
        }
        const sure =
          typeof confirm === 'function' &&
          confirm(`Remove ${notes_(found.length)} from this script? You can undo it with Undo.`);
        if (!sure) return;
        // One call, so one step of undo.
        if (!ctx.applyChanges(removalChanges(ctx.source(), found))) {
          ctx.notify(
            'The notes weren’t removed: the script changed, or can’t be edited right now.',
          );
          return;
        }
        ctx.setProblems([]);
        ctx.notify(
          `Removed ${notes_(found.length)}. Undo brings ${found.length === 1 ? 'it' : 'them'} back.`,
        );
      },
    },
  ],
};

export default notes;
