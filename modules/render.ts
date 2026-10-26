import type { Component, VNode } from 'vue';
import type { ModuleContext } from '~/modules/types';

// For the tests of the modules in this folder (not a module): draws a module's tab without a
// browser. A tab is a component given `context`; this runs its setup and its render function once,
// and reads the vnode tree it gives back. Click a button and the handler the tab gave it runs.

type Child = VNode | string | number | boolean | null | undefined | Child[];

export interface Drawn {
  /** All the text, with a space between elements. */
  text: string;
  buttons: Array<{ text: string; click(): void }>;
  /** Tag names in order, to check what kind of elements the tab used. */
  tags: string[];
}

function visit(child: Child, into: Drawn, parts: string[]): void {
  if (child === null || child === undefined || typeof child === 'boolean') return;
  if (Array.isArray(child)) {
    for (const c of child) visit(c, into, parts);
    return;
  }
  if (typeof child === 'string' || typeof child === 'number') {
    parts.push(String(child));
    return;
  }
  if (typeof child.type === 'string') into.tags.push(child.type);
  const inner: string[] = [];
  visit(child.children as Child, into, inner);
  const text = inner.join(' ').replace(/\s+/g, ' ').trim();
  parts.push(text);
  const onClick = (child.props as { onClick?: () => void } | null)?.onClick;
  if (child.type === 'button' && onClick) into.buttons.push({ text, click: onClick });
}

export function draw(component: Component, context: ModuleContext): Drawn {
  const options = component as unknown as {
    setup(props: { context: ModuleContext }): () => VNode;
  };
  const render = options.setup({ context });
  const drawn: Drawn = { text: '', buttons: [], tags: [] };
  const parts: string[] = [];
  visit(render(), drawn, parts);
  drawn.text = parts.join(' ').replace(/\s+/g, ' ').trim();
  return drawn;
}
