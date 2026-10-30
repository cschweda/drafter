import type { Layout } from '@drafter/layout';
import type { Template } from '@drafter/templates';

/** "Under a minute", "About 1 min", "About 1 h 5 min": a running time in whole minutes. */
export function runningTime(minutes: number): string {
  if (minutes < 1) return 'Under a minute';
  if (minutes < 60) return `About ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `About ${hours} h` : `About ${hours} h ${rest} min`;
}

type Line = Layout['pages'][number]['lines'][number];
const printed = (line: Line) => !!line.right || line.runs.some((run) => run.text.length > 0);

/** The pages the script fills, to a tenth: the last page by how far down it prints; no title page. */
function filledPages(layout: Layout): number {
  const body = layout.pages.filter((page) => page.number > 0);
  const last = body.at(-1);
  if (!last) return 0;
  let filled = last.lines.length;
  while (filled > 0 && !printed(last.lines[filled - 1] as Line)) filled--;
  const pages = body.length - 1 + (last.lines.length > 0 ? filled / last.lines.length : 0);
  return Math.round(pages * 10) / 10;
}

/**
 * The small line over a script's title (design §3.3): the template's kind, the printed pages
 * (the title page left out), and the running time, the pages to a tenth at `minutesPerPage`, in
 * whole minutes: "Stage play · 94 pages · About 1 h 52 min". Only the two built-in templates have
 * a kind's name; any other shows as a screenplay, as the app does.
 */
export function kindLine(layout: Layout, template: Template, minutesPerPage: number): string {
  const kind = template.id === 'stage-play-standard' ? 'Stage play' : 'Screenplay';
  const count = layout.pages.filter((page) => page.number > 0).length;
  const pages = `${count.toLocaleString('en-US')} ${count === 1 ? 'page' : 'pages'}`;
  return `${kind} · ${pages} · ${runningTime(Math.round(filledPages(layout) * minutesPerPage))}`;
}
