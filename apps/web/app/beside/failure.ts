// What the app says when drafts or cuts couldn't be written beside the work: why, in plain words,
// and how to put it right. The desktop app's errors arrive as a code (`disk-full`,
// `not-allowed: a link`, …, apps/desktop/src/beside.ts); the browser's as a DOMException.

/** The message of an error, after whatever Electron puts before one from the main process. */
function messageOf(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/^Error invoking remote method '[^']*': (?:Error: )?/, '');
}

/** Why one write failed, and what to do: `[reason, fix]`. */
function explain(error: unknown, file: string): [string, string] {
  const name = error instanceof DOMException ? error.name : '';
  const message = messageOf(error);
  const code = /(?:^|: )(gone|not-allowed|disk-full|too-big|not-a-file|failed)(?::\s*(.*))?$/.exec(
    message,
  );
  const again =
    'Drafter tries again at the next save, draft or cut, or when you reopen the script.';
  if (name === 'QuotaExceededError' || code?.[1] === 'disk-full')
    return ['the disk is full', `Free some space. ${again}`];
  if (code?.[1] === 'not-allowed' && /\blink\b/.test(code[2] ?? ''))
    return [
      'a link is where Drafter would write',
      'Drafter never writes through a link. Put a real folder or file there, or remove the link, then reopen the script.',
    ];
  if (name === 'NotAllowedError' || name === 'SecurityError' || code?.[1] === 'not-allowed')
    return [
      'Drafter isn’t allowed to write in its folder any more',
      `Choose Keep next to ${file}… in the Drafts or Cuts list to allow it again.`,
    ];
  if (name === 'NotFoundError' || code?.[1] === 'gone')
    return ['its folder isn’t there any more', `Save the script somewhere again. ${again}`];
  if (code?.[1] === 'not-a-file')
    return ['something that isn’t a file is in the way', `Move it aside. ${again}`];
  const detail = code?.[1] === 'failed' ? code[2]?.trim() : '';
  return [`something went wrong${detail ? ` (${detail})` : ''}`, again];
}

/**
 * "Couldn’t write beside Boca.fountain: the disk is full. Free some space. …", for the first of
 * `errors`, naming the drafts not written (`drafts`) when there are some.
 */
export function besideFailure(
  file: string,
  errors: readonly unknown[],
  drafts: readonly string[] = [],
): string {
  const [reason, fix] = explain(errors[0], file);
  const missing = drafts.length > 0 ? ` Not written: ${drafts.join(', ')}.` : '';
  return `Couldn’t write beside ${file}: ${reason}.${missing} ${fix}`;
}
