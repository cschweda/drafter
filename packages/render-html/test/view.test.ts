import * as api from '@drafter/render-html';
import { createScriptView, GOTO_EVENT } from '@drafter/render-html';
import { describe, expect, it } from 'vitest';

describe('the package', () => {
  it('exports the view, its click event, and speechRoles', () => {
    expect(Object.keys(api).sort()).toEqual(['GOTO_EVENT', 'createScriptView', 'speechRoles']);
    expect(GOTO_EVENT).toBe('drafter:goto');
  });
});

describe('createScriptView', () => {
  it('appends a labelled Script region to the container', () => {
    const container = document.createElement('div');
    container.append(document.createElement('p'));
    const view = createScriptView(container);
    expect(view.element.tagName).toBe('SECTION');
    expect(view.element.className).toBe('drafter-script');
    expect(view.element.getAttribute('aria-label')).toBe('Script');
    expect(container.lastElementChild).toBe(view.element);
  });

  it('removes its region when destroyed', () => {
    const container = document.createElement('div');
    const view = createScriptView(container);
    view.destroy();
    expect(container.children).toHaveLength(0);
    expect(view.element.isConnected).toBe(false);
  });
});
