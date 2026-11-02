import type { Extension } from '@codemirror/state';

export interface ClassicOptions {
  /** Told what to announce to a screen reader, in a sentence. */
  say?: (text: string) => void;
}

/** Classic Mode: Enter and Tab typing over plain Fountain. Each part is added here as it is built. */
export function classic(_options: ClassicOptions = {}): Extension {
  return [];
}
