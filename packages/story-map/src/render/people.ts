// The characters (story-map design §2.6, §4, §5.1): the screen-time ranking, a card for each lead
// with their presence on the page axis, the rest of the cast, and who shares scenes (a half-matrix
// for a screenplay; for a play, the pairs who share the stage most, ranked).

import { el, escapeHtml } from '@drafter/render-html-file';
import { STORY_MAP_LIMITS } from '../limits';
import type { MapCharacter, StoryMap } from '../types';
import { type Axis, axisOf, drawn, MIN_WIDTH, pct } from './axis';
import type { Section } from './shell';
import { chartTable } from './table';

/** A character's colour class: their palette slot, the white ring for a voice, else grey. */
export function toneClass(character: MapCharacter | null): string {
  if (!character) return 'lesser';
  if (character.voice) return 'voice';
  return character.color === null ? 'lesser' : `k${character.color}`;
}

/**
 * A character's chip: a disc with their initial (hidden from screen readers), their name beside it
 * for screen readers and as a tooltip. With `decor`, the chip sits beside the written name, so it
 * is all hidden. `index` names a character the map doesn't hold.
 */
export function chip(
  character: MapCharacter | null,
  index: number,
  { tag = 'span', decor = false, big = false } = {},
): string {
  const name = character?.name ?? `Character ${index + 1}`;
  const initial = el('span', { 'aria-hidden': 'true' }, escapeHtml(character?.initial || '?'));
  const cls = `chip ${toneClass(character)}${big ? ' big' : ''}`;
  if (decor) return el(tag, { class: cls, 'aria-hidden': 'true' }, initial);
  return el(
    tag,
    { class: cls, title: name },
    initial + el('span', { class: 'sr' }, escapeHtml(name)),
  );
}

/** The lead colours (Global Constraints), and the shared chip rules; the scenes use them too. */
export const CHIP_RULES = `.k0{--c:#f28fc0}.k1{--c:#6fb7ff}.k2{--c:#b9a2ff}.k3{--c:#8fd16a}.k4{--c:#ffb38a}.k5{--c:#d4d97a}.k6{--c:#aab8b5}.voice{--c:#ffffff}.lesser{--c:#5d7672}
.chip{width:26px;height:26px;border-radius:50%;background:var(--c);color:var(--ink);display:inline-grid;place-items:center;font-family:var(--display);font-size:13px;line-height:1;flex:none;list-style:none}
.chip.big{width:40px;height:40px;font-size:20px}
.chip.voice{background:transparent;color:var(--fg);box-shadow:inset 0 0 0 2px var(--fg)}
.chip.lesser{background:var(--panel2);color:var(--mute);box-shadow:inset 0 0 0 1.5px var(--dim)}`;

/** Whole minutes as a big number with a small unit: "62 min", "<1 min". */
function bigMinutes(minutes: number): string {
  const whole = Math.round(minutes);
  return `${whole >= 1 ? whole : '&lt;1'}${el('small', {}, ' min')}`;
}

/** The ranking (design §2.6): the top 12 by time, each a bar in their colour, and "and N more". */
function rankHtml(map: StoryMap): string {
  const shown = map.characters.slice(0, STORY_MAP_LIMITS.ranked);
  const most = Math.max(0, ...shown.map((c) => c.minutes));
  // First names, as people say them, unless two of them would read the same.
  const firsts = shown.map((c) => c.first || c.name);
  const clash = new Set(firsts).size < firsts.length;
  const items = shown
    .map((c, k) => {
      const w = most > 0 ? (c.minutes / most) * 100 : 0;
      return el(
        'li',
        { class: toneClass(c) },
        el('span', { class: 'rn' }, escapeHtml(clash ? c.name : (firsts[k] as string))) +
          el(
            'svg',
            { width: '100%', height: 20, 'aria-hidden': 'true' },
            el('rect', { width: pct(Math.max(1, w)), height: 20, rx: 3 }),
          ) +
          el(
            'span',
            { class: 'rv' },
            c.minutes >= 0.5 ? `${Math.round(c.minutes)} min` : '&lt;1 min',
          ),
      );
    })
    .join('');
  const rest = map.characters.length - shown.length;
  const more = rest > 0 ? el('li', { class: 'more' }, `and ${rest} more`) : '';
  const play = map.kind === 'play';
  const table = chartTable(
    play ? 'Time on stage, and share of the talking' : 'Screen time, and share of the talking',
    ['Character', 'Minutes', 'Scenes', 'Share of the talking'],
    map.characters.map((c) => [c.name, Math.round(c.minutes), c.scenes, `${c.share}%`]),
  );
  return el(
    'div',
    { class: 'rankbox' },
    el('p', { class: 'lbl' }, play ? 'Time on stage' : 'Time on screen') +
      el(
        'ol',
        {
          class: 'rank',
          'aria-label': play ? 'Time on stage, most first' : 'Screen time, most first',
        },
        items + more,
      ) +
      table,
  );
}

/**
 * A lead's presence strip on the page axis: filled where they speak, outlined where they are there
 * and silent; a play's from their stage spans. The unwritten tail is a dashed stretch.
 */
function presenceHtml(map: StoryMap, axis: Axis, c: MapCharacter, i: number): string {
  let marks = '';
  for (const p of c.presence) {
    const span = axis.scenes[p.scene];
    if (!span) continue;
    let box = drawn(span);
    const line = map.scenes[p.scene]?.stage?.find((l) => l.character === i);
    if (line) {
      const from = span.x + span.w * Math.max(0, Math.min(1, line.from));
      const to = span.x + span.w * Math.max(0, Math.min(1, line.to));
      box = { x: from, w: Math.max(MIN_WIDTH, to - from) };
    }
    marks += p.speaking
      ? el('rect', { class: 'on', x: pct(box.x), y: 1, width: pct(box.w), height: 14 })
      : el('rect', { class: 'mute', x: pct(box.x), y: 1.5, width: pct(box.w), height: 13 });
  }
  const tail =
    axis.tail && map.status !== 'finished'
      ? el('rect', {
          class: 'gapp',
          x: pct(axis.tail.x + 0.3),
          y: 1.5,
          width: pct(Math.max(0.3, axis.tail.w - 0.3)),
          height: 13,
        })
      : '';
  return el(
    'svg',
    { class: 'pres', width: '100%', height: 16, 'aria-hidden': 'true' },
    el('rect', { class: 'rail', width: '100%', y: 7.5, height: 1 }) + marks + tail,
  );
}

/** A name longer than this, in characters, is set smaller on its card and cut to three lines. */
const LONG_NAME = 40;

/** A lead's card (design §2.6). */
function cardHtml(map: StoryMap, axis: Axis, c: MapCharacter, i: number): string {
  const play = map.kind === 'play';
  const name =
    el('span', { class: 'first' }, escapeHtml(c.first)) + (c.rest ? ` ${escapeHtml(c.rest)}` : '');
  const head = el(
    'div',
    { class: 'ch' },
    chip(c, i, { decor: true, big: true }) +
      el('h3', Array.from(c.name).length > LONG_NAME ? { class: 'clamp' } : {}, name),
  );
  const about = [c.age, c.hook].filter((x): x is string => !!x?.trim());
  const hook = about.length > 0 ? el('p', { class: 'hook' }, escapeHtml(about.join(' · '))) : '';
  const num = (term: string, value: string) =>
    el('div', {}, el('dt', {}, term) + el('dd', {}, value));
  const nums = el(
    'dl',
    { class: 'nums' },
    num(play ? 'on stage' : 'on screen', bigMinutes(c.minutes)) +
      num(c.scenes === 1 ? 'scene' : 'scenes', String(c.scenes)) +
      num('of the talking', `${c.share}${el('small', {}, '%')}`),
  );
  const quote = c.signature === null ? null : map.quotes[c.signature];
  const line = quote ? el('q', {}, escapeHtml(quote.text)) : '';
  return el(
    'article',
    { class: `card ${toneClass(c)}` },
    head + hook + presenceHtml(map, axis, c, i) + nums + line,
  );
}

/** The rest of the cast after the leads: the next eight with their hooks, and "and N more". */
function minorHtml(map: StoryMap): string {
  const rest = map.characters.slice(STORY_MAP_LIMITS.leads);
  if (rest.length === 0) return '';
  const shown = rest.slice(0, STORY_MAP_LIMITS.rest);
  const items = shown
    .map((c, k) =>
      el(
        'li',
        {},
        chip(c, STORY_MAP_LIMITS.leads + k, { decor: true }) +
          el(
            'span',
            {},
            el('b', {}, escapeHtml(c.name)) + (c.hook ? ` ${escapeHtml(c.hook)}` : ''),
          ),
      ),
    )
    .join('');
  const more =
    rest.length > shown.length
      ? el('li', { class: 'more' }, `and ${rest.length - shown.length} more`)
      : '';
  return el('ul', { class: 'minor' }, items + more);
}

/** A screenplay's half-matrix of the leads (design §2.6): shaded in five steps, the number inside. */
function matrixHtml(map: StoryMap): string {
  const leads = map.characters.flatMap((c, i) => (c.lead ? [i] : []));
  if (leads.length < 2 || map.pairs.length === 0) return '';
  const most = Math.max(0, ...map.pairs.map((p) => p.scenes));
  const [LABEL, CELL, STEP] = [84, 30, 33];
  const n = leads.length;
  const width = LABEL + (n - 1) * STEP;
  const height = (n - 1) * STEP + 18;
  const col = (i: number) => leads.indexOf(i);
  let out = '';
  for (let r = 1; r < n; r++) {
    const name = map.characters[leads[r] as number]?.first ?? '';
    out += el(
      'text',
      { class: 'ml', x: LABEL - 8, y: (r - 1) * STEP + 20, 'text-anchor': 'end' },
      escapeHtml(Array.from(name).length > 10 ? `${Array.from(name).slice(0, 9).join('')}…` : name),
    );
  }
  for (let k = 0; k < n - 1; k++) {
    out += el(
      'text',
      { class: 'ml', x: LABEL + k * STEP + CELL / 2, y: height - 2, 'text-anchor': 'middle' },
      escapeHtml(map.characters[leads[k] as number]?.initial ?? ''),
    );
  }
  for (const p of map.pairs) {
    const [x, y] = [col(p.a), col(p.b)];
    if (x < 0 || y < 0) continue;
    const level = p.scenes > 0 && most > 0 ? Math.max(1, Math.ceil((p.scenes / most) * 4)) : 0;
    const a = map.characters[p.a]?.name ?? '';
    const b = map.characters[p.b]?.name ?? '';
    const [cx, cy] = [LABEL + x * STEP, (y - 1) * STEP];
    out += el(
      'rect',
      { class: `m l${level}`, x: cx, y: cy, width: CELL, height: CELL, rx: 3 },
      el(
        'title',
        {},
        escapeHtml(`${a} and ${b}: ${p.scenes} ${p.scenes === 1 ? 'scene' : 'scenes'}`),
      ),
    );
    if (p.scenes > 0) {
      out += el(
        'text',
        {
          class: `mv${level >= 3 ? ' hi' : ''}`,
          x: cx + CELL / 2,
          y: cy + 19,
          'text-anchor': 'middle',
        },
        String(p.scenes),
      );
    }
  }
  const svg = el(
    'svg',
    { class: 'mat', viewBox: `0 0 ${width} ${height}`, width: '100%', role: 'img' },
    el('title', {}, 'How many scenes each pair of leading characters share') + out,
  );
  const table = chartTable(
    'Scenes each pair shares',
    ['Pair', 'Scenes'],
    map.pairs.map((p) => [
      `${map.characters[p.a]?.name ?? ''} and ${map.characters[p.b]?.name ?? ''}`,
      p.scenes,
    ]),
  );
  return el(
    'div',
    { class: 'panel mpanel' },
    el('p', { class: 'lbl' }, 'Who shares scenes') +
      svg +
      el('p', { class: 'cap' }, 'Brighter squares: more scenes together.') +
      table,
  );
}

/** A play's pairs who share the stage most (Call 28): two chips, a bar, and the count. */
function sharesHtml(map: StoryMap): string {
  if (map.pairs.length === 0) return '';
  const most = Math.max(1, ...map.pairs.map((p) => p.scenes));
  const items = map.pairs
    .map((p) => {
      const a = map.characters[p.a] ?? null;
      const b = map.characters[p.b] ?? null;
      const scenes = `${p.scenes} ${p.scenes === 1 ? 'scene' : 'scenes'}`;
      return el(
        'li',
        {},
        chip(a, p.a, { decor: true }) +
          chip(b, p.b, { decor: true }) +
          el(
            'svg',
            { class: `bar ${toneClass(b)}`, width: '100%', height: 8, 'aria-hidden': 'true' },
            el('rect', { width: pct((p.scenes / most) * 100), height: 8, rx: 4 }),
          ) +
          el(
            'span',
            { 'aria-hidden': 'true' },
            el('b', {}, String(p.scenes)) + (p.scenes === 1 ? ' scene' : ' scenes'),
          ) +
          el(
            'span',
            { class: 'sr' },
            escapeHtml(`${a?.name ?? ''} and ${b?.name ?? ''} share the stage in ${scenes}.`),
          ),
      );
    })
    .join('');
  return el(
    'div',
    { class: 'panel shares' },
    el('p', { class: 'lbl' }, 'Who shares the stage most') + el('ol', {}, items),
  );
}

const RULES = `${CHIP_RULES}
.rankbox .lbl{margin-bottom:10px}
.rank{list-style:none;margin:0;padding:0;display:grid;gap:7px}
.rank li{display:grid;grid-template-columns:96px minmax(0,1fr) 54px;gap:10px;align-items:center}
.rank li.more{display:block;font-family:var(--mono);font-size:13px;color:var(--mute);padding-top:4px}
.rn{font-family:var(--display);text-transform:uppercase;font-size:19px;line-height:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rank svg{display:block}.rank rect{fill:var(--c)}
.rv{font-family:var(--mono);font-size:12.5px;color:var(--mute);text-align:right;white-space:nowrap}
.cards{display:grid;grid-auto-flow:column;grid-auto-columns:84%;gap:10px;overflow-x:auto;scroll-snap-type:x mandatory;margin:28px -16px 0;padding:0 16px 8px;scroll-padding-inline:16px;scrollbar-width:thin;scrollbar-color:var(--line) transparent}
.card{scroll-snap-align:start;background:var(--panel);border:1px solid var(--line);border-top:4px solid var(--c);padding:20px 16px 18px;display:flex;flex-direction:column;gap:12px;min-width:0}
.ch{display:flex;gap:12px;align-items:center}
.card h3{font-size:44px;line-height:.9;overflow-wrap:anywhere;min-width:0}
.card h3 .first{color:var(--c)}
.card h3.clamp{font-size:28px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.hook{margin:0;color:var(--mute);font-size:15px;line-height:1.4}
.pres{display:block;overflow:visible}
.pres .rail{fill:var(--line)}.pres .on{fill:var(--c)}.pres .mute{fill:none;stroke:var(--c);stroke-width:1.2}
.pres .gapp{fill:none;stroke:var(--coral);stroke-width:1;stroke-dasharray:4 3}
.nums{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.nums>div{display:flex;flex-direction:column;gap:2px}
.nums dd{order:-1;font-family:var(--display);font-size:32px;line-height:1;white-space:nowrap}
.nums dd small{font-size:16px;color:var(--mute)}
.nums dt{font-family:var(--mono);font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--mute)}
.card q{font-family:var(--mono);font-size:16px;line-height:1.4;quotes:"\\201C" "\\201D";display:block;border-top:1px solid var(--line);padding-top:12px;margin-top:auto}
.swipe{font-family:var(--mono);font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--mute);margin:10px 0 0}
.minor{list-style:none;padding:0;margin:20px 0 0;display:grid;gap:8px;font-size:15px;color:var(--mute)}
.minor li{display:flex;gap:10px;align-items:center;line-height:1.3}
.minor b{color:var(--fg);font-weight:600}
.minor .more{font-family:var(--mono);font-size:13px}
.mpanel{max-width:520px}
.mat{display:block;height:auto}
.mat .ml{font-family:var(--mono);font-size:11px;fill:var(--mute)}
.mat .l0{fill:var(--panel2)}.mat .l1{fill:#3a2a2a}.mat .l2{fill:#7a3f39}.mat .l3{fill:#c45449}.mat .l4{fill:var(--coral)}
.mat .mv{font-family:var(--mono);font-size:12px;fill:var(--fg)}.mat .mv.hi{fill:var(--ink);font-weight:700}
.mpanel .cap{margin:10px 0 0;font-size:14px}
.shares ol{list-style:none;margin:0;padding:0;display:grid;gap:10px}
.shares li{display:grid;grid-template-columns:auto auto minmax(0,1fr) auto;gap:8px;align-items:center;font-size:15px}
.shares .bar{display:block}.shares .bar rect{fill:var(--c)}
.shares b{font-family:var(--display);font-weight:400;font-size:20px}
@media (min-width:700px){
.rank li{grid-template-columns:150px minmax(0,1fr) 64px}
.rn{font-size:24px}
.cards{grid-auto-flow:row;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;overflow:visible;margin:28px 0 0;padding:0}
.swipe{display:none}
.minor{grid-template-columns:repeat(2,minmax(0,1fr))}
}
@media (min-width:1100px){
.cards{grid-template-columns:repeat(4,minmax(0,1fr))}
#people{display:grid;grid-template-columns:minmax(0,1fr) 420px;gap:0 40px;align-items:start}
#people>*{grid-column:1/-1}
#people>.rankbox{grid-column:1}
#people>.side{grid-column:2;grid-row:2}
#people .mpanel,#people .shares{margin-top:0;max-width:none}
}
@media print{.cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));overflow:visible}.swipe{display:none}}`;

/** The characters section: left out when the script has none. */
export const peopleSection: Section = (map) => {
  if (map.characters.length === 0) return { nav: null, html: '', rules: '' };
  const axis = axisOf(map);
  const leads = map.characters.flatMap((c, i) => (c.lead ? [{ c, i }] : []));
  const cards =
    leads.length > 0
      ? el(
          'div',
          {
            class: 'cards',
            role: 'region',
            'aria-label': 'Leading characters',
            tabindex: '0',
          },
          leads.map(({ c, i }) => cardHtml(map, axis, c, i)).join(''),
        ) +
        (leads.length > 1
          ? el('p', { class: 'swipe', 'aria-hidden': 'true' }, 'Swipe for more →')
          : '')
      : '';
  const pairs = map.kind === 'play' ? sharesHtml(map) : matrixHtml(map);
  const html = el(
    'section',
    { id: 'people', 'aria-labelledby': 'people-h' },
    el('h2', { class: 'sec-h', id: 'people-h' }, 'Characters') +
      rankHtml(map) +
      (pairs ? el('div', { class: 'side' }, pairs) : '') +
      cards +
      minorHtml(map),
  );
  return { nav: { id: 'people', label: 'Characters' }, html, rules: RULES };
};
