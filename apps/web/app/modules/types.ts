import type { Doc, TextChange } from '@drafter/fountain';
import type { Layout } from '@drafter/layout';
import type { Template } from '@drafter/templates';
import type { Component } from 'vue';
import type { Command } from '../commands/registry';
import type { DocumentKind } from '../markdown/kind';

// A script module is an optional feature compiled into the app: Drafter's own code, never
// something downloaded when the app runs (Phase 1 design §5.8). A module reads the script and
// hands back edits and problems, the shape technical design §14 sketches, so a sandboxed
// third-party API could one day offer the same.

/** What a module is, found in `modules/<id>/index.ts` as its default export. */
export interface ScriptModule {
  /** Lowercase letters, digits, and single hyphens: `script-doctor`. It names the module's storage and its tabs. */
  id: string;
  /** `Script Doctor`. The palette groups the module's commands under it, and Problems labels its items with it. */
  name: string;
  /** One plain sentence, shown in Settings → Modules. */
  description: string;
  /** An `i-lucide-*` name; icons are bundled into the build, as every icon is. */
  icon: string;
  /** What turning it on allows. Shown, and agreed to, before the module is enabled. */
  permissions: { network?: readonly string[] /* origins, e.g. 'https://api.anthropic.com' */ };
  /** The module's round toolbar button. */
  action?: { label: string; run(ctx: ModuleContext): void | Promise<void> };
  /**
   * A tab beside Source, Script, and Problems, shown in either pane. The component is given the
   * module's context as its `context` prop.
   */
  tab?: { id: string; label: string; component: Component };
  /** Commands for the palette. The host lists them under the module's name; their keys are not bound. */
  commands?(ctx: ModuleContext): readonly Command[];
  /**
   * Its section in Settings → Modules, shown while it's on (where a key would be entered). The
   * component is given the module's context as its `context` prop.
   */
  settings?: Component;
}

/** Something a module found in the script: listed in the Problems pane under the module's name. */
export interface ModuleProblem {
  message: string;
  from: number;
  to: number;
  severity: 'info' | 'warning';
  fix?: { title: string; changes: TextChange[] };
}

export interface ModuleContext {
  // Read-only views of the script
  source(): string;
  /** The Fountain parse. A Markdown document has no Fountain: this is an empty `Doc`. */
  doc(): Doc;
  /**
   * The pages, or null before the first layout and for a Markdown document, which has none. It is
   * made in a worker, so it can lag `doc()` by a moment after an edit: a module that pairs
   * `layout().index` with `doc().blocks` should check that they are the same length. (When another
   * script is opened the old script's layout is not offered: this is null until the new one's comes.)
   */
  layout(): Layout | null;
  /** True when the pages couldn't be made (the layout worker failed) and none has come since. */
  layoutFailed(): boolean;
  template(): Template;
  title(): string;
  /** What the script is: Fountain, or plain Markdown. */
  kind(): DocumentKind;
  /** The offset of the cursor (the head of the main selection). */
  cursor(): number;
  /**
   * One undoable change, through the editor. It throws if a change lies outside the text or two
   * overlap. It returns false, changing nothing, when the script can't be edited now, when another
   * script has been opened or the module turned off since the run began, or, in a run, when the
   * text has been edited since the run began (apart from by this run's own earlier changes).
   */
  applyChanges(changes: readonly TextChange[]): boolean;
  /**
   * Replaces this module's items in the Problems pane, labeled with the module's name; they don't
   * count toward the problem total. Returns false, doing nothing, once another script has been
   * opened or the module turned off since the run began. A fix whose changes don't fit the text
   * (positions outside it, backwards, or overlapping) is dropped and its item kept; in a run, every
   * fix is dropped once the text has been edited since the run began.
   */
  setProblems(items: readonly ModuleProblem[]): boolean;
  goto(offset: number): void;
  /**
   * Asks the writer a yes-or-no question in Drafter's own modal dialog, headed with the module's
   * name: Cancel (or `cancelLabel`) has focus first, and Escape is No. Resolves true only for a Yes.
   * It resolves false at once if the script has been replaced or the module turned off, and also
   * when that happens while the question is open. Ask only in response to the writer's action
   * (a button or a command), and say what will happen and how many things it touches.
   */
  confirm(
    message: string,
    options?: { confirmLabel?: string; cancelLabel?: string },
  ): Promise<boolean>;
  /**
   * Shows this module's tab (the one `tab` describes) and moves focus into it, so call it in
   * response to the writer's action (a button or a command), not on your own: in the pane that
   * isn't showing Source on a wide screen, in place of the current tab on a phone. Does nothing
   * for a module with no tab, or once another script has been opened or the module turned off.
   */
  openTab(): void;
  /**
   * This module's own storage in the settings table (`module:<id>:<key>`), kept in this browser
   * and never written to the script.
   */
  storage: {
    get<T>(key: string): Promise<T | undefined>;
    set<T>(key: string, value: T): Promise<void>;
    remove(key: string): Promise<void>;
  };
  /** A toast and a polite announcement. */
  notify(message: string): void;
}
