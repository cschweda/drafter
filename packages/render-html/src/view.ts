import type { Layout } from '@drafter/layout';
import type { Template } from '@drafter/templates';

/**
 * The event a click on a line of the script dispatches from the view's element:
 * a `CustomEvent<{ offset: number }>`, where `offset` is a source offset for
 * the editor to select. It bubbles.
 */
export const GOTO_EVENT = 'drafter:goto';

export interface ScriptViewOptions {
  /** Resolves when Courier Prime is ready; the first render waits for it (technical design §6.1). */
  fontsReady?: Promise<unknown>;
  /** The clock for the manual-scroll guard. */
  now?: () => number;
}

export interface ScriptView {
  /** `<section class="drafter-script" aria-label="Script">`, appended to the container. */
  readonly element: HTMLElement;
  update(layout: Layout, template: Template): Promise<void>;
  reveal(blockIndex: number): void;
  destroy(): void;
}

/**
 * The Script pane's view: one labelled region in `container`, which holds the
 * pages. This is the shell of the view: it adds and removes the region, and
 * leaves it empty. Drawing the pages, reporting clicks, and following the
 * cursor are not in it yet.
 */
export function createScriptView(
  container: HTMLElement,
  _options: ScriptViewOptions = {},
): ScriptView {
  const element = container.ownerDocument.createElement('section');
  element.className = 'drafter-script';
  element.setAttribute('aria-label', 'Script');
  container.append(element);
  return {
    element,
    async update() {},
    reveal() {},
    destroy() {
      element.remove();
    },
  };
}
