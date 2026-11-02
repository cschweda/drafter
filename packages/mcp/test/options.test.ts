import { DEFAULT_WORDS_PER_MINUTE } from '@drafter/outline';
import { describe, expect, it } from 'vitest';
import { parseOptions } from '../src/options';

const posix = { home: '/home/sam', platform: 'linux' as const };
const windows = { home: 'C:\\Users\\sam', platform: 'win32' as const };

describe('parseOptions', () => {
  it('folders, notes, boneyard, and the pace are read', () => {
    expect(
      parseOptions(
        [
          '--folder',
          '/w/Scripts',
          '--folder=/w/Plays',
          '--notes',
          '--boneyard',
          '--words-per-minute',
          '180',
        ],
        posix,
      ),
    ).toEqual({
      folders: ['/w/Scripts', '/w/Plays'],
      notes: true,
      boneyard: true,
      wordsPerMinute: 180,
    });
    expect(parseOptions(['--folder', 'C:\\Users\\sam\\Scripts'], windows)).toEqual({
      folders: ['C:\\Users\\sam\\Scripts'],
      notes: false,
      boneyard: false,
      wordsPerMinute: DEFAULT_WORDS_PER_MINUTE,
    });
  });

  it('~/ and ~\\ are the home folder', () => {
    const folders = (argv: string[], env: typeof posix | typeof windows) => {
      const options = parseOptions(argv, env);
      return 'folders' in options ? options.folders : options;
    };
    expect(folders(['--folder', '~/Scripts', '--folder', '~'], posix)).toEqual([
      '/home/sam/Scripts',
      '/home/sam',
    ]);
    expect(folders(['--folder', '~/Scripts/Signal Hill'], windows)).toEqual([
      'C:\\Users\\sam\\Scripts\\Signal Hill',
    ]);
    expect(folders(['--folder', '~\\Scripts'], windows)).toEqual(['C:\\Users\\sam\\Scripts']);
    // On macOS and Linux a backslash is part of a name, so ~\ is not the home folder.
    expect(folders(['--folder', '~\\Scripts'], posix)).toEqual(['~\\Scripts']);
    // Only a leading ~ is the home folder.
    expect(folders(['--folder', '/w/~/Scripts'], posix)).toEqual(['/w/~/Scripts']);
  });

  it('no folder refuses to start', () => {
    const error = { error: 'Give at least one folder: --folder <path>.' };
    expect(parseOptions([], posix)).toEqual(error);
    expect(parseOptions(['--notes'], posix)).toEqual(error);
    expect(parseOptions(['--folder'], posix)).toEqual(error);
    expect(parseOptions(['--folder', ''], posix)).toEqual(error);
  });

  it('an unknown option refuses', () => {
    expect(parseOptions(['--folder', '/w', '--write'], posix)).toEqual({
      error: 'Unknown option: --write.',
    });
    expect(parseOptions(['--folder', '/w', 'extra'], posix)).toEqual({
      error: 'Unknown option: extra.',
    });
    expect(parseOptions(['--folder', '/w', '--notes=yes'], posix)).toEqual({
      error: '--notes takes no value.',
    });
  });

  it('the pace is 60 to 400', () => {
    const pace = (value: string) =>
      parseOptions(['--folder', '/w', '--words-per-minute', value], posix);
    const error = { error: '--words-per-minute is a whole number from 60 to 400.' };
    expect(pace('60')).toMatchObject({ wordsPerMinute: 60 });
    expect(pace('400')).toMatchObject({ wordsPerMinute: 400 });
    for (const bad of ['59', '401', '150.5', '1e2', '', ' 150', 'fast', '-100'])
      expect(pace(bad)).toEqual(error);
    expect(parseOptions(['--folder', '/w', '--words-per-minute'], posix)).toEqual(error);
  });

  it('--version and --help are answered', () => {
    expect(parseOptions(['--version'], posix)).toEqual({ version: true });
    expect(parseOptions(['--help'], posix)).toEqual({ help: true });
    expect(parseOptions(['--folder', '/w', '--help'], posix)).toEqual({ help: true });
  });

  it('at most 32 folders', () => {
    const argv = Array.from({ length: 33 }, (_, i) => ['--folder', `/w/${i}`]).flat();
    expect(parseOptions(argv, posix)).toEqual({ error: 'Give at most 32 folders.' });
    expect(parseOptions(argv.slice(2), posix)).toMatchObject({ notes: false });
  });
});
