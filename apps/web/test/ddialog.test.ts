// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import * as vue from 'vue';
import { compileScript, parse } from 'vue/compiler-sfc';

// DDialog, mounted (fresh-look Task 7 review): where focus goes when the dialog closes. The test
// config stubs `.vue` files, so the component is compiled here from its source, as Vite would.

type DialogRef = { showModal(): void; close(): void };

function loadDDialog(): vue.Component {
  const path = join(import.meta.dirname, '../app/components/ui/DDialog.vue');
  const { descriptor } = parse(readFileSync(path, 'utf8'), { filename: path });
  const script = compileScript(descriptor, { id: 'ddialog', inlineTemplate: true });
  const js = ts.transpileModule(script.content, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} as { default?: vue.Component } };
  const require = (id: string) => {
    if (id === 'vue') return vue;
    throw new Error(`DDialog imports ${id}, which this test doesn't provide`);
  };
  new Function('require', 'module', 'exports', js)(require, module, module.exports);
  if (!module.exports.default) throw new Error('DDialog has no default export');
  return module.exports.default;
}

const DDialog = loadDDialog();

/** jsdom has no top layer: opening sets `open`, closing clears it and says so, as a browser does. */
function stubDialogs() {
  const proto = HTMLDialogElement.prototype;
  proto.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  proto.close = function (this: HTMLDialogElement) {
    if (!this.open) return;
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
}

/** jsdom lays nothing out; an element is drawn when it and its ancestors aren't `hidden`. */
const realRects = Element.prototype.getClientRects;
function stubLayout() {
  Element.prototype.getClientRects = function (this: Element) {
    const drawn = this.isConnected && !this.closest('[hidden]');
    return (drawn ? [new DOMRect(0, 0, 10, 10)] : []) as unknown as DOMRectList;
  };
}

/** A tick past the dialog's own close handling (it waits a turn for the caller's listeners). */
const afterClose = () => new Promise((resolve) => setTimeout(resolve, 0));

let app: vue.App | null = null;

function mount(props: Record<string, unknown> = {}) {
  const dialog = vue.ref<DialogRef>();
  const host = document.createElement('div');
  document.body.append(host);
  app = vue.createApp({
    render: () =>
      vue.h(DDialog, { ref: dialog, ...props }, () => vue.h('button', { id: 'inside' }, 'OK')),
  });
  app.mount(host);
  if (!dialog.value) throw new Error('DDialog did not mount');
  return dialog.value;
}

function button(id: string, parent: HTMLElement = document.body) {
  const el = document.createElement('button');
  el.id = id;
  parent.append(el);
  return el;
}

beforeEach(() => {
  document.body.innerHTML = '';
  stubDialogs();
  stubLayout();
});

afterEach(() => {
  app?.unmount();
  app = null;
  Element.prototype.getClientRects = realRects;
});

describe('DDialog, when it closes', () => {
  test('gives focus back to what opened it', async () => {
    const opener = button('opener');
    const dialog = mount();
    opener.focus();
    dialog.showModal();
    document.getElementById('inside')?.focus();
    dialog.close();
    // The browser's own return of focus isn't in jsdom, so this is the dialog's doing.
    await afterClose();
    expect(document.activeElement).toBe(opener);
  });

  test('gives focus to the fallback when what opened it is gone', async () => {
    const fallback = button('fallback');
    const opener = button('opener');
    const dialog = mount({ fallback: '#fallback' });
    opener.focus();
    dialog.showModal();
    document.getElementById('inside')?.focus();
    opener.remove();
    dialog.close();
    await afterClose();
    expect(document.activeElement).toBe(fallback);
  });

  test('falls back to the editor, then the Drafter menu, when nothing opened it', async () => {
    const menu = button('menu');
    menu.dataset.tour = 'menu';
    const dialog = mount();
    dialog.showModal();
    dialog.close();
    await afterClose();
    expect(document.activeElement).toBe(menu);

    const editor = document.createElement('div');
    editor.className = 'cm-content';
    editor.tabIndex = 0;
    document.body.append(editor);
    menu.blur();
    dialog.showModal();
    dialog.close();
    await afterClose();
    expect(document.activeElement).toBe(editor);
  });

  test('skips an opener that is hidden', async () => {
    const fallback = button('fallback');
    const box = document.createElement('div');
    document.body.append(box);
    const opener = button('opener', box);
    const dialog = mount({ fallback: '#fallback' });
    opener.focus();
    dialog.showModal();
    box.hidden = true;
    opener.blur();
    dialog.close();
    await afterClose();
    expect(document.activeElement).toBe(fallback);
  });

  test("doesn't give focus back to a menu's row, which is on its way out", async () => {
    // A quick Escape: the browser puts focus back on the row before the closing menu removes it.
    const fallback = button('fallback');
    const menu = document.createElement('div');
    menu.setAttribute('role', 'menu');
    document.body.append(menu);
    const row = button('row', menu);
    row.setAttribute('role', 'menuitem');
    const dialog = mount({ fallback: '#fallback' });
    row.focus();
    dialog.showModal();
    document.getElementById('inside')?.focus();
    dialog.close();
    row.focus();
    await afterClose();
    expect(document.activeElement).toBe(fallback);
  });

  test('leaves focus on the row of a menu opened since it closed (phone shell:821)', async () => {
    // Settings, opened from the Drafter menu, closes; More opens at once and its first row takes
    // focus before the dialog's own turn comes. That row isn't the one that opened the dialog.
    button('fallback');
    const drafterMenu = document.createElement('div');
    drafterMenu.setAttribute('role', 'menu');
    document.body.append(drafterMenu);
    const opener = button('settings', drafterMenu);
    opener.setAttribute('role', 'menuitem');
    const dialog = mount({ fallback: '#fallback' });
    opener.focus();
    dialog.showModal();
    document.getElementById('inside')?.focus();
    drafterMenu.remove();
    dialog.close();
    const more = document.createElement('div');
    more.setAttribute('role', 'menu');
    document.body.append(more);
    const row = button('cards', more);
    row.setAttribute('role', 'menuitem');
    row.focus();
    await afterClose();
    expect(document.activeElement).toBe(row);
  });

  test('passes over a fallback that cannot take focus (a disabled button)', async () => {
    const fallback = button('fallback');
    fallback.disabled = true;
    const menu = button('menu');
    menu.dataset.tour = 'menu';
    const dialog = mount({ fallback: '#fallback' });
    dialog.showModal();
    dialog.close();
    await afterClose();
    expect(document.activeElement).toBe(menu);
  });

  test('leaves focus alone when a close handler has moved it', async () => {
    button('fallback');
    const opener = button('opener');
    const elsewhere = button('elsewhere');
    const dialog = mount({ fallback: '#fallback', onClose: () => elsewhere.focus() });
    opener.focus();
    dialog.showModal();
    document.getElementById('inside')?.focus();
    dialog.close();
    await afterClose();
    expect(document.activeElement).toBe(elsewhere);
  });
});
