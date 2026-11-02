// The tools (§3). Each one's code runs only in the reader worker (worker.ts); the server knows
// them by their names and schemas.
import type * as z from 'zod/v4';
import type { LoadCache } from '../cache';
import type { Include } from '../envelope';
import type { WorkerData } from '../pool';
import { listScripts } from './list';

export type ToolName =
  | 'list_scripts'
  | 'script_overview'
  | 'read_scene'
  | 'character_lines'
  | 'list_drafts'
  | 'compare_drafts'
  | 'list_cuts'
  | 'search_scripts'
  | 'story_map'
  | 'series_overview';

/** A parsed file, as the cache keeps it (load.ts gives it its shape). */
export type Loaded = unknown;

/** What a tool's code is given beside its arguments. */
export interface ToolContext {
  data: WorkerData;
  /** Parsed files, in this worker's memory only. */
  cache: LoadCache<Loaded>;
  /** What this call shows of notes and the boneyard: its own `include`, and `--notes`/`--boneyard`. */
  include(args: { include?: Include }): Include;
}

export interface ToolDef<I, O extends object> {
  name: ToolName;
  title: string;
  description: string;
  /** A strict object: unknown keys refused. */
  input: z.ZodType<I>;
  /** The answer's fields; the server puts `about` in front of them. */
  output: z.ZodObject;
  run(args: I, ctx: ToolContext): Promise<O>;
}

// biome-ignore lint/suspicious/noExplicitAny: each tool has its own argument and answer types.
export const TOOLS: ReadonlyArray<ToolDef<any, any>> = [listScripts];
