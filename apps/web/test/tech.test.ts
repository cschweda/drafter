// The Technical details page (out-the-door design §4): its data is checked against the repository
// (every package and what it uses, every third-party runtime dependency), and its Markdown copy,
// docs/technical-details.md, is generated from the same data, with the diagrams as Mermaid.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { drawnPackages, packageRows, technicalMarkdown, toMermaid } from '../app/about/mermaid';
import {
  DEPENDENCY_NOTES,
  type Diagram,
  PACKAGES,
  type PackageNote,
  TECH_SECTIONS,
  type TechBlock,
} from '../app/about/tech';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

interface Manifest {
  name: string;
  dependencies?: Record<string, string>;
}

/** Every package.json in `apps/` and `packages/`. */
function manifests(): Manifest[] {
  const found: Manifest[] = [];
  for (const group of ['apps', 'packages']) {
    for (const name of readdirSync(join(ROOT, group))) {
      const file = join(ROOT, group, name, 'package.json');
      if (existsSync(file)) found.push(JSON.parse(readFileSync(file, 'utf8')) as Manifest);
    }
  }
  return found;
}

const runtime = (m: Manifest) => Object.keys(m.dependencies ?? {});

function blocks(): TechBlock[] {
  return TECH_SECTIONS.flatMap((s) => [...s.plain, ...s.details]);
}

function diagrams(): Diagram[] {
  return blocks().flatMap((b) => (b.kind === 'diagram' ? [b.diagram] : []));
}

describe('the data, against the repository', () => {
  test('PACKAGES lists every package, and each uses exactly its @drafter/* runtime dependencies', () => {
    const all = manifests();
    expect(PACKAGES.map((p) => p.name).sort()).toEqual(all.map((m) => m.name).sort());
    for (const m of all) {
      const note = PACKAGES.find((p) => p.name === m.name);
      expect([...(note?.uses ?? [])].sort(), m.name).toEqual(
        runtime(m)
          .filter((d) => d.startsWith('@drafter/'))
          .sort(),
      );
      expect(note?.does.length, m.name).toBeGreaterThan(20);
    }
  });

  test('DEPENDENCY_NOTES names exactly the third-party runtime dependencies of every package.json', () => {
    const wanted = new Set(
      manifests().flatMap((m) => runtime(m).filter((d) => !d.startsWith('@drafter/'))),
    );
    const named = new Set(Object.keys(DEPENDENCY_NOTES));
    expect([...wanted].filter((d) => !named.has(d)).sort(), 'missing').toEqual([]);
    expect([...named].filter((d) => !wanted.has(d)).sort(), 'stale').toEqual([]);
    for (const [name, line] of Object.entries(DEPENDENCY_NOTES)) {
      expect(line.length, name).toBeGreaterThan(15);
    }
  });

  test('has the ten parts, each with plain words first and details after', () => {
    expect(TECH_SECTIONS).toHaveLength(10);
    expect(new Set(TECH_SECTIONS.map((s) => s.id)).size).toBe(10);
    for (const section of TECH_SECTIONS) {
      expect(section.plain[0]?.kind, section.id).toBe('p');
      expect(section.details.length, section.id).toBeGreaterThan(0);
    }
    expect(TECH_SECTIONS.at(-1)?.title).toBe('What it depends on');
  });

  test('every diagram has a caption and every flow at least two steps', () => {
    const all = diagrams();
    expect(all.length).toBe(5);
    expect(all.filter((d) => d.kind === 'packages')).toHaveLength(1);
    expect(new Set(all.map((d) => d.id)).size).toBe(all.length);
    for (const d of all) {
      expect(d.caption.length, d.id).toBeGreaterThan(20);
      if (d.kind === 'flow') {
        expect(d.steps.length, d.id).toBeGreaterThanOrEqual(2);
        for (const step of d.steps) {
          expect(step.label, d.id).toBeTruthy();
          expect(step.detail, d.id).toBeTruthy();
        }
      }
    }
  });

  test('names no employer, and no screenwriting app but Final Draft (its file format)', () => {
    const text = JSON.stringify([TECH_SECTIONS, PACKAGES, DEPENDENCY_NOTES]);
    expect(text).not.toMatch(/ICJIA|Highland|Fade In|WriterSolo|Celtx|Trelby|Slugline/i);
  });
});

const FIXTURE: PackageNote[] = [
  { name: '@drafter/web', does: 'The app.', uses: ['@drafter/layout', '@drafter/fountain'] },
  { name: '@drafter/layout', does: 'Pages.', uses: ['@drafter/fountain'] },
  { name: '@drafter/fountain', does: 'The parser.', uses: [] },
  { name: '@drafter/desktop', does: 'The window.', uses: [] },
];

describe('packageRows', () => {
  test('packageRows puts each package below everything it uses', () => {
    expect(packageRows(FIXTURE).map((row) => row.map((p) => p.name))).toEqual([
      ['@drafter/fountain', '@drafter/desktop'],
      ['@drafter/layout'],
      ['@drafter/web'],
    ]);
    const rows = packageRows(PACKAGES);
    const rowOf = new Map(rows.flatMap((row, i) => row.map((p) => [p.name, i] as const)));
    for (const p of PACKAGES) {
      for (const used of p.uses)
        expect(rowOf.get(used), `${p.name} uses ${used}`).toBeLessThan(rowOf.get(p.name) ?? -1);
    }
  });

  test('draws only the packages that use another or are used', () => {
    expect(drawnPackages(FIXTURE).map((p) => p.name)).toEqual([
      '@drafter/web',
      '@drafter/layout',
      '@drafter/fountain',
    ]);
  });
});

describe('toMermaid', () => {
  test('toMermaid writes a chain for a flow and an edge per use for the packages', () => {
    const flow: Diagram = {
      id: 'f',
      kind: 'flow',
      caption: 'A chain.',
      steps: [
        { label: 'You type', detail: 'in the editor' },
        { label: 'The parse', detail: 'the whole script' },
        { label: 'The page', detail: 'drawn' },
      ],
    };
    expect(toMermaid(flow, FIXTURE)).toBe(
      [
        'flowchart TD',
        '  s1["You type<br/>in the editor"]',
        '  s2["The parse<br/>the whole script"]',
        '  s3["The page<br/>drawn"]',
        '  s1 --> s2',
        '  s2 --> s3',
      ].join('\n'),
    );
    expect(toMermaid({ id: 'p', kind: 'packages', caption: 'Layers.' }, FIXTURE)).toBe(
      [
        'flowchart BT',
        '  web["@drafter/web"]',
        '  layout["@drafter/layout"]',
        '  fountain["@drafter/fountain"]',
        '  layout --> web',
        '  fountain --> web',
        '  fountain --> layout',
      ].join('\n'),
    );
  });

  test('escapes quotes in labels', () => {
    const flow: Diagram = {
      id: 'q',
      kind: 'flow',
      caption: 'Quotes.',
      steps: [
        { label: 'Say "hi"', detail: 'a "quote"' },
        { label: 'Done', detail: 'ok' },
      ],
    };
    expect(toMermaid(flow, [])).toContain('s1["Say #quot;hi#quot;<br/>a #quot;quote#quot;"]');
  });
});

describe('technicalMarkdown', () => {
  const markdown = technicalMarkdown(TECH_SECTIONS, PACKAGES, DEPENDENCY_NOTES);

  test('has each part as a heading, each diagram as a mermaid block, and every dependency', () => {
    for (const s of TECH_SECTIONS) expect(markdown).toContain(`## ${s.title}`);
    expect(markdown.match(/^```mermaid$/gm)).toHaveLength(5);
    for (const name of Object.keys(DEPENDENCY_NOTES)) expect(markdown).toContain(`\`${name}\``);
    expect(markdown).toContain('(DEPENDENCIES.md)');
    expect(markdown).toContain('https://drafter.dev/docs/licences/');
  });

  test('docs/technical-details.md is the page as Markdown', async () => {
    await expect(markdown).toMatchFileSnapshot('../../../docs/technical-details.md');
  });
});
