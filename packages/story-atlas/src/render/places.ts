// Places (design §2.8) and a play's settings (§5.1): a tag each, sized by the time spent there in
// five steps, with its scenes and minutes, and a table of the same.

import { el, escapeHtml } from '@drafter/render-html-file';
import { minutesWords } from '../words';
import type { Section } from './shell';
import { chartTable } from './table';

const RULES = `.tags{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:8px}
.tag{font-family:var(--display);text-transform:uppercase;line-height:1;padding:10px 12px 9px;border-radius:4px;display:inline-flex;flex-wrap:wrap;align-items:baseline;gap:4px 10px;background:var(--panel2);color:var(--fg);max-width:100%}
.tag b{font-weight:400;overflow-wrap:anywhere;min-width:0}
.tag span{font-family:var(--mono);font-size:11px;letter-spacing:.04em;color:var(--mute);text-transform:none;white-space:nowrap}
.tag.z1{font-size:15px}.tag.z2{font-size:19px}.tag.z3{font-size:24px}.tag.z4{font-size:30px;background:#5c302b}.tag.z5{font-size:38px;background:var(--coral);color:var(--ink)}
.tag.z4 span{color:#e3c9c4}.tag.z5 span{color:var(--ink)}
.tags .more{align-self:center;font-family:var(--mono);font-size:13px;color:var(--mute);padding:0 4px}`;

export const placesSection: Section = (map) => {
  if (map.places.length === 0) return { nav: null, html: '', rules: '' };
  const play = map.kind === 'play';
  const [id, name, one] = play
    ? ['settings', 'Settings', 'Setting']
    : ['places', 'Places', 'Place'];
  const tags = map.places
    .map((p) =>
      el(
        'li',
        { class: `tag z${p.size}` },
        el('b', {}, escapeHtml(p.name)) +
          el(
            'span',
            {},
            `${p.scenes} ${p.scenes === 1 ? 'scene' : 'scenes'} · ${minutesWords(p.minutes)}`,
          ),
      ),
    )
    .join('');
  const more = map.placesMore > 0 ? el('li', { class: 'more' }, `and ${map.placesMore} more`) : '';
  const cap = el(
    'p',
    { class: 'cap after' },
    `The bigger the name, the more of the ${play ? 'play' : 'story'} happens there.`,
  );
  const table = chartTable(
    `${name}, by time spent there`,
    [one, 'Scenes', 'Minutes'],
    map.places.map((p) => [p.name, p.scenes, Math.round(p.minutes)]),
  );
  const html = el(
    'section',
    { id, 'aria-labelledby': `${id}-h` },
    el('h2', { class: 'sec-h', id: `${id}-h` }, name) +
      el('ul', { class: 'tags' }, tags + more) +
      cap +
      table,
  );
  return { nav: { id, label: name }, html, rules: RULES };
};
