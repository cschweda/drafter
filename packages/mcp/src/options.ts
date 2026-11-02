// The command line: the folders the writer names, and the few switches beside them (§2.2).
import { posix, win32 } from 'node:path';
import { parseArgs } from 'node:util';
import { DEFAULT_WORDS_PER_MINUTE } from '@drafter/outline';

export interface Options {
  /** The folders, as given (a leading `~` made the home folder); resolveRoots checks them. */
  folders: string[];
  /** Include notes (`[[…]]`) without being asked each time. */
  notes: boolean;
  /** Include the boneyard (`/* … *\/`) the same way. */
  boneyard: boolean;
  /** The speaking pace for running times. */
  wordsPerMinute: number;
}

export const MAX_FOLDERS = 32;
export const PACE = { min: 60, max: 400 } as const;

export const NO_FOLDER = 'Give at least one folder: --folder <path>.';
export const TOO_MANY_FOLDERS = `Give at most ${MAX_FOLDERS} folders.`;
export const BAD_PACE = `--words-per-minute is a whole number from ${PACE.min} to ${PACE.max}.`;

export const USAGE = `Usage: drafter-mcp --folder <path> [--folder <path> …] [options]

Drafter for Claude lets an AI app read the scripts in the folders you name. It never writes,
moves, or deletes a file.

  --folder <path>           A folder it may read, with its subfolders. Repeat for more.
  --notes                   Include notes ([[…]]) in what it returns.
  --boneyard                Include the boneyard (/* … */) the same way.
  --words-per-minute <n>    The speaking pace for running times (${PACE.min} to ${PACE.max}; ${DEFAULT_WORDS_PER_MINUTE} if left out).
  --version                 Print the version.
  --help                    Print this.
`;

/** `~`, `~/x` (and `~\x` on Windows) with the home folder in place of the `~`. */
function expandHome(folder: string, home: string, platform: NodeJS.Platform): string {
  if (folder === '~') return home;
  const windows = platform === 'win32';
  if (folder.startsWith('~/') || (windows && folder.startsWith('~\\')))
    return (windows ? win32 : posix).join(home, folder.slice(2));
  return folder;
}

/** The option a parseArgs error names, from its message (`Unknown option '--x'`). */
function named(error: unknown): string {
  return /'([^']*)'/.exec((error as Error).message)?.[1] ?? String((error as Error).message);
}

/** The options, or what is wrong with them, or a request for the version or the usage. */
export function parseOptions(
  argv: readonly string[],
  env: { home: string; platform: NodeJS.Platform },
): Options | { error: string } | { version: true } | { help: true } {
  let values: {
    folder?: string[];
    notes?: boolean;
    boneyard?: boolean;
    'words-per-minute'?: string;
    version?: boolean;
    help?: boolean;
  };
  try {
    ({ values } = parseArgs({
      args: [...argv],
      strict: true,
      allowPositionals: false,
      options: {
        folder: { type: 'string', multiple: true },
        notes: { type: 'boolean' },
        boneyard: { type: 'boolean' },
        'words-per-minute': { type: 'string' },
        version: { type: 'boolean' },
        help: { type: 'boolean' },
      },
    }));
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === 'ERR_PARSE_ARGS_INVALID_OPTION_VALUE') {
      const option = named(error);
      // An option that takes a value was given none, or a switch was given one.
      if (option.startsWith('--words-per-minute')) return { error: BAD_PACE };
      if (option.startsWith('--folder')) return { error: NO_FOLDER };
      return { error: `${option} takes no value.` };
    }
    return { error: `Unknown option: ${named(error)}.` };
  }
  if (values.version === true) return { version: true };
  if (values.help === true) return { help: true };

  const given = values.folder ?? [];
  if (given.length === 0 || given.some((folder) => folder === '')) return { error: NO_FOLDER };
  if (given.length > MAX_FOLDERS) return { error: TOO_MANY_FOLDERS };

  let wordsPerMinute: number = DEFAULT_WORDS_PER_MINUTE;
  const pace = values['words-per-minute'];
  if (pace !== undefined) {
    if (!/^[0-9]+$/.test(pace)) return { error: BAD_PACE };
    wordsPerMinute = Number(pace);
    if (wordsPerMinute < PACE.min || wordsPerMinute > PACE.max) return { error: BAD_PACE };
  }

  return {
    folders: given.map((folder) => expandHome(folder, env.home, env.platform)),
    notes: values.notes === true,
    boneyard: values.boneyard === true,
    wordsPerMinute,
  };
}
