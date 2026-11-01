// Threads (design §2.9, §3.4): an arc over the page axis from where something is set up to where
// it pays off, numbered; an unpaid one is a dashed coral arc that ends in the air. The arcs are the
// one SVG with a viewBox (stretched, with strokes that don't scale); their numbers sit on a second,
// percentage-placed SVG on top, so they stay round. A numbered list and a table carry the same.

import { el, escapeHtml } from '@drafter/render-html-file';
import { STORY_MAP_LIMITS } from '../model';
import type { MapThread } from '../types';
import { axisOf, pct } from './axis';
import { rulerHtml } from './shape';
import type { Section } from './shell';
import { chartTable } from './table';

/** The arcs' height in px (and viewBox units), and the line they stand on. */
const HEIGHT = 150;
const BASE = 146;
/** The heights a number can sit at, 24 px apart, so two at one x never touch. */
const LEVELS = [14, 38, 62, 86, 110];
/** How far apart two numbers must be across, in percent: 22 px on a 300 px chart. */
const APART = 7.4;
/** How far an unpaid arc runs before it stops in the air, in percent. */
const REACH = 9;

interface Placed {
  thread: MapThread;
  i: number;
  from: number;
  to: number | null;
  /** Where its number sits: x in percent, y in px. */
  x: number;
  y: number;
}

/** Each drawn thread's ends and its number's place, the longest arcs highest. */
function layout(threads: readonly MapThread[], centre: (scene: number) => number): Placed[] {
  const drawn = threads.slice(0, STORY_MAP_LIMITS.arcs).map((thread, i) => {
    const from = centre(thread.from);
    if (thread.to === null) {
      const end = from + REACH <= 99 ? from + REACH : Math.max(1, from - REACH);
      return { thread, i, from, to: null, x: end, span: REACH };
    }
    let to = centre(thread.to);
    if (Math.abs(to - from) < 2) to = Math.min(100, from + 2);
    return { thread, i, from, to, x: (from + to) / 2, span: Math.abs(to - from) };
  });
  const longest = Math.max(1, ...drawn.map((d) => d.span));
  const placed: Placed[] = [];
  const free = (x: number, y: number) =>
    placed.every((p) => Math.abs(p.x - x) >= APART || Math.abs(p.y - y) >= 22);
  for (const d of [...drawn].sort((a, b) => b.span - a.span || a.i - b.i)) {
    const natural = Math.round((1 - d.span / longest) * (LEVELS.length - 1));
    const order = LEVELS.map((_, k) => k).sort(
      (a, b) => Math.abs(a - natural) - Math.abs(b - natural) || a - b,
    );
    let spot: { x: number; y: number } | null = null;
    // At the arc's top, at any height; else nudged along, a step at a time, till one is free.
    for (let nudge = 0; spot === null && nudge <= 100; nudge += APART) {
      for (const sign of nudge === 0 ? [1] : [1, -1]) {
        const x = d.x + sign * nudge;
        if (x < 1 || x > 99) continue;
        const k = order.find((level) => free(x, LEVELS[level] as number));
        if (k !== undefined) {
          spot = { x, y: LEVELS[k] as number };
          break;
        }
      }
    }
    placed.push({
      thread: d.thread,
      i: d.i,
      from: d.from,
      to: d.to,
      ...(spot ?? { x: d.x, y: 14 }),
    });
  }
  return placed.sort((a, b) => a.i - b.i);
}

const round = (n: number) => Math.round(n * 10) / 10;

/** "scene 6 → 47", "scene 32 → not yet paid off". */
const spanWords = (t: MapThread) =>
  `scene ${t.from} → ${t.to === null ? 'not yet paid off' : t.to}`;

const RULES = `.arcwrap{position:relative;margin-top:4px}
.arcs,.arcn{display:block;overflow:visible}
.arcn{position:absolute;inset:0}
.arc{fill:none;stroke:var(--sand);stroke-width:2}
.arc.open{stroke:var(--coral);stroke-dasharray:5 4}
.arcs .base{fill:var(--line)}
.nb{fill:var(--panel2);stroke:var(--sand);stroke-width:1.5}.nb.open{stroke:var(--coral)}
.nt{font-family:var(--mono);font-size:11px;font-weight:700;fill:var(--fg)}
.end{fill:var(--sand)}
.threads{list-style:none;margin:16px 0 0;padding:0;display:grid;gap:10px}
.threads li{display:grid;grid-template-columns:26px minmax(0,1fr);gap:0 10px;align-items:baseline}
.threads b{font-weight:600}
.threads li>span:last-child{grid-column:2;font-family:var(--mono);font-size:12.5px;color:var(--mute)}
.nbl{width:22px;height:22px;border-radius:50%;border:1.5px solid var(--sand);display:grid;place-items:center;font-family:var(--mono);font-size:11px;font-weight:700;grid-row:span 2;align-self:start}
.threads .open .nbl{border-color:var(--coral);border-style:dashed}
@media (min-width:700px){.threads{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 28px}}
@media (min-width:1100px){.threads{grid-template-columns:repeat(3,minmax(0,1fr))}}`;

export const threadsSection: Section = (map) => {
  if (map.threads.length === 0) return { nav: null, html: '', rules: '' };
  const axis = axisOf(map);
  const centre = (n: number) => {
    const span = axis.scenes[n - 1];
    return span ? span.x + span.w / 2 : 0;
  };
  const placed = layout(map.threads, centre);

  let arcs = '';
  let marks = '';
  for (const p of placed) {
    const n = p.i + 1;
    const x1 = round(p.from * 10);
    const title = el('title', {}, `${n}. ${escapeHtml(p.thread.label)}: ${spanWords(p.thread)}`);
    if (p.to === null) {
      const xe = round(p.x * 10);
      arcs += el(
        'path',
        {
          class: 'arc open',
          d: `M${x1} ${BASE} C${x1} ${p.y} ${round((x1 + xe) / 2)} ${p.y} ${xe} ${p.y}`,
          'vector-effect': 'non-scaling-stroke',
        },
        title,
      );
      marks += el('circle', { class: 'end', cx: pct(p.from), cy: BASE, r: 4 });
    } else {
      const x2 = round(p.to * 10);
      // A cubic with both handles at height c tops out at BASE + 0.75 (c − BASE): through the number.
      const c = round(BASE - (BASE - p.y) / 0.75);
      arcs += el(
        'path',
        {
          class: 'arc',
          d: `M${x1} ${BASE} C${x1} ${c} ${x2} ${c} ${x2} ${BASE}`,
          'vector-effect': 'non-scaling-stroke',
        },
        title,
      );
      marks +=
        el('circle', { class: 'end', cx: pct(p.from), cy: BASE, r: 4 }) +
        el('circle', { class: 'end', cx: pct(p.to), cy: BASE, r: 4 });
    }
    const open = p.to === null ? ' open' : '';
    marks +=
      el('circle', { class: `nb${open}`, cx: pct(p.x), cy: p.y, r: 10 }) +
      el('text', { class: 'nt', x: pct(p.x), y: p.y + 4, 'text-anchor': 'middle' }, String(n));
  }
  const unpaid = map.threads.filter((t) => t.to === null).length;
  const shown = Math.min(map.threads.length, STORY_MAP_LIMITS.arcs);
  const svgTitle = `Threads across the script: ${shown} arcs, each from the scene that sets something up to the scene where it pays off${
    unpaid > 0 ? `; dashed arcs are not paid off yet` : ''
  }.`;
  const svg =
    el(
      'svg',
      {
        class: 'arcs',
        viewBox: `0 0 1000 ${HEIGHT}`,
        preserveAspectRatio: 'none',
        width: '100%',
        height: HEIGHT,
        role: 'img',
      },
      el('title', {}, escapeHtml(svgTitle)) +
        arcs +
        el('rect', { class: 'base', x: 0, y: BASE, width: 1000, height: 1 }),
    ) + el('svg', { class: 'arcn', width: '100%', height: HEIGHT, 'aria-hidden': 'true' }, marks);

  const list = el(
    'ol',
    { class: 'threads' },
    map.threads
      .map((t, i) =>
        el(
          'li',
          t.to === null ? { class: 'open' } : {},
          el('span', { class: 'nbl', 'aria-hidden': 'true' }, String(i + 1)) +
            el('b', {}, escapeHtml(t.label)) +
            el('span', {}, spanWords(t)),
        ),
      )
      .join(''),
  );
  const table = chartTable(
    'Threads: where each is set up and where it pays off',
    ['Thread', 'Set up in scene', 'Pays off in scene'],
    map.threads.map((t) => [t.label, t.from, t.to === null ? 'Not yet' : t.to]),
  );
  const more =
    map.threads.length > shown
      ? el('p', { class: 'cap after' }, `The first ${shown} are drawn; the list has them all.`)
      : '';
  const html = el(
    'section',
    { id: 'threads', 'aria-labelledby': 'threads-h' },
    el('h2', { class: 'sec-h', id: 'threads-h' }, 'Threads') +
      el(
        'p',
        { class: 'cap' },
        'Something the story sets up in one scene and pays off in a later one.',
      ) +
      el(
        'div',
        { class: 'panel chart' },
        el('div', { class: 'arcwrap' }, svg) + rulerHtml(axis) + more + list + table,
      ),
  );
  return { nav: { id: 'threads', label: 'Threads' }, html, rules: RULES };
};
