// The Technical details page's diagrams as Mermaid, and the whole page as GitHub Markdown
// (docs/technical-details.md, which test/tech.test.ts keeps equal to `technicalMarkdown`'s output).
// Also the small helpers the page shares with it: the layers of the package diagram, and the
// pieces of an `Inline`. Pure: no imports but tech.ts's.

import {
  type Diagram,
  type Inline,
  type PackageNote,
  TECH_LEAD,
  TECH_LICENCES,
  type TechBlock,
  type TechSection,
} from './tech';

/** A run of an `Inline`: plain, `code`, or **strong**. */
export interface InlinePart {
  text: string;
  code?: true;
  strong?: true;
}

/** An `Inline` in its runs: backticks make code (nothing inside them is markup), `**` strong. */
export function inlineParts(text: Inline): InlinePart[] {
  const parts: InlinePart[] = [];
  text.split('`').forEach((piece, i) => {
    if (i % 2 === 1) {
      parts.push({ text: piece, code: true });
      return;
    }
    piece.split('**').forEach((run, j) => {
      if (!run) return;
      parts.push(j % 2 === 1 ? { text: run, strong: true } : { text: run });
    });
  });
  return parts.filter((part) => part.text !== '' || part.code);
}

/** The packages the diagram draws: those that use another or are used by one. */
export function drawnPackages(packages: readonly PackageNote[]): PackageNote[] {
  const used = new Set(packages.flatMap((p) => p.uses));
  return packages.filter((p) => p.uses.length > 0 || used.has(p.name));
}

/**
 * The packages with only their direct uses: a use that another of its uses already reaches is
 * left out (the transitive reduction), so the diagram draws about half the lines and every
 * package still reaches exactly what it uses.
 */
export function directUses(packages: readonly PackageNote[]): PackageNote[] {
  const byName = new Map(packages.map((p) => [p.name, p]));
  const reached = new Map<string, Set<string>>();
  const reachOf = (name: string): Set<string> => {
    const known = reached.get(name);
    if (known) return known;
    const out = new Set<string>();
    reached.set(name, out);
    for (const used of byName.get(name)?.uses ?? []) {
      out.add(used);
      for (const further of reachOf(used)) out.add(further);
    }
    return out;
  };
  return packages.map((p) => ({
    ...p,
    uses: p.uses.filter(
      (used) => !p.uses.some((other) => other !== used && reachOf(other).has(used)),
    ),
  }));
}

/** Each package's row: 0 for one that uses none, else one more than the deepest it uses. */
export function packageRows(packages: readonly PackageNote[]): PackageNote[][] {
  const byName = new Map(packages.map((p) => [p.name, p]));
  const depth = new Map<string, number>();
  const depthOf = (p: PackageNote, seen: Set<string>): number => {
    const known = depth.get(p.name);
    if (known !== undefined) return known;
    if (seen.has(p.name))
      throw new Error(`${p.name} uses itself, through ${[...seen].join(', ')}.`);
    seen.add(p.name);
    let d = 0;
    for (const name of p.uses) {
      const used = byName.get(name);
      if (used) d = Math.max(d, depthOf(used, seen) + 1);
    }
    seen.delete(p.name);
    depth.set(p.name, d);
    return d;
  };
  const rows: PackageNote[][] = [];
  for (const p of packages) {
    const d = depthOf(p, new Set());
    while (rows.length <= d) rows.push([]);
    rows[d]?.push(p);
  }
  return rows;
}

/** A label as Mermaid reads it inside `["…"]`: its quotes and angle brackets as entities. */
const label = (text: string) =>
  text.replaceAll('"', '#quot;').replaceAll('<', '#lt;').replaceAll('>', '#gt;');

/** A package's node id: its name without the scope, in letters, digits, and underscores. */
const nodeId = (name: string) => name.replace(/^@drafter\//, '').replace(/[^A-Za-z0-9]/g, '_');

/**
 * A flow as `flowchart TD` with one node per step, chained (a fan: the first step to each of the
 * others); packages as `flowchart BT` with an edge per direct use. Labels quoted, `"` escaped.
 */
export function toMermaid(diagram: Diagram, packages: readonly PackageNote[]): string {
  if (diagram.kind === 'flow') {
    const nodes = diagram.steps.map(
      (step, i) => `  s${i + 1}["${label(step.label)}<br/>${label(step.detail)}"]`,
    );
    const edges = diagram.steps
      .slice(1)
      .map((_, i) => `  s${diagram.fan ? 1 : i + 1} --> s${i + 2}`);
    return ['flowchart TD', ...nodes, ...edges].join('\n');
  }
  const drawn = directUses(drawnPackages(packages));
  const nodes = drawn.map((p) => `  ${nodeId(p.name)}["${label(p.name)}"]`);
  const edges = drawn.flatMap((p) =>
    p.uses.map((used) => `  ${nodeId(used)} --> ${nodeId(p.name)}`),
  );
  return ['flowchart BT', ...nodes, ...edges].join('\n');
}

/** The anchor GitHub gives a heading: lower case, punctuation dropped, spaces as hyphens. */
export function headingAnchor(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N} _-]/gu, '')
    .replaceAll(' ', '-');
}

/** A repository path as a link from docs/technical-details.md. */
const fromDocs = (path: string) => (path.startsWith('docs/') ? path.slice(5) : `../${path}`);

/** The third-party dependencies, as the page lists them, in Markdown. */
function dependencies(notes: Readonly<Record<string, string>>): string[] {
  return [
    Object.entries(notes)
      .map(([name, line]) => `- \`${name}\`: ${line}`)
      .join('\n'),
    `${TECH_LICENCES} [Third-party licences](https://drafter.dev/docs/licences/) page.`,
  ];
}

function block(
  item: TechBlock,
  packages: readonly PackageNote[],
  notes: Readonly<Record<string, string>>,
): string[] {
  switch (item.kind) {
    case 'p':
      return [item.text];
    case 'list':
      return [item.items.map((text) => `- ${text}`).join('\n')];
    case 'diagram':
      return [
        `*${item.diagram.caption}*`,
        `\`\`\`mermaid\n${toMermaid(item.diagram, packages)}\n\`\`\``,
      ];
    case 'link':
      return [`[${item.text}](${fromDocs(item.path)})`];
    case 'dependencies':
      return dependencies(notes);
  }
}

/** The whole page as GitHub Markdown, each diagram as a ```mermaid block. */
export function technicalMarkdown(
  sections: readonly TechSection[],
  packages: readonly PackageNote[],
  notes: Readonly<Record<string, string>>,
): string {
  const parts = [
    '# Technical details',
    '<!-- Generated from apps/web/app/about/tech.ts by apps/web/test/tech.test.ts; to change it, change tech.ts and run `pnpm --filter @drafter/web test -- tech -u`. -->',
    TECH_LEAD,
    'The same page is in Drafter, under Help → Technical details, and at [drafter.dev/docs/technical](https://drafter.dev/docs/technical/), where the diagrams are drawn as lists of boxes.',
    '## Contents',
    sections.map((s) => `- [${s.title}](#${headingAnchor(s.title)})`).join('\n'),
  ];
  for (const section of sections) {
    parts.push(`## ${section.title}`);
    for (const item of [...section.plain, ...section.details]) {
      parts.push(...block(item, packages, notes));
    }
  }
  return `${parts.join('\n\n')}\n`;
}
