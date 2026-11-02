// The pieces every tool's input is made of (§7.7): strict objects, every string with a maximum
// length, every number a whole number in a range, every list with a maximum length.
import * as z from 'zod/v4';
import { MAX_PATH_CHARS } from '../paths';

/** A path starting with one of the writer's folders. */
export const path = z.string().min(1).max(MAX_PATH_CHARS);
/** Plain words to find. */
export const words = z.string().min(1).max(200);
/** A scene: its place in order, its written number, or words from its heading. */
export const sceneRef = z.string().min(1).max(200);
/** A cursor from an earlier page. */
export const cursor = z.string().min(1).max(2_048);
/** What to show that is left out by default. */
export const include = z.array(z.enum(['notes', 'boneyard'])).max(2);

/** What a result says it left out. */
export const leftOut = z.object({
  notes: z.number().int().min(0),
  boneyard: z.number().int().min(0),
});

/** A file's kind, as its name says it. */
export const format = z.enum([
  'fountain',
  'text',
  'markdown',
  'fdx',
  'highland',
  'fadein',
  'html',
  'epub',
]);
