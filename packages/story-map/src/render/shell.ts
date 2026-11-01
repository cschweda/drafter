import { el, escapeHtml, langOf } from '@drafter/render-html-file';
import type { StoryMap } from '../types';
import { type StoryMapFonts, storyMapFontFaces } from './fonts';
import { cssPart, headHtml, titleRules } from './head';
import { STORY_MAP_STYLESHEET } from './style';

/** What `renderStoryMap` draws from. */
export interface RenderInput {
  map: StoryMap;
  fonts: StoryMapFonts;
  /** The script's language, a BCP 47 tag; anything else is read as `en`. */
  lang: string;
  /** Who made the file, for `<meta name="generator">`, e.g. "Drafter 0.24.1". */
  generator: string;
}

/**
 * One part of the page between the facts and the close (Tasks 5–6): its link in the nav, or none;
 * its markup, with every piece of the writer's text escaped; and its generated CSS rules, which go
 * in the one `<style>` (no `<` and no carriage return).
 */
export type Section = (map: StoryMap) => {
  nav: { id: string; label: string } | null;
  html: string;
  rules: string;
};

/** The kind line, verbatim (Global Constraints). */
export function kindLine(map: StoryMap): string {
  const what = map.kind === 'play' ? 'stage play' : 'screenplay';
  return map.status === 'finished' ? `A finished ${what}` : `A ${what} in progress`;
}

const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);

/** The running time as big numbers with small units: "1 hr 38 min", "4 min". */
function timeHtml(minutes: number): string {
  const whole = Math.max(0, Math.round(minutes));
  const small = (unit: string) => el('small', {}, ` ${unit}`);
  const hours = Math.floor(whole / 60);
  const rest = whole % 60;
  if (hours === 0) return `${rest}${small('min')}`;
  return rest === 0 ? `${hours}${small('hr')}` : `${hours}${small('hr')} ${rest}${small('min')}`;
}

/** The greeting (design §2.1): who, the line under their name, the title, the status, the idea. */
function greetingHtml(map: StoryMap): string {
  const who = map.writer
    ? el('span', { class: 'av', 'aria-hidden': 'true' }, escapeHtml(map.writer.initials)) +
      el(
        'span',
        {},
        el('b', {}, escapeHtml(map.writer.name)) + (map.greeting ? escapeHtml(map.greeting) : ''),
      )
    : el('span', {}, escapeHtml(map.greeting));
  const from = map.writer || map.greeting ? el('p', { class: 'from' }, who) : '';

  const words = map.title.split(/\s+/).filter(Boolean);
  const title = el('h1', {}, words.map((word) => el('span', {}, escapeHtml(word))).join(' '));

  const done = map.status === 'finished';
  const status = el(
    'p',
    { class: 'status' },
    el('span', { class: `pill ${done ? 'done' : 'wip'}` }, kindLine(map)) +
      el('span', {}, escapeHtml(map.draftLabel)) +
      (map.updated ? el('span', {}, `updated ${escapeHtml(map.updated)}`) : ''),
  );
  const log = map.logline?.trim() ? el('p', { class: 'log' }, escapeHtml(map.logline)) : '';
  const explain = map.explain?.trim() ? el('p', { class: 'explain' }, escapeHtml(map.explain)) : '';
  return from + title + status + log + explain;
}

/**
 * The progress meter (design §6.2), in progress only: with a planned length, the percentage, the
 * pages, the bar, and the sentence; without one, the sentence alone; finished, nothing.
 */
function meterHtml(map: StoryMap): string {
  if (map.status === 'finished') return '';
  const { percent, plannedPages, written, sentence } = map.gaps;
  const note = sentence ? el('p', { class: 'mnote' }, escapeHtml(sentence)) : '';
  if (percent === null || plannedPages === null) {
    return note ? el('div', { class: 'meter' }, note) : '';
  }
  const share = Math.min(100, Math.max(0, Math.round(percent)));
  const label = `About ${share}% written`;
  const row = el(
    'div',
    { class: 'mrow' },
    el('b', {}, label) +
      el('span', {}, `${Math.round(written)} of ${Math.round(plannedPages)} planned pages`),
  );
  const bar = el(
    'svg',
    { width: '100%', height: 14, role: 'img', 'aria-label': label },
    el('rect', { class: 'mbg', width: '100%', height: 14, rx: 7 }) +
      el('rect', { class: 'mfg', width: `${share}%`, height: 14, rx: 7 }),
  );
  return el('div', { class: 'meter' }, row + bar + note);
}

/** The facts grid (design §2.3): each term before its number, the number shown first by CSS. */
function factsHtml(map: StoryMap): string {
  const { facts } = map;
  const done = map.status === 'finished';
  const play = map.kind === 'play';
  const time =
    play && map.interval
      ? done
        ? 'with an interval'
        : 'so far, plus an interval'
      : 'to watch, about';
  const rows: Array<[string, string]> = [
    [
      String(facts.pages),
      done ? plural(facts.pages, 'page') : `${plural(facts.pages, 'page')} so far`,
    ],
    [timeHtml(facts.minutes), time],
    [String(facts.scenes), plural(facts.scenes, 'scene')],
    [String(facts.characters), plural(facts.characters, 'character')],
    [String(facts.places), play ? plural(facts.places, 'setting') : plural(facts.places, 'place')],
  ];
  return el(
    'dl',
    { class: 'facts' },
    rows.map(([number, term]) => el('div', {}, el('dt', {}, term) + el('dd', {}, number))).join(''),
  );
}

/** The sticky nav (design §2.4): plain `#` links to the sections, or nothing with none. */
function navHtml(links: ReadonlyArray<{ id: string; label: string }>): string {
  if (links.length === 0) return '';
  const items = links
    .map((link) => el('li', {}, el('a', { href: `#${link.id}` }, escapeHtml(link.label))))
    .join('');
  return el('nav', { 'aria-label': 'On this page' }, el('ul', {}, items));
}

/** The close (design §2.10): more soon or the end, who wrote it, how to say hello, the last line. */
function closeHtml(map: StoryMap): string {
  const [first, second] = map.status === 'finished' ? ['The', 'end'] : ['More', 'soon'];
  const heading = el('h2', { id: 'soon-h' }, `${first} ${el('span', {}, second)}`);
  const rows: string[] = [];
  if (map.writer) {
    rows.push(
      el('div', {}, el('dt', {}, 'Written by') + el('dd', {}, escapeHtml(map.writer.name))),
    );
  }
  if (map.contact) {
    const text = escapeHtml(map.contact.text);
    const value = map.contact.mailto ? el('a', { href: map.contact.mailto }, text) : text;
    rows.push(el('div', {}, el('dt', {}, 'Say hello') + el('dd', {}, value)));
  }
  const made = el(
    'p',
    { class: 'made' },
    el('span', {}, escapeHtml(`${map.title} · ${map.draftLabel} · ${map.shortId}`)) +
      el('span', {}, 'Made with Drafter'),
  );
  return el(
    'section',
    { id: 'soon', class: 'soon', 'aria-labelledby': 'soon-h' },
    heading + (rows.length > 0 ? el('dl', {}, rows.join('')) : '') + made,
  );
}

/**
 * The whole file, with `sections` drawn between the nav and the close in order: the head with its
 * CSP and its one style (the fonts, the fixed stylesheet, the title's size, then the sections'
 * rules), the greeting, the meter, the facts, the nav, the sections, and the close. No script.
 */
export function pageHtml(input: RenderInput, sections: readonly Section[]): string {
  const { map } = input;
  const parts = sections.map((section) => section(map));
  const style = [
    cssPart(storyMapFontFaces(input.fonts), 'Font rules'),
    STORY_MAP_STYLESHEET,
    cssPart(titleRules(map.title), 'Title rules'),
    ...parts.map((part, i) => cssPart(part.rules, `Section ${i + 1}'s rules`)),
  ]
    .filter(Boolean)
    .join('\n');

  const hero = el(
    'div',
    { class: 'wrap' },
    el('header', { class: 'hero' }, greetingHtml(map) + meterHtml(map) + factsHtml(map)),
  );
  const nav = navHtml(parts.flatMap((part) => (part.nav ? [part.nav] : [])));
  const main = el(
    'main',
    { class: 'wrap' },
    parts.map((part) => part.html).join('') + closeHtml(map),
  );
  const body = el('body', { class: map.status === 'finished' ? 'done' : 'wip' }, hero + nav + main);

  return `<!DOCTYPE html>\n${el(
    'html',
    { lang: langOf(input.lang), 'data-theme': 'dark' },
    `\n${el('head', {}, headHtml(map.title, input.generator, style))}\n${body}\n`,
  )}\n`;
}
