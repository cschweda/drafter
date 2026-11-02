import type { MapOptions, MapStatus } from '@drafter/story-map';
import { ref } from 'vue';
import { useGuard } from '../storage/guard';
import type { Project } from '../storage/projects';
import { useScript } from '../storage/script';

/**
 * The story map's own choices for a script (story-map design §7, Call 19): the status, the line
 * under the writer's name, the page's explaining sentence, what goes in, and the contact. They are
 * the script's export settings, kept on its project in this browser like the export options, never
 * in the text; what is about the text is in the text (`Logline:`, `[[Quote]]`), and what should
 * travel is in the metadata block (`storyMap`: the hooks and the planned length).
 */
export interface StoryMapProjectOptions {
  /** Null: from the gaps (design §6.4), each time. */
  status: MapStatus | null;
  greeting: string;
  /** Null: the explaining line is hidden. */
  explain: string | null;
  include: MapOptions['include'];
  /** Null: the title page's `Contact`. */
  contact: string | null;
}

/** The line under the writer's name, and the page's explaining line (Global Constraints). */
export const DEFAULT_GREETING = "What I'm writing";
export const DEFAULT_EXPLAIN =
  'A picture of my script: its shape, its people, and every scene in order. Just scroll.';
/** The plain line above the dialog's button (Global Constraints), verbatim. */
export const STORY_MAP_PRIVACY =
  'This page includes a few lines of dialogue and a one-line summary of each scene. Notes are never included.';

/** The longest line kept: a greeting, an explaining sentence, or a contact. */
const LONGEST = 200;

export const STORY_MAP_DEFAULTS: Readonly<StoryMapProjectOptions> = Object.freeze({
  status: null,
  greeting: DEFAULT_GREETING,
  explain: DEFAULT_EXPLAIN,
  include: Object.freeze({ summaries: true, lines: true, threads: true, contact: false }),
  contact: null,
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isLine = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= LONGEST;

/** The project's story-map choices, each missing or unknown value read as its default. */
export function storyMapOptionsOf(
  project: Pick<Project, 'storyMap'> | null | undefined,
): StoryMapProjectOptions {
  const kept: unknown = project?.storyMap;
  const stored = isRecord(kept) ? kept : {};
  const include = isRecord(stored.include) ? stored.include : {};
  const flag = (key: keyof MapOptions['include']) =>
    typeof include[key] === 'boolean' ? (include[key] as boolean) : STORY_MAP_DEFAULTS.include[key];
  return {
    status: stored.status === 'in-progress' || stored.status === 'finished' ? stored.status : null,
    greeting: isLine(stored.greeting) ? stored.greeting : DEFAULT_GREETING,
    explain:
      stored.explain === null ? null : isLine(stored.explain) ? stored.explain : DEFAULT_EXPLAIN,
    include: {
      summaries: flag('summaries'),
      lines: flag('lines'),
      threads: flag('threads'),
      contact: flag('contact'),
    },
    contact: isLine(stored.contact) ? stored.contact : null,
  };
}

/** Keeps choices on the open script's project, over what it kept (no-op in a read-only tab). */
export async function setStoryMapOptions(next: Partial<StoryMapProjectOptions>): Promise<void> {
  const script = useScript();
  if (!script.project.value || useGuard().readOnly.value) return;
  await script.keepOnProject((project) => ({
    storyMap: { ...storyMapOptionsOf(project), ...next },
  }));
}

/** The Make a story map dialog is open. */
export const storyMapOpen = ref(false);
