// The Technical details page (out-the-door design §4): its data is checked against the repository
// (every package and what it uses, every third-party runtime dependency), and its Markdown copy,
// docs/technical-details.md, is generated from the same data, with the diagrams as Mermaid.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import {
  directUses,
  drawnPackages,
  inlineParts,
  packageRows,
  technicalMarkdown,
  toMermaid,
} from '../app/about/mermaid';
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

  test('spells as the rest of Drafter does, in US English', () => {
    expect(TECH_SECTIONS.map((s) => s.id)).toContain('organized');
    expect(JSON.stringify([TECH_SECTIONS, DEPENDENCY_NOTES])).not.toMatch(/organis/i);
  });

  test('the storage diagram is a fan from the editor, not a chain', () => {
    const storage = diagrams().find((d) => d.id === 'storage');
    expect(storage?.kind === 'flow' && storage.fan).toBe(true);
  });

  test('names no employer, and no screenwriting app but the file formats Drafter reads', () => {
    const text = JSON.stringify([TECH_SECTIONS, PACKAGES, DEPENDENCY_NOTES]);
    expect(text).not.toMatch(/ICJIA|WriterSolo|Celtx|Trelby|Slugline/i);
    expect(text).toMatch(/Highland \(\.highland\)/);
    expect(text).toMatch(/Fade In \(\.fadein\)/);
    expect(namesAnApp(text)).toBe(false);
  });

  test('the file-format guard turns away the two apps named any other way', () => {
    expect(namesAnApp('Highland (.highland) and Fade In (.fadein) files')).toBe(false);
    expect(namesAnApp('Drafter is faster than Highland')).toBe(true);
    expect(namesAnApp('as fade in does')).toBe(true);
  });
});

/**
 * Whether `text` names Highland or Fade In other than as a file format Drafter reads, which is
 * always with its extension, as "Final Draft (.fdx)" is: never to describe or compare the apps.
 */
function namesAnApp(text: string): boolean {
  const left = text.replaceAll('Highland (.highland)', '').replaceAll('Fade In (.fadein)', '');
  return /highland|fade ?in\b/i.test(left);
}

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

/** Every package `name` reaches through `uses`, at any depth. */
function reach(packages: readonly PackageNote[], name: string): string[] {
  const byName = new Map(packages.map((p) => [p.name, p]));
  const seen = new Set<string>();
  const visit = (n: string) => {
    for (const used of byName.get(n)?.uses ?? []) {
      if (seen.has(used)) continue;
      seen.add(used);
      visit(used);
    }
  };
  visit(name);
  return [...seen].sort();
}

describe('directUses', () => {
  test('keeps only the uses not reached through another, and reaches all the same packages', () => {
    expect(directUses(FIXTURE).map((p) => [p.name, p.uses])).toEqual([
      ['@drafter/web', ['@drafter/layout']],
      ['@drafter/layout', ['@drafter/fountain']],
      ['@drafter/fountain', []],
      ['@drafter/desktop', []],
    ]);
    const direct = directUses(PACKAGES);
    for (const p of PACKAGES) {
      // The drawing reaches exactly what the package uses, directly or not.
      expect(reach(direct, p.name), p.name).toEqual(reach(PACKAGES, p.name));
      const kept = direct.find((d) => d.name === p.name)?.uses ?? [];
      // No line the others already imply.
      for (const used of kept) {
        const others = kept.filter((u) => u !== used);
        expect(
          others.some((o) => reach(PACKAGES, o).includes(used)),
          `${p.name} → ${used}`,
        ).toBe(false);
      }
    }
    const edges = direct.reduce((n, p) => n + p.uses.length, 0);
    expect(edges).toBeLessThan(PACKAGES.reduce((n, p) => n + p.uses.length, 0));
    // A drawing that stays readable: 31 lines since the app uses the HTML export's package.
    expect(edges).toBeLessThanOrEqual(31);
  });
});

describe('inlineParts', () => {
  test('reads backticks as code and double stars as strong, and nothing else', () => {
    expect(inlineParts('plain')).toEqual([{ text: 'plain' }]);
    expect(inlineParts('a `b` c')).toEqual([
      { text: 'a ' },
      { text: 'b', code: true },
      { text: ' c' },
    ]);
    expect(inlineParts('**The editor** is `x`.')).toEqual([
      { text: 'The editor', strong: true },
      { text: ' is ' },
      { text: 'x', code: true },
      { text: '.' },
    ]);
    // Nothing inside backticks is markup, and an empty pair is still code.
    expect(inlineParts('`**not strong**`')).toEqual([{ text: '**not strong**', code: true }]);
    expect(inlineParts('``')).toEqual([{ text: '', code: true }]);
    // A single star, an underscore, or brackets are plain text.
    expect(inlineParts('a *b* _c_ [d](e)')).toEqual([{ text: 'a *b* _c_ [d](e)' }]);
    expect(inlineParts('')).toEqual([]);
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
        // web uses fountain through layout, so only its direct use is drawn.
        '  layout --> web',
        '  fountain --> layout',
      ].join('\n'),
    );
  });

  test('toMermaid draws a fan from its first step to each of the others', () => {
    const fan: Diagram = {
      id: 'fan',
      kind: 'flow',
      fan: true,
      caption: 'Three at once.',
      steps: [
        { label: 'You type', detail: 'the text' },
        { label: 'A', detail: 'one' },
        { label: 'B', detail: 'two' },
      ],
    };
    expect(toMermaid(fan, [])).toBe(
      [
        'flowchart TD',
        '  s1["You type<br/>the text"]',
        '  s2["A<br/>one"]',
        '  s3["B<br/>two"]',
        '  s1 --> s2',
        '  s1 --> s3',
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
