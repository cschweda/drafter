import type { ExportKind } from '~/storage/export';
import type { Command } from './registry';

// What the built-in commands share (`builtin.ts`, and the groups kept in their own modules:
// `help-commands.ts`, `export-commands.ts`).

/** What a command does and when it applies; the rest of a `Command` is in `data.ts`. */
export type Behavior = Pick<Command, 'run' | 'enabled' | 'why'> & {
  /** A title that follows the script, in place of the data's: a stage play's Scene and Stage direction. */
  liveTitle?: () => string;
};

/** Runs `action`, leaving its failure to what it says itself (a toast, the status bar). */
export const quietly = (action: () => Promise<unknown>) => () => void action().catch(() => {});

/** When a command applies, as `registerBuiltinCommands` reads it from the open script and the tab. */
export interface When {
  hasScript(): boolean;
  /** A script is open, no switch is under way, and "Type here instead" isn't waiting. */
  idle(): boolean;
  /** Starting a script needs a tab that can edit, and no switch under way. */
  canStart(): boolean;
  /** Fountain's own commands, checks, and scenes mean nothing in a Markdown document. */
  isFountain(): boolean;
  isMarkdown(): boolean;
  /** A Markdown document that is a novel (`novel/kind.ts`): its manuscript exports apply. */
  isNovel(): boolean;
  /** Whether the open document exports as `kind` (`EXPORTS`). */
  exportsHere(kind: ExportKind): boolean;
}
