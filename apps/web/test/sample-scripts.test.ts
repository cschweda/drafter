import { readFileSync } from 'node:fs';
import { parse } from '@drafter/fountain';
import { paginate } from '@drafter/layout';
import { lint } from '@drafter/lint';
import { builtins, type Template } from '@drafter/templates';
import { describe, expect, test } from 'vitest';
import { SAMPLES } from '../app/editor/sample-kinds';
import { SAMPLE_SCRIPTS } from '../app/editor/sample-scripts';
import { templateIdOf } from '../app/editor/template';
import { markdownTitle } from '../app/markdown/title';

// Help → Sample scripts: one tiny, original sample for each built-in template and for Markdown,
// each under a page, each showing every element its template has once.

const file = (name: string) =>
  readFileSync(new URL(`../app/editor/sample-scripts/${name}`, import.meta.url), 'utf8');

const screenplay = file('screenplay.fountain');
const stagePlay = file('stage-play.fountain');
const markdown = file('markdown.md');

function check(source: string, templateId: string) {
  const doc = parse(source);
  expect(templateIdOf(doc)).toBe(templateId);
  const template = builtins[templateId] as Template;
  const problems = lint(doc, template).filter((d) => d.severity !== 'info');
  expect(problems.map((d) => `${d.ruleId}: ${d.message}`)).toEqual([]);
  const layout = paginate(doc, template);
  expect(layout.diagnostics).toEqual([]);
  // The title page is page 0; the script itself is one page.
  expect(layout.pages.filter((p) => p.number >= 1)).toHaveLength(1);
  return doc;
}

describe('the sample scripts', () => {
  test('are one for each sample kind, in the menus’ order, with the files’ text', () => {
    expect(SAMPLE_SCRIPTS.map((s) => s.kind)).toEqual(SAMPLES.map((s) => s.kind));
    expect(SAMPLE_SCRIPTS.map((s) => s.text)).toEqual([screenplay, stagePlay, markdown]);
  });

  test('the screenplay has no Problems, fits one page, and shows each element once', () => {
    const doc = check(screenplay, 'us-screenplay');
    const kinds = doc.blocks.map((b) => b.kind);
    for (const kind of [
      'scene_heading',
      'action',
      'character',
      'parenthetical',
      'dialogue',
      'transition',
      'centered',
      'section',
      'synopsis',
    ]) {
      expect(kinds, kind).toContain(kind);
    }
    expect(doc.titlePage?.fields.length ?? 0).toBeGreaterThan(0);
    expect(doc.regions.some((r) => r.kind === 'note')).toBe(true);
    expect(screenplay).toMatch(/^[A-Z ]+ \^$/m);
    expect(screenplay).toContain('[[');
    expect(screenplay).toMatch(/\*[^*\s][^*]*\*/);
    expect(screenplay).toMatch(/\*\*[^*]+\*\*/);
    expect(screenplay).toMatch(/_[^_]+_/);
    expect(screenplay).toMatch(/^Title: Sample: Screenplay$/m);
  });

  test('the stage play has no Problems, fits one page, and has its acts, scenes, cues, and directions', () => {
    const doc = check(stagePlay, 'stage-play-standard');
    const sections = doc.blocks.filter((b) => b.kind === 'section');
    expect(sections.length).toBeGreaterThanOrEqual(3);
    const kinds = doc.blocks.map((b) => b.kind);
    for (const kind of ['action', 'character', 'parenthetical', 'dialogue']) {
      expect(kinds, kind).toContain(kind);
    }
    expect(kinds).not.toContain('scene_heading');
    expect(stagePlay).toMatch(/^Title: Sample: Stage play$/m);
  });

  test('the Markdown document has headings, emphasis, a list, a quote, and a link', () => {
    expect(markdownTitle(markdown)).toBe('Sample: Markdown');
    expect(markdown).toMatch(/^## /m);
    expect(markdown).toMatch(/\*\*[^*]+\*\*/);
    expect(markdown).toMatch(/(^|[^*])\*[^*\s][^*]*\*/);
    expect(markdown).toMatch(/^- /m);
    expect(markdown).toMatch(/^> /m);
    expect(markdown).toMatch(/\[[^\]]+\]\(https:\/\/[^)]+\)/);
    expect(markdown.split('\n').length).toBeLessThan(40);
  });
});
