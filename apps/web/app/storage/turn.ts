import { type Ref, watch } from 'vue';

/** Resolves once no switch of scripts is under way (`busy`, from the script session). */
export function whenIdle(busy: Readonly<Ref<boolean>>): Promise<void> {
  if (!busy.value) return Promise.resolve();
  return new Promise((resolve) => {
    const stop = watch(busy, (on) => {
      if (on) return;
      stop();
      resolve();
    });
  });
}

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
