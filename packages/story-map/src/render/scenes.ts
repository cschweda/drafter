// Every scene, in order (story-map design §2.7, §5.1, §5.2, §6, §10.4). With two acts or more set
// by the writer and enough written, each act is a card with its scenes under it; otherwise the
// scenes are one run, "The story" (an early draft with acts keeps small act labels in it). Each
// scene is a row; the gaps sit in their place, dashed; a line of dialogue follows its scene; a
// play's rows show who's on stage; a play's interval divides the list.

import { el, escapeHtml } from '@drafter/render-html-file';
import { STORY_MAP_LIMITS } from '../limits';
import type { MapAct, MapScene, StoryMap } from '../types';
import { minutesWords } from '../words';
import { hasActs, pct, showsBand } from './axis';
import { chip, toneClass } from './people';
import { toneOf } from './shape';
import type { NavLink, Section } from './shell';

const NUMBER_WORDS = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
  'twenty',
];

/** "Act one", …, "Act twenty", then "Act 21". */
export const actWords = (n: number) => `Act ${NUMBER_WORDS[n] ?? String(n)}`;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function pagesWords(pages: number): string {
  if (!(pages > 0)) return '0 pages';
  if (pages < 0.5) return 'under 1 page';
  return plural(Math.round(pages), 'page');
}

/** The icon beside a time (decoration: the word is beside it). */
const TIME_ICON = { day: 'day', night: 'night', twilight: 'dusk' } as const;

/** A written scene's meta line: time, inside or out, length, and a to-do mark. */
function metaHtml(map: StoryMap, scene: MapScene): string {
  const parts: string[] = [];
  if (scene.time) {
    const icon =
      map.lanes === 'two' && scene.timeKind
        ? el('span', { class: `ti ${TIME_ICON[scene.timeKind]}`, 'aria-hidden': 'true' })
        : '';
    parts.push(icon + el('span', {}, escapeHtml(scene.time)));
  }
  if (scene.inside)
    parts.push(el('span', { class: parts.length ? 'sep' : undefined }, scene.inside));
  parts.push(
    el(
      'span',
      { class: parts.length ? 'sep' : undefined },
      scene.minutes >= 0.5 ? minutesWords(scene.minutes) : 'under 1 min',
    ),
  );
  if (scene.todo && map.status !== 'finished') {
    parts.push(el('span', { class: 'todo sep' }, 'to do'));
  }
  return el('p', { class: 'meta' }, parts.join(''));
}

/** A play's who's on stage (Call 28): a labelled list of chips and bars, and the moves beneath. */
function stageHtml(map: StoryMap, scene: MapScene): string {
  const lines = scene.stage ?? [];
  if (lines.length === 0) return '';
  const names = lines.map((l) => map.characters[l.character]?.name ?? '');
  const label = `On stage: ${names.join(', ')}.${scene.moves ? ` ${scene.moves}.` : ''}`;
  const items = lines
    .map((line) => {
      const c = map.characters[line.character] ?? null;
      const from = Math.max(0, Math.min(1, line.from)) * 100;
      const to = Math.max(0, Math.min(1, line.to)) * 100;
      return el(
        'li',
        { class: toneClass(c) },
        chip(c, line.character, { decor: true }) +
          el(
            'svg',
            { width: '100%', height: 6, 'aria-hidden': 'true' },
            el('rect', { class: 'tr', y: 2.5, width: '100%', height: 1 }) +
              el('rect', {
                class: 'on',
                x: pct(from),
                width: pct(Math.max(1, to - from)),
                height: 6,
                rx: 3,
              }),
          ),
      );
    })
    .join('');
  const moves = scene.moves
    ? el('p', { class: 'moves', 'aria-hidden': 'true' }, escapeHtml(scene.moves))
    : '';
  return el(
    'div',
    { class: 'onstage' },
    el('ul', { class: 'stage', 'aria-label': label }, items) + moves,
  );
}

/** One scene's row, and its line of dialogue after it. */
function rowHtml(map: StoryMap, s: number): string {
  const scene = map.scenes[s] as MapScene;
  const name = scene.place ?? scene.title ?? '';
  const h4 = el(
    'h4',
    {},
    el('span', { class: 'sr' }, `Scene ${scene.n}${name ? ': ' : ''}`) + escapeHtml(name),
  );
  const what = scene.what ? el('p', { class: 'what' }, escapeHtml(scene.what)) : '';
  if (scene.planned) {
    return el(
      'li',
      { class: 'sc stub', id: `s${scene.n}` },
      el('span', { class: 'num', 'aria-hidden': 'true' }, String(scene.n)) +
        el(
          'div',
          { class: 'body' },
          h4 +
            el('p', { class: 'meta' }, el('span', { class: 'todo' }, 'Planned, not written yet')) +
            what,
        ),
    );
  }
  const who =
    scene.stage !== null
      ? stageHtml(map, scene)
      : scene.chips.length > 0
        ? el(
            'ul',
            { class: 'chips', 'aria-label': 'Characters' },
            scene.chips.map((c) => chip(map.characters[c] ?? null, c, { tag: 'li' })).join(''),
          )
        : '';
  const row = el(
    'li',
    { class: scene.stage !== null ? 'sc play' : 'sc', id: `s${scene.n}` },
    el('span', { class: 'num', 'aria-hidden': 'true' }, String(scene.n)) +
      el('div', { class: 'body' }, h4 + metaHtml(map, scene) + what + who),
  );
  const quote = scene.quote === null ? undefined : map.quotes[scene.quote];
  if (!quote?.inScene) return row;
  const speaker = map.characters[quote.character] ?? null;
  return (
    row +
    el(
      'li',
      { class: 'qrow' },
      el(
        'figure',
        { class: `pq ${toneClass(speaker)}` },
        el('blockquote', {}, el('p', {}, escapeHtml(quote.text))) +
          el(
            'figcaption',
            {},
            el('span', { class: 'dot', 'aria-hidden': 'true' }) + escapeHtml(speaker?.name ?? ''),
          ),
      ),
    )
  );
}

/** The unwritten tail (design §6.1.4): a dashed row after the last scene. */
function tailHtml(map: StoryMap): string {
  const tail = map.gaps.tail;
  if (!tail || map.status === 'finished') return '';
  const pages = Math.max(1, Math.round(tail.to - tail.from));
  return el(
    'li',
    { class: 'sc gaprow' },
    el('span', { class: 'num', 'aria-hidden': 'true' }, '?') +
      el(
        'div',
        { class: 'body' },
        el('h4', {}, 'The ending') +
          el('p', { class: 'meta' }, el('span', { class: 'todo' }, 'Still to write')) +
          el('p', { class: 'what' }, `About ${plural(pages, 'page')} to go.`),
      ),
  );
}

/** The interval's divider. */
const INTERVAL = el(
  'div',
  { class: 'intermission', role: 'separator', 'aria-label': 'Interval' },
  el('span', { 'aria-hidden': 'true' }, 'Interval'),
);

/**
 * A list of scenes, cut where a one-act play's interval falls; the tail after the map's last
 * scene. `fold`: inside a closed (or open) disclosure, past 80 scenes.
 */
function listHtml(
  map: StoryMap,
  scenes: readonly number[],
  fold: 'open' | 'closed' | null,
): string {
  const last = map.scenes.length - 1;
  const cut =
    map.interval && map.interval.afterAct === null && map.interval.afterScene > 0
      ? map.interval.afterScene - 1
      : -1;
  const lists: string[] = [];
  let items = '';
  for (const s of scenes) {
    items += rowHtml(map, s);
    if (s === last) items += tailHtml(map);
    if (s === cut && s < last) {
      lists.push(items);
      items = '';
    }
  }
  if (scenes.length === 0 && last < 0) items += tailHtml(map);
  lists.push(items);
  const html = lists
    .filter((l) => l !== '')
    .map((l) => el('ol', { class: 'scenes' }, l))
    .join(INTERVAL);
  if (!fold) return html;
  return el(
    'details',
    { class: 'fold', open: fold === 'open' },
    el(
      'summary',
      {},
      `${plural(scenes.length, 'scene')}${el('span', { class: 'show' }, ' — show')}`,
    ) + html,
  );
}

/** An act's card and its scenes (design §2.7). */
function actHtml(map: StoryMap, act: MapAct, fold: 'open' | 'closed' | null): string {
  const done = map.status === 'finished';
  const empty = act.scenes.length === 0;
  const id = `act${act.n}`;
  const title = act.title.trim();
  const h2 = title
    ? el('h2', { id: `${id}-h` }, el('span', { class: 'sr' }, `Act ${act.n}: `) + escapeHtml(title))
    : el('h2', { id: `${id}-h` }, actWords(act.n));
  const count = empty
    ? done
      ? 'No scenes'
      : 'Not written yet'
    : `${plural(act.scenes.length, 'scene')} · ${pagesWords(act.pages)}`;
  const head = el(
    'header',
    { class: 'acthead' },
    el('span', { class: 'num', 'aria-hidden': 'true' }, String(act.n)) +
      el(
        'div',
        {},
        (title ? el('p', { class: 'lbl' }, actWords(act.n)) : '') +
          h2 +
          (act.mood ? el('p', { class: 'mood' }, escapeHtml(act.mood)) : '') +
          el('p', { class: 'lbl count' }, count),
      ),
  );
  return el(
    'section',
    {
      class: `act a${act.n} ${toneOf(map, act.n)}${empty && !done ? ' empty' : ''}`,
      id,
      'aria-labelledby': `${id}-h`,
    },
    head + (empty ? '' : listHtml(map, act.scenes, fold)),
  );
}

/** The one run (design §5.2): "The story", with small act labels in an early draft with acts. */
function runHtml(map: StoryMap): string {
  let body = '';
  if (hasActs(map)) {
    map.acts.forEach((act, a) => {
      const empty = act.scenes.length === 0;
      if (empty && map.status === 'finished') return;
      body += el(
        'p',
        { class: `actmark${empty ? ' empty' : ''}` },
        `Act ${act.n}${empty ? el('span', {}, ' · Not written yet') : ''}`,
      );
      body += listHtml(map, act.scenes, null);
      if (map.interval?.afterAct === act.n && a < map.acts.length - 1) body += INTERVAL;
    });
  } else {
    body = listHtml(
      map,
      map.scenes.map((_, s) => s),
      null,
    );
  }
  return el(
    'section',
    { id: 'scenes', 'aria-labelledby': 'scenes-h' },
    el('h2', { class: 'sec-h', id: 'scenes-h' }, 'The story') + body,
  );
}

const RULES = `.act{padding-top:64px}
.act.t1{--a:#ff7b6b}.act.t2{--a:#f0705f}.act.t3{--a:#ff9a3d}
.acthead{border-top:6px solid var(--a);padding-top:20px;display:grid;grid-template-columns:auto minmax(0,1fr);gap:4px 18px;align-items:start}
.acthead .num{font-family:var(--display);font-size:128px;line-height:.78;color:var(--a)}
.acthead .lbl{margin:2px 0 8px}
.acthead h2{font-size:clamp(40px,7vw,72px);line-height:.9;overflow-wrap:anywhere}
.acthead .mood{margin:10px 0 0;font-size:16px;line-height:1.4}
.acthead .count{margin:10px 0 0}
.act.empty .acthead{border:2px dashed var(--a);border-top:6px dashed var(--a);padding:20px 16px}
.act.empty .count{color:var(--coral)}
.actmark{margin:28px 0 0;font-family:var(--mono);font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:var(--fg)}
.actmark.empty{color:var(--coral)}
.scenes{list-style:none;margin:16px 0 0;padding:0}
.sc{display:grid;grid-template-columns:52px minmax(0,1fr);gap:0 12px;padding:16px 0;border-top:1px solid var(--line)}
.sc .num{font-family:var(--display);font-size:40px;line-height:.9;color:var(--dim)}
.sc h4{font-size:22px;line-height:1;overflow-wrap:anywhere}
.meta{display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px;margin:8px 0 0;font-family:var(--mono);font-size:12.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--mute)}
.meta .sep::before{content:"";display:inline-block;width:4px;height:4px;border-radius:50%;background:var(--dim);margin-right:10px;vertical-align:middle}
.ti{display:inline-block;width:12px;height:12px;border-radius:50%;margin-right:6px;vertical-align:-1px}
.ti.day{background:var(--sand)}
.ti.night{box-shadow:inset -4px -2px 0 0 var(--aqua)}
.ti.dusk{height:6px;border-radius:12px 12px 0 0;background:var(--ember);vertical-align:2px}
.what{margin:8px 0 0;font-size:16px;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.chips{display:flex;flex-wrap:wrap;gap:5px;margin:10px 0 0;padding:0}
.todo{color:var(--coral);letter-spacing:.1em}
.sc.stub .num,.sc.gaprow .num{color:var(--coral)}
.sc.stub .body,.sc.gaprow .body{border:1.5px dashed var(--line);padding:12px;margin-top:-4px}
.sc.gaprow .body{border-color:rgb(255 123 107 / .55);background:rgb(255 123 107 / .05)}
.sc.stub h4,.sc.stub .what{color:var(--mute)}
.qrow{list-style:none;padding:8px 0 20px}
.pq{margin:0;background:var(--panel);border-left:4px solid var(--c);padding:22px 20px 18px}
.pq blockquote{margin:0}
.pq p{margin:0;font-family:var(--mono);font-size:24px;line-height:1.3;text-wrap:pretty;overflow-wrap:anywhere}
.pq p::before{content:"\\201C"}.pq p::after{content:"\\201D"}
.pq figcaption{display:flex;align-items:center;gap:8px;margin-top:14px;font-family:var(--display);text-transform:uppercase;font-size:18px;letter-spacing:.03em;color:var(--mute)}
.pq .dot{width:12px;height:12px;border-radius:50%;background:var(--c);flex:none}
.pq.lesser{border-left-color:var(--mute)}
.stage{list-style:none;margin:12px 0 0;padding:0;display:grid;gap:5px;max-width:420px}
.stage li{display:grid;grid-template-columns:22px minmax(0,1fr);gap:8px;align-items:center}
.stage .chip{width:22px;height:22px;font-size:11px}
.stage svg{display:block}.stage .tr{fill:var(--line)}.stage .on{fill:var(--c)}
.moves{margin:6px 0 0;font-family:var(--mono);font-size:12px;letter-spacing:.04em;color:var(--mute)}
.intermission{margin:40px 0 24px;display:flex;align-items:center;gap:14px;font-family:var(--mono);font-size:13px;letter-spacing:.2em;text-transform:uppercase;color:var(--mute)}
.intermission::before,.intermission::after{content:"";flex:1;border-top:1.5px dashed var(--dim)}
main>.intermission{margin-top:64px}
.fold{margin-top:16px}
.fold>summary{cursor:pointer;font-family:var(--mono);font-size:13px;letter-spacing:.1em;text-transform:uppercase;color:var(--mute);padding:8px 0;width:max-content;max-width:100%}
.fold>summary:hover{color:var(--fg)}
.fold[open]>summary .show{display:none}
@media (min-width:700px){
.sc{grid-template-columns:96px minmax(0,1fr)}
.sc .num{font-size:56px}
.sc h4{font-size:28px}
.qrow{padding:12px 0 28px 96px}
.pq{padding:30px 34px 26px}
.pq p{font-size:32px;max-width:28ch}
.acthead .num{font-size:220px}
}
@media (min-width:1100px){
.sc .body{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,6fr) minmax(0,3fr);gap:4px 28px;align-items:start}
.sc .body h4{grid-column:1}.sc .body .meta{grid-column:1;grid-row:2}
.sc .body .what{grid-column:2;grid-row:1/span 2;margin:0;font-size:18px}
.sc .body .chips{grid-column:3;grid-row:1/span 2;margin:0;justify-content:flex-end}
.sc.play .body{grid-template-columns:minmax(0,4fr) minmax(0,4fr) minmax(0,5fr)}
.sc .body .onstage{grid-column:3;grid-row:1/span 3}.sc .body .stage{margin:0}
.sc.stub .body,.sc.gaprow .body{grid-template-columns:minmax(0,5fr) minmax(0,9fr)}
.sc.stub .body .what,.sc.gaprow .body .what{grid-column:2}
}
@media print{.fold>summary{display:none}.qrow,.sc{break-inside:avoid}}`;

/** Every scene: the act cards, or one run; left out when there is nothing at all. */
export const scenesSection: Section = (map) => {
  const nothing = map.scenes.length === 0 && map.acts.length === 0 && map.gaps.tail === null;
  if (nothing) return { nav: null, html: '', rules: '' };
  if (!showsBand(map)) {
    return { nav: { id: 'scenes', label: 'Scenes' }, html: runHtml(map), rules: RULES };
  }
  const folds = map.scenes.length > STORY_MAP_LIMITS.foldOver;
  const firstOpen = map.acts.findIndex((a) => a.scenes.length > 0);
  const nav: NavLink[] = [];
  let html = '';
  map.acts.forEach((act, a) => {
    const empty = act.scenes.length === 0;
    if (empty && map.status === 'finished') return;
    nav.push({ id: `act${act.n}`, label: `Act ${act.n}` });
    html += actHtml(map, act, folds ? (a === firstOpen ? 'open' : 'closed') : null);
    if (map.interval?.afterAct === act.n && a < map.acts.length - 1) html += INTERVAL;
  });
  return { nav, html, rules: RULES };
};
