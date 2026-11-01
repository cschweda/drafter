import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { DOWNLOAD_PAGE, HELP_PAGES, helpHref } from '../app/commands/data';
import {
  longDate,
  releaseUrl,
  WHATS_NEW,
  WHATS_NEW_KINDS,
  type WhatsNewEntry,
} from '../app/whats-new/entries';

// What's new's entries (docs/DECISIONS.md, What's new): newest first, each id once, a known kind,
// a real date, and one release section of the CHANGELOG for each version.

const CHANGELOG = readFileSync(new URL('../../../CHANGELOG.md', import.meta.url), 'utf8');
/**
 * The release being made, before its section is cut: the newest entries' version, when the
 * CHANGELOG has no section for it yet but has entries under [Unreleased] and an older release
 * below them. Once the section is cut, it is checked like every other.
 */
/** `0.23.2` as numbers, to compare. */
const parts = (version: string) => version.split('.').map(Number);
function compareVersions(a: string, b: string): number {
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  return 0;
}

/** The newest release in the CHANGELOG. */
const NEWEST = CHANGELOG.match(/^## \[(\d+\.\d+\.\d+)\] - /m)?.[1] ?? '0.0.0';
/** An entry for the next release, not cut yet. */
const unreleased = (entry: WhatsNewEntry) => compareVersions(entry.version, NEWEST) > 0;

describe('What’s new', () => {
  test('is newest first, by date and by version', () => {
    for (let i = 1; i < WHATS_NEW.length; i++) {
      const [before, after] = [WHATS_NEW[i - 1] as WhatsNewEntry, WHATS_NEW[i] as WhatsNewEntry];
      expect(before.date >= after.date, `${before.id} before ${after.id}`).toBe(true);
      expect(compareVersions(before.version, after.version), after.id).toBeGreaterThanOrEqual(0);
    }
  });

  test('gives each entry an id of its own', () => {
    const ids = WHATS_NEW.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^v\d+\.\d+\.\d+-[a-z0-9-]+$/);
  });

  test('uses only the four kinds', () => {
    expect(WHATS_NEW_KINDS).toEqual(['New', 'Improved', 'Fixed', 'Security']);
    for (const entry of WHATS_NEW) expect(WHATS_NEW_KINDS, entry.id).toContain(entry.kind);
  });

  test('dates each entry with a real day, its release’s in the CHANGELOG', () => {
    for (const entry of WHATS_NEW) {
      expect(entry.date, entry.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(entry.id.startsWith(`v${entry.version}-`), entry.id).toBe(true);
      // An entry for the next release waits, under [Unreleased], for its section.
      if (unreleased(entry)) continue;
      expect(new Date(`${entry.date}T00:00:00Z`).toISOString().slice(0, 10), entry.id).toBe(
        entry.date,
      );
      expect(CHANGELOG, entry.id).toContain(`## [${entry.version}] - ${entry.date}`);
    }
  });

  test('has every release from 0.1.0 to the newest in the CHANGELOG', () => {
    const released = [...CHANGELOG.matchAll(/^## \[(\d+\.\d+\.\d+)\] - /gm)].map((m) => m[1]);
    const listed = WHATS_NEW.filter((entry) => !unreleased(entry)).map((entry) => entry.version);
    expect(new Set(listed)).toEqual(new Set(released));
  });

  test('waits for the next release only with something under [Unreleased]', () => {
    const waiting = WHATS_NEW.filter(unreleased);
    if (waiting.length > 0) expect(CHANGELOG).toMatch(/^## \[Unreleased\]\n\n### /m);
    // One next release at a time, at the top.
    expect(new Set(waiting.map((entry) => entry.version)).size).toBeLessThanOrEqual(1);
    expect(WHATS_NEW.slice(0, waiting.length)).toEqual(waiting);
  });

  test('says each in a title and one or two sentences, with a link that works', () => {
    for (const entry of WHATS_NEW) {
      expect(entry.title.length, entry.id).toBeGreaterThan(5);
      // The banner ends a title that doesn't fit its line in an ellipsis; its whole text is read.
      expect(entry.title.length, entry.id).toBeLessThanOrEqual(72);
      expect(entry.title, entry.id).not.toMatch(/\.$/);
      const sentences = entry.text.split(/(?<=[.!?])\s+(?=[A-Z])/).length;
      expect(sentences, entry.id).toBeLessThanOrEqual(2);
      if (entry.link) {
        const [path] = entry.link.href.split('#');
        if (!entry.link.href.startsWith('https://')) {
          expect(['/docs/', ...[...HELP_PAGES, DOWNLOAD_PAGE].map(helpHref)], entry.id).toContain(
            path,
          );
        }
        expect(entry.link.label, entry.id).toBeTruthy();
      }
    }
  });

  test('puts the banner on Drafts and Cuts, the v0.23.2 security work, and v0.23.0’s fresh look', () => {
    expect(WHATS_NEW.filter((entry) => entry.banner).map((entry) => entry.id)).toEqual([
      'v0.24.0-drafts-and-cuts',
      'v0.23.2-trap-documents',
      'v0.23.0-fresh-look',
    ]);
    // The banner shows the newest entry marked `banner`, which needn't be the newest entry.
  });

  test('links a release on GitHub, and writes a date out in full', () => {
    expect(releaseUrl('0.23.2')).toBe('https://github.com/cschweda/drafter/releases/tag/v0.23.2');
    expect(longDate('2026-11-01')).toBe('1 November 2026');
    expect(longDate('2026-10-26')).toBe('26 October 2026');
  });
});
