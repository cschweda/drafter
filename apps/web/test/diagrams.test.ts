import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { HOW_IT_WORKS } from '../app/about/diagrams';
import counts from '../app/about/test-counts.json';

// The How it works diagrams are in four places that must agree (docs/DEVELOPMENT.md, Test counts
// and diagrams): the Mermaid in docs/diagrams/, the same Mermaid in docs/HOW-IT-WORKS.md, the SVGs
// `pnpm diagrams` drew from it (each records its source's SHA-256), and the words for a screen
// reader in about/diagrams.ts. And the test counts the What is Drafter? page shows are whole.

const root = new URL('../../../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');
const sources = readdirSync(new URL('docs/diagrams/', root))
  .filter((name) => name.endsWith('.mmd'))
  .map((name) => ({ id: name.slice(0, -4), text: read(`docs/diagrams/${name}`) }));
const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

describe('the How it works diagrams', () => {
  test('are the four the page describes', () => {
    expect(sources.map((s) => s.id).sort()).toEqual(HOW_IT_WORKS.map((d) => d.id).sort());
  });

  test('are on docs/HOW-IT-WORKS.md exactly as in docs/diagrams/', () => {
    const blocks = [...read('docs/HOW-IT-WORKS.md').matchAll(/```mermaid\n([\s\S]*?)```/g)].map(
      (m) => m[1],
    );
    expect(blocks.length).toBe(sources.length);
    for (const { id, text } of sources) expect(blocks, id).toContain(text);
  });

  test('were drawn, in both themes, from their source as it is now', () => {
    const sizes = JSON.parse(read('apps/web/app/assets/diagrams/sizes.json'));
    for (const { id, text } of sources) {
      for (const theme of ['dark', 'light']) {
        const svg = read(`apps/web/app/assets/diagrams/${id}-${theme}.svg`);
        expect(svg, `${id}-${theme}`).toMatch(/^<svg /);
        expect(svg, `${id}-${theme}: run pnpm diagrams`).toContain(
          `data-source-sha256="${sha256(text)}"`,
        );
        // Drawn as SVG text, which an <img> shows, and nothing in it runs.
        expect(svg, `${id}-${theme}`).not.toContain('<foreignObject');
        expect(svg, `${id}-${theme}`).not.toMatch(/<script|\bon[a-z]+=/i);
        expect(sizes[id]?.[theme]?.width, `${id}-${theme}`).toBeGreaterThan(100);
      }
    }
  });

  test('each have words for a screen reader that name every box', () => {
    for (const diagram of HOW_IT_WORKS) {
      expect(diagram.description.length, diagram.id).toBeGreaterThan(150);
      const source = sources.find((s) => s.id === diagram.id)?.text ?? '';
      // Each box's first line, in its own words, is in the description.
      const boxes = [...source.matchAll(/\["([^"<]+)/g)].map((m) => m[1] as string);
      for (const box of boxes) {
        const words = box
          .replace(/^\d+\.\s*/, '')
          .toLowerCase()
          .split(/\W+/)
          .filter((w) => w.length > 3);
        const said = diagram.description.toLowerCase();
        expect(
          words.some((w) => said.includes(w)),
          `${diagram.id}: “${box}”`,
        ).toBe(true);
      }
    }
  });
});

describe('the test counts', () => {
  test('have the version, a date, and a count of every kind', () => {
    expect(counts.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(counts.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    for (const value of [
      counts.unit.packages,
      counts.unit.web,
      counts.unit.desktop,
      counts.e2e.web,
      counts.e2e.desktop,
      counts.trap.traps,
      counts.trap.checks,
    ]) {
      expect(value).toBeGreaterThan(0);
    }
    expect(counts.e2e.webRuns).toBe(counts.e2e.web * counts.e2e.webProjects.length);
    expect(Object.values(counts.trap.byFormat).reduce((a, b) => a + b, 0)).toBe(counts.trap.traps);
  });

  test('count the trap documents the manifest lists now', () => {
    const manifest = read('fixtures/trap/MANIFEST.md');
    expect(manifest).toContain(`${counts.trap.traps} traps: `);
  });
});
