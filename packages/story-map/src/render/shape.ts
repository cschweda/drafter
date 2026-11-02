// The shape of the story (design §2.5, §5.1, §5.2, §6): the act band, every scene on one strip, the
// two donuts, and how long each scene runs, each chart with its table. Acts are drawn only when the
// writer set two or more and enough is written to show them (maintainer, 2026-11-01).

import { bandRules, el, escapeHtml } from '@drafter/render-html-file';
import type { MapScene, StoryMap } from '../types';
import { minutesWords } from '../words';
import {
  type Axis,
  axisOf,
  drawn,
  hasActs,
  type Label,
  MIN_WIDTH,
  pct,
  placeLabels,
  rulerSteps,
  showsBand,
} from './axis';
import type { Section } from './shell';
import { chartTable } from './table';

/** The act colour steps, coral, deep coral, ember, as classes `t1`–`t3`, in turn. */
export function toneOf(map: StoryMap, act: number): string {
  // Two acts take the two ends of the steps, so they stay apart (as the approved play mockup).
  if (map.acts.length === 2) return act <= 1 ? 't1' : 't3';
  return `t${((Math.max(1, act) - 1) % 3) + 1}`;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** An act's pages in words: "28 pages", "under 1 page". */
function pagesWords(pages: number): string {
  if (!(pages > 0)) return '0 pages';
  if (pages < 0.5) return 'under 1 page';
  return plural(Math.round(pages), 'page');
}

/** What a scene is called on a chart: its place, else its title. */
export const whereOf = (scene: MapScene) => scene.place ?? scene.title ?? '';

/** Whether an act still has something unwritten in it: planned scenes, to-dos, or the tail. */
function isOpen(map: StoryMap, a: number): boolean {
  if (map.status === 'finished') return false;
  const act = map.acts[a];
  if (!act || act.scenes.length === 0) return false;
  if (act.scenes.some((s) => map.scenes[s]?.planned || map.scenes[s]?.todo)) return true;
  const last = map.acts.findLastIndex((x) => x.scenes.length > 0);
  return a === last && map.gaps.tail !== null;
}

/** The act band (design §2.5): a block per act, as wide as its pages, and a play's interval. */
function bandHtml(map: StoryMap): { html: string; rules: string } {
  if (!showsBand(map)) return { html: '', rules: '' };
  const { classes, rules } = bandRules(map.acts.map((a) => Math.max(0, a.pages)));
  const wip = map.status !== 'finished';
  const parts = map.acts.map((act, a) => {
    const empty = act.scenes.length === 0;
    const open = isOpen(map, a);
    const cls = [
      'ab',
      `a${act.n}`,
      toneOf(map, act.n),
      classes[a] as string,
      empty && wip ? 'empty' : '',
      open ? 'open' : '',
    ]
      .filter(Boolean)
      .join(' ');
    const pages = empty
      ? wip
        ? 'Not written yet'
        : 'No scenes'
      : `${pagesWords(act.pages)}${open ? ' so far' : ''}`;
    const block = el(
      'a',
      { class: cls, href: `#act${act.n}` },
      el('span', { class: 'n' }, `${el('span', { class: 'sr' }, 'Act ')}${act.n}`) +
        (act.title ? el('span', { class: 't' }, escapeHtml(act.title)) : '') +
        el('span', { class: 'p' }, pages),
    );
    const interval =
      map.interval?.afterAct === act.n && a < map.acts.length - 1
        ? el('span', { class: 'iv' }, 'Interval')
        : '';
    return block + interval;
  });
  return { html: el('div', { class: 'band' }, parts.join('')), rules };
}

/** How the strip colours its blocks: by time of day, by act, or one colour. */
type Colouring = 'time' | 'act' | 'one';

function colouringOf(map: StoryMap): Colouring {
  if (map.lanes === 'two') return 'time';
  if (showsBand(map)) return 'act';
  return map.kind === 'screenplay' ? 'time' : 'one';
}

const TIME_CLASS = { day: 'day', night: 'night', twilight: 'dusk' } as const;

function colourOf(map: StoryMap, scene: MapScene, colouring: Colouring): string {
  if (colouring === 'act') return toneOf(map, scene.act ?? 1);
  if (colouring === 'one') return 'one';
  return scene.timeKind ? TIME_CLASS[scene.timeKind] : 'nt';
}

/** A scene's tooltip: "Scene 3: Harbour Office, Night, Inside, 2 min". */
function sceneTitle(scene: MapScene): string {
  if (scene.planned) return `Scene ${scene.n}: planned, not written yet`;
  const parts = [whereOf(scene), scene.time, scene.inside, minutesWords(scene.minutes)].filter(
    (p): p is string => typeof p === 'string' && p !== '',
  );
  return `Scene ${scene.n}: ${parts.join(', ')}`;
}

const rect = (attrs: Record<string, string | number>, title = '') =>
  el('rect', attrs, title ? el('title', {}, escapeHtml(title)) : '');

/** What the strip and the pace chart leave unwritten, for their titles. */
function gapWords(map: StoryMap, axis: Axis): string[] {
  if (map.status === 'finished') return [];
  const out: string[] = [];
  const planned = map.scenes.filter((s) => s.planned).length;
  if (planned > 0) out.push(plural(planned, 'scene planned', 'scenes planned'));
  const empty = axis.slots.filter((s) => s.kind === 'empty').map((s) => `Act ${s.act}`);
  if (empty.length > 0) out.push(`${empty.join(', ')} not written yet`);
  if (axis.tail) out.push('the ending still to write');
  return out;
}

const listWords = (items: readonly string[]) =>
  items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;

/** The ruler under a chart (decoration: the figures are in the tables): pages and the interval. */
export function rulerHtml(axis: Axis): string {
  const labels: Label[] = [];
  for (const slot of axis.slots) {
    if (slot.kind === 'interval') labels.push({ x: slot.x + slot.w / 2, text: 'Interval' });
  }
  let ticks = '';
  if (!axis.even && axis.pages > 0) {
    const last = Math.max(1, Math.round(axis.pages));
    labels.push({ x: 0, text: 'Page 1' }, { x: axis.at(axis.pages), text: String(last) });
    const { step, tick } = rulerSteps(axis.pages);
    for (let p = step; p < axis.pages - step / 2; p += step) {
      labels.push({ x: axis.at(p), text: String(p) });
    }
    for (let p = tick; p < axis.pages; p += tick) {
      ticks += el('rect', { class: 'tk', x: pct(axis.at(p)), y: 0, width: 1, height: 4 });
    }
  } else {
    labels.push({ x: 0, text: 'Start' }, { x: 100, text: 'End' });
  }
  const texts = placeLabels(labels)
    .map((l) => el('text', { x: pct(l.x), y: 16, 'text-anchor': l.anchor }, escapeHtml(l.text)))
    .join('');
  return el(
    'svg',
    { class: 'ruler', width: '100%', height: 20, 'aria-hidden': 'true' },
    ticks + texts,
  );
}

/** Small act markers over the strip of an early draft with acts: "Act 1", or "1" when crowded. */
function marksHtml(map: StoryMap, axis: Axis): string {
  if (!hasActs(map) || showsBand(map)) return '';
  const at = [
    { act: map.acts[0]?.n ?? 1, x: 0 },
    ...axis.starts.filter((s) => s.act !== map.acts[0]?.n),
  ];
  const long = at.map((s) => ({ x: s.x, text: `Act ${s.act}` }));
  const short = at.map((s) => ({ x: s.x, text: String(s.act) }));
  const kept = placeLabels(long);
  const labels = kept.length === long.length ? kept : placeLabels(short);
  return el(
    'svg',
    { class: 'marks', width: '100%', height: 18, 'aria-hidden': 'true' },
    labels
      .map((l) => el('text', { x: pct(l.x), y: 13, 'text-anchor': l.anchor }, escapeHtml(l.text)))
      .join(''),
  );
}

/** The strip (design §2.5): every scene in order, as wide as it runs. */
function stripHtml(map: StoryMap, axis: Axis): string {
  const two = map.lanes === 'two';
  const colouring = colouringOf(map);
  const height = two ? 86 : 56;
  const wip = map.status !== 'finished';
  let stubs = '';
  let blocks = '';
  const used = new Set<string>();
  map.scenes.forEach((scene, s) => {
    const span = axis.scenes[s];
    if (!span) return;
    let [y, h] = [0, height];
    if (two && scene.inside === 'Outside') [y, h] = [0, 40];
    if (two && scene.inside === 'Inside') [y, h] = [46, 40];
    if (scene.planned) {
      if (!wip) return;
      const box = { x: span.x + 0.1, w: Math.max(MIN_WIDTH, span.w - 0.2) };
      stubs += rect(
        { class: 'b stub', x: pct(box.x), y: y + 1, width: pct(box.w), height: h - 2 },
        sceneTitle(scene),
      );
      used.add('stub');
      return;
    }
    const box = drawn(span);
    const colour = colourOf(map, scene, colouring);
    used.add(colour);
    blocks += rect(
      { class: `b ${colour}`, x: pct(box.x), y, width: pct(box.w), height: h },
      sceneTitle(scene),
    );
  });
  let extra = '';
  for (const slot of axis.slots) {
    if (slot.kind === 'interval') {
      extra += rect({ class: 'iv', x: pct(slot.x), y: 0, width: pct(slot.w), height }, 'Interval');
    } else {
      used.add('gap');
      extra += rect(
        { class: 'gap', x: pct(slot.x + 0.2), y: 1, width: pct(slot.w - 0.4), height: height - 2 },
        `Act ${slot.act}: not written yet`,
      );
    }
  }
  if (axis.tail && wip) {
    used.add('gap');
    extra += rect(
      {
        class: 'gap tail',
        x: pct(axis.tail.x + 0.2),
        y: 1,
        width: pct(Math.max(0.2, axis.tail.w - 0.2)),
        height: height - 2,
      },
      'The ending, still to write',
    );
    if (axis.tail.w >= 36) {
      extra += el(
        'text',
        {
          class: 'gapt',
          x: pct(axis.tail.x + axis.tail.w / 2),
          y: height / 2 + 4,
          'text-anchor': 'middle',
        },
        'Still to write',
      );
    }
  }
  if (hasActs(map)) {
    for (const start of axis.starts) {
      extra += el('rect', {
        class: 'actline',
        x: pct(start.x),
        y: -3,
        width: 2,
        height: height + 6,
      });
    }
  }

  const how =
    colouring === 'time'
      ? two
        ? ', outside scenes on top and inside below, coloured by time of day'
        : ', coloured by time of day'
      : colouring === 'act'
        ? ', coloured by act'
        : '';
  const gaps = gapWords(map, axis);
  const interval = !axis.slots.some((s) => s.kind === 'interval')
    ? ''
    : map.interval?.afterAct
      ? `, with an interval after Act ${map.interval.afterAct}`
      : `, with an interval after scene ${map.interval?.afterScene}`;
  const title = `Every scene in order, as wide as it runs${how}${interval}${
    gaps.length > 0 ? `; ${listWords(gaps)}` : ''
  }.`;
  const svg = el(
    'svg',
    { class: `strip ${two ? 'two' : 'one'}`, width: '100%', height, role: 'img' },
    el('title', {}, escapeHtml(title)) + stubs + blocks + extra,
  );
  const lanes = two
    ? el(
        'div',
        { class: 'll', 'aria-hidden': 'true' },
        el('span', {}, 'Outside') + el('span', {}, 'Inside'),
      )
    : '';
  const chart = el(
    'div',
    { class: two ? 'lanes' : 'lane' },
    lanes + el('div', {}, marksHtml(map, axis) + svg + rulerHtml(axis)),
  );

  // The legend, in plain words, with only what the strip shows.
  const keys: Array<[string, string]> = [];
  if (colouring === 'time') {
    if (used.has('day')) keys.push(['day', 'Day']);
    if (used.has('night')) keys.push(['night', 'Night']);
    if (used.has('dusk')) keys.push(['dusk', 'Dawn or dusk']);
    if (used.has('nt')) keys.push(['nt', 'No time given']);
  } else if (colouring === 'act') {
    for (const act of map.acts) {
      if (act.scenes.length > 0) keys.push([toneOf(map, act.n), `Act ${act.n}`]);
    }
  } else {
    keys.push(['one', 'A scene']);
  }
  if (used.has('stub')) keys.push(['stub', 'Planned']);
  if (used.has('gap')) keys.push(['gap', 'Still to write']);
  const key = el(
    'ul',
    { class: 'key' },
    keys
      .map(([cls, words]) =>
        el('li', {}, el('span', { class: `sw ${cls}`, 'aria-hidden': 'true' }) + words),
      )
      .join(''),
  );
  const pagesSaid = axis.even ? '' : ' The numbers under it are pages.';
  const cap = el(
    'p',
    { class: 'cap after' },
    `Each block is one scene, as wide as it runs${
      two ? ': outside scenes on top, inside below' : ''
    }.${pagesSaid}`,
  );

  // Its table: scenes by act (or all together) and time of day.
  const row = (name: string, list: readonly MapScene[]) => {
    const written = list.filter((s) => !s.planned);
    const by = (kind: MapScene['timeKind']) => written.filter((s) => s.timeKind === kind).length;
    return [
      name,
      by('day'),
      by('night'),
      by('twilight'),
      by(null),
      list.length - written.length,
      list.length,
    ];
  };
  const rows = hasActs(map)
    ? [
        ...map.acts.map((act) =>
          row(
            `Act ${act.n}`,
            act.scenes.flatMap((s) => (map.scenes[s] ? [map.scenes[s] as MapScene] : [])),
          ),
        ),
        row('All acts', map.scenes),
      ]
    : [row('All scenes', map.scenes)];
  const table = chartTable(
    'Scenes by time of day',
    [hasActs(map) ? 'Act' : 'Scenes', 'Day', 'Night', 'Dawn or dusk', 'No time', 'Planned', 'All'],
    rows,
  );
  return el(
    'div',
    { class: 'panel chart strips' },
    el('p', { class: 'lbl' }, 'Every scene, start to finish') + chart + key + cap + table,
  );
}

/** One donut (design §2.5): rings of `circle`s on `pathLength="100"`, from twelve o'clock. */
function donutHtml(
  big: number,
  words: string,
  title: string,
  segments: ReadonlyArray<{ cls: string; share: number }>,
  table: string,
): string {
  const C = { cx: 21, cy: 21, r: 15.915 };
  let at = 0;
  const rings = segments
    .filter((s) => s.share > 0)
    .map((s) => {
      const circle = el('circle', {
        class: `seg ${s.cls}`,
        ...C,
        pathLength: 100,
        'stroke-dasharray': `${s.share} ${100 - s.share}`,
        'stroke-dashoffset': 25 - at,
      });
      at += s.share;
      return circle;
    })
    .join('');
  const svg = el(
    'svg',
    { viewBox: '0 0 42 42', width: 132, height: 132, role: 'img' },
    el('title', {}, escapeHtml(title)) + el('circle', { class: 'ring', ...C }) + rings,
  );
  return el(
    'figure',
    { class: 'donut chart' },
    svg + el('figcaption', {}, el('b', {}, `${big}%`) + el('span', {}, words)) + table,
  );
}

/** Whole percents of a whole, 0 for nothing. */
const share = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);
const mins = (list: readonly MapScene[]) => list.reduce((n, s) => n + s.minutes, 0);

function donutsHtml(map: StoryMap): string {
  if (!map.split) return '';
  const written = map.scenes.filter((s) => !s.planned);
  const known = written.filter((s) => s.inside !== null);
  const kinds = ['Inside', 'Outside', 'Inside and out'] as const;
  const inMins = kinds.map((k) => mins(known.filter((s) => s.inside === k)));
  const indoors = map.split.indoors;
  const outdoors = Math.min(100 - indoors, share(inMins[1] as number, mins(known)));
  const both = Math.max(0, 100 - indoors - outdoors);
  const where = donutHtml(
    indoors,
    'indoors',
    `${indoors}% of the time is spent indoors, ${100 - indoors}% outdoors or both.`,
    [
      { cls: 'inn', share: indoors },
      { cls: 'outn', share: 100 - indoors },
    ],
    chartTable(
      'Time inside and outside',
      ['Where', 'Minutes', 'Share'],
      kinds.map((k, i) => [k, Math.round(inMins[i] as number), `${[indoors, outdoors, both][i]}%`]),
    ),
  );

  const timed = written.filter((s) => s.timeKind !== null);
  const times = ['day', 'night', 'twilight'] as const;
  const timeMins = times.map((t) => mins(timed.filter((s) => s.timeKind === t)));
  const night = map.split.night;
  const dusk = Math.min(100 - night, share(timeMins[2] as number, mins(timed)));
  const day = Math.max(0, 100 - night - dusk);
  const when = donutHtml(
    night,
    'at night',
    `${night}% of the time is at night, ${day}% by day, ${dusk}% at dawn or dusk.`,
    [
      { cls: 'day', share: day },
      { cls: 'night', share: night },
      { cls: 'dusk', share: dusk },
    ],
    chartTable(
      'Time of day',
      ['When', 'Minutes', 'Share'],
      ['Day', 'Night', 'Dawn or dusk'].map((name, i) => [
        name,
        Math.round(timeMins[i] as number),
        `${[day, night, dusk][i]}%`,
      ]),
    ),
  );
  return where + when;
}

/** How long each scene runs (design §2.5): a bar per scene, as tall as it is long, at most 96 px. */
function paceHtml(map: StoryMap, axis: Axis): string {
  const colouring = showsBand(map) ? 'act' : 'one';
  const wip = map.status !== 'finished';
  const most = Math.max(0, ...map.scenes.filter((s) => !s.planned).map((s) => s.minutes));
  const BASE = 100;
  let bars = '';
  map.scenes.forEach((scene, s) => {
    const span = axis.scenes[s];
    if (!span) return;
    if (scene.planned) {
      if (!wip) return;
      bars += rect(
        {
          class: 'b stub',
          x: pct(span.x + 0.1),
          y: BASE - 13,
          width: pct(Math.max(MIN_WIDTH, span.w - 0.2)),
          height: 12,
        },
        `Scene ${scene.n}: planned, not written yet`,
      );
      return;
    }
    const box = drawn(span);
    const h = most > 0 ? Math.max(2, Math.round((scene.minutes / most) * 96 * 10) / 10) : 2;
    bars += rect(
      {
        class: `b ${colouring === 'act' ? toneOf(map, scene.act ?? 1) : 'one'}`,
        x: pct(box.x),
        y: Math.round((BASE - h) * 10) / 10,
        width: pct(box.w),
        height: h,
        rx: 1,
      },
      `Scene ${scene.n}: ${minutesWords(scene.minutes)}`,
    );
  });
  if (wip) {
    for (const slot of axis.slots) {
      if (slot.kind !== 'empty') continue;
      bars += rect({
        class: 'gap',
        x: pct(slot.x + 0.2),
        y: BASE - 21,
        width: pct(slot.w - 0.4),
        height: 20,
      });
    }
    if (axis.tail) {
      bars += rect({
        class: 'gap tail',
        x: pct(axis.tail.x + 0.2),
        y: BASE - 21,
        width: pct(Math.max(0.2, axis.tail.w - 0.2)),
        height: 20,
      });
    }
  }
  const base = el('rect', { class: 'base', x: 0, y: BASE, width: '100%', height: 1 });
  const svg = el(
    'svg',
    { class: 'pace', width: '100%', height: BASE + 4, role: 'img' },
    el(
      'title',
      {},
      'How long each scene runs, in order: the taller the bar, the longer the scene.',
    ) +
      bars +
      base,
  );
  const caption = map.pace ? el('figcaption', {}, escapeHtml(map.pace)) : '';
  const table = chartTable(
    'How long each scene runs',
    ['Scene', 'Where', 'Length'],
    map.scenes
      .filter((s) => wip || !s.planned)
      .map((s) => [
        String(s.n),
        whereOf(s) || '–',
        s.planned ? 'Planned' : minutesWords(s.minutes),
      ]),
  );
  return el(
    'figure',
    { class: 'pacefig chart' },
    el('p', { class: 'lbl' }, 'How long each scene runs') + svg + caption + table,
  );
}

const RULES = `.band{display:flex;gap:3px;overflow-x:auto;scrollbar-width:none}
.ab{flex:1 1 0;min-width:46px;display:flex;flex-direction:column;justify-content:space-between;min-height:132px;padding:10px;text-decoration:none;color:var(--ink);background:var(--a);overflow:hidden}
.ab .n{font-family:var(--display);font-size:64px;line-height:.85}
.ab .t{font-family:var(--display);text-transform:uppercase;font-size:17px;line-height:1;margin-top:8px;overflow-wrap:anywhere}
.ab .p{font-family:var(--mono);font-size:11.5px;letter-spacing:.04em;margin-top:6px}
.t1{--a:#ff7b6b}.t2{--a:#f0705f}.t3{--a:#ff9a3d}
.wip .ab.open{background:repeating-linear-gradient(135deg,var(--a) 0 10px,rgb(12 19 21 / .14) 10px 20px),var(--a)}
.ab.empty{background:rgb(255 123 107 / .05);border:2px dashed var(--coral);color:var(--coral)}
.ab:hover .t{text-decoration:underline}
.iv{flex:0 0 26px;display:flex;align-items:center;justify-content:center;writing-mode:vertical-rl;transform:rotate(180deg);font-family:var(--mono);font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--mute);border:1.5px dashed var(--line)}
.lanes{display:grid;grid-template-columns:52px minmax(0,1fr);gap:8px}
.ll{display:grid;grid-template-rows:18px 40px 6px 40px;font-family:var(--mono);font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--mute)}
.ll span{grid-row:2;align-self:center}.ll span:last-child{grid-row:4}
.strip,.ruler,.marks,.pace{display:block;overflow:visible}
.strip.two,.strip.one{margin-top:18px}
.marks+.strip{margin-top:0}
.strip .day,.pace .day{fill:var(--sand)}.strip .night{fill:var(--aqua)}.strip .dusk{fill:var(--ember)}.strip .nt{fill:#4a6266}
.strip .one,.pace .one{fill:var(--coral)}
.strip .t1,.pace .t1{fill:#ff7b6b}.strip .t2,.pace .t2{fill:#f0705f}.strip .t3,.pace .t3{fill:#ff9a3d}
.strip .stub,.pace .stub{fill:rgb(236 201 134 / .06);stroke:var(--sand);stroke-width:1.5;stroke-dasharray:3 3}
.strip .gap,.pace .gap{fill:rgb(255 123 107 / .07);stroke:var(--coral);stroke-width:1.5;stroke-dasharray:5 4}
.strip .gapt{font-family:var(--mono);font-size:11px;letter-spacing:.08em;text-transform:uppercase;fill:var(--coral)}
.strip .iv{fill:none}
.strip .actline{fill:var(--fg);opacity:.7}
.ruler text,.marks text{font-family:var(--mono);font-size:11px;fill:var(--mute)}
.marks text{fill:var(--fg)}
.ruler .tk{fill:var(--dim)}
.key{list-style:none;padding:0;margin:14px 0 0;display:flex;flex-wrap:wrap;gap:8px 18px;font-size:14px;color:var(--mute)}
.key li{display:inline-flex;align-items:center;gap:8px}
.sw{width:16px;height:12px;display:inline-block;flex:none;border-radius:2px}
.sw.day{background:var(--sand)}.sw.night{background:var(--aqua)}.sw.dusk{background:var(--ember)}.sw.nt{background:#4a6266}.sw.one{background:var(--coral)}
.sw.t1{background:#ff7b6b}.sw.t2{background:#f0705f}.sw.t3{background:#ff9a3d}
.sw.stub{border:1.5px dashed var(--sand)}.sw.gap{border:1.5px dashed var(--coral)}
.cap.after{margin:12px 0 0;font-size:14px}
.splits{display:grid;grid-template-columns:minmax(0,1fr);gap:1px;background:var(--line);border:1px solid var(--line);margin-top:16px}
.splits>*{background:var(--panel);margin:0;padding:18px 12px;min-width:0}
.donut{display:grid;grid-template-columns:112px minmax(0,1fr);align-items:center;gap:8px 20px}
.donut svg{width:min(112px,100%);height:auto}
.donut .tbl{grid-column:1/-1;text-align:left}
.ring{fill:none;stroke:var(--line);stroke-width:7}
.seg{fill:none;stroke-width:7}
.seg.inn{stroke:var(--fg)}.seg.outn{stroke:var(--dim)}.seg.day{stroke:var(--sand)}.seg.night{stroke:var(--aqua)}.seg.dusk{stroke:var(--ember)}
.donut b{display:block;font-family:var(--display);font-weight:400;font-size:40px;line-height:1}
.donut figcaption span{font-family:var(--mono);font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--mute)}
.pacefig{grid-column:1/-1}
.pace .base{fill:var(--line)}
.pacefig figcaption{color:var(--mute);font-size:14px;margin-top:10px}
@media (min-width:700px){
.ab{min-height:190px;padding:16px}
.ab .n{font-size:120px}.ab .t{font-size:26px}.ab .p{font-size:13px}
.lanes{grid-template-columns:64px minmax(0,1fr)}
.splits{grid-template-columns:220px 220px minmax(0,1fr)}
.donut{display:flex;flex-direction:column;align-items:center;text-align:center}
.donut svg{width:min(132px,100%)}
.donut .tbl{align-self:stretch}
.splits.solo{grid-template-columns:minmax(0,1fr)}
.pacefig{grid-column:auto}
}
@media print{.ab{color:#111;border:1px solid #999}.ab.empty{color:var(--coral)}}`;

/** The shape section: the band, the strip, the donuts, and the pace chart. */
export const shapeSection: Section = (map) => {
  const nothing =
    map.scenes.length === 0 &&
    map.gaps.tail === null &&
    map.acts.every((a) => a.scenes.length === 0);
  if (nothing) return { nav: null, html: '', rules: '' };
  const axis = axisOf(map);
  const band = bandHtml(map);
  const html = el(
    'section',
    { id: 'shape', 'aria-labelledby': 'shape-h' },
    el('h2', { class: 'sec-h', id: 'shape-h' }, 'The shape') +
      band.html +
      stripHtml(map, axis) +
      el(
        'div',
        { class: map.split ? 'splits' : 'splits solo' },
        donutsHtml(map) + paceHtml(map, axis),
      ),
  );
  return {
    nav: { id: 'shape', label: 'Shape' },
    html,
    rules: [RULES, band.rules].filter(Boolean).join('\n'),
  };
};
