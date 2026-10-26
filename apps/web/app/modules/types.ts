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
  /** The pages, or null before the first layout and for a Markdown document, which has none. */
  layout(): Layout | null;
  template(): Template;
  title(): string;
  /** What the script is: Fountain, or plain Markdown. */
  kind(): DocumentKind;
  /** The offset of the cursor (the head of the main selection). */
  cursor(): number;
  /** One undoable change, through the editor. It throws if a change lies outside the text or two overlap. */
  applyChanges(changes: readonly TextChange[]): void;
  /**
   * Replaces this module's items in the Problems pane, labeled with the module's name; they don't
   * count toward the problem total.
   */
  setProblems(items: readonly ModuleProblem[]): void;
  goto(offset: number): void;
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
