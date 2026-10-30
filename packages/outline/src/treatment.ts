import type { Block, Doc } from '@drafter/fountain';
import { markdownText } from './escape';
import type { OutlineNode, Scene, SceneIndex } from './types';

// The escaper is the script's Markdown's (Call 34); re-exported so the public name stays.
export { markdownText };

// Export as treatment (Phase 2 design §6.4): the outline as Markdown. The script's title, then
// each section's title as a heading and its own synopses, then each scene's heading one level
// deeper and its synopses, and, if asked, its first paragraph of action.

const printable = (block: Block) =>
  block.lines
    .filter((line) => !line.transparent)
    .map((line) =>
      line.inline
        .map((run) => run.text)
        .join('')
        .trim(),
    )
    .filter((line) => line !== '')
    .join(' ');

/** The title page's Title, as plain text, or null. */
function titleOf(doc: Doc): string | null {
  const field = doc.titlePage?.fields.find((f) => f.key.trim().toLowerCase() === 'title');
  if (!field) return null;
  const text = field.runs
    .map((runs) =>
      runs
        .map((r) => r.text)
        .join('')
        .trim(),
    )
    .filter((t) => t !== '')
    .join(' ');
  return text === '' ? null : text;
}

const heading = (level: number, text: string) =>
  `${'#'.repeat(Math.min(6, level))} ${markdownText(text)}`;

export function treatment(
  doc: Doc,
  index: SceneIndex,
  options: { firstAction?: boolean } = {},
): string {
  const parts: string[] = [heading(1, titleOf(doc) ?? 'Treatment')];

  const sceneParts = (scene: Scene, level: number) => {
    parts.push(heading(level, scene.heading));
    for (const synopsis of scene.synopses) parts.push(markdownText(synopsis.text));
    if (options.firstAction) {
      for (let i = scene.block + 1; i < doc.blocks.length; i++) {
        const block = doc.blocks[i] as Block;
        if (block.span.from >= scene.span.to) break;
        if (block.kind !== 'action') continue;
        const text = printable(block);
        if (text === '') continue;
        parts.push(markdownText(text));
        break;
      }
    }
  };

  const walk = (nodes: OutlineNode[], level: number) => {
    for (const node of nodes) {
      if (node.item.kind === 'scene') {
        sceneParts(node.item, level);
        continue;
      }
      const section = node.item;
      parts.push(heading(level, section.title));
      // The section's own synopses: those before its first child.
      for (let i = section.block + 1; i < doc.blocks.length; i++) {
        const block = doc.blocks[i] as Block;
        if (block.span.from >= section.introEnd) break;
        if (block.kind === 'synopsis') parts.push(markdownText(block.sem.text));
      }
      if ('children' in node) walk(node.children, level + 1);
    }
  };
  walk(index.tree, 2);
  return `${parts.join('\n\n')}\n`;
}
