/**
 * One file operation at a time: a save, and a check for a file changed elsewhere. A second request
 * made while one is under way waits for it, so a check never reads a file between a save's write
 * and the record of it.
 */
let queue: Promise<unknown> = Promise.resolve();

export function inTurn<T>(run: () => Promise<T>): Promise<T> {
  const result = queue.then(run);
  queue = result.catch(() => {});
  return result;
}
