import { nextTick, type Ref } from 'vue';

/**
 * Sets a message the status bar announces (a `role="alert"` that is there while the message is).
 * A screen reader announces an alert when it appears, so the same message again has to appear
 * again: the text is cleared, drawn empty, and then set. Vue draws only the last value of a ref
 * set twice in one tick, which is why this waits for the empty text to be drawn.
 * Resolves once the message is set.
 */
export async function say(target: Ref<string>, message: string): Promise<void> {
  target.value = '';
  await nextTick();
  target.value = message;
}

/**
 * Like `say`, for a toast: the message is set the same way, and empties after `ms`. Returns the
 * function that sets it; a newer message restarts the wait.
 */
export function timedSay(target: Ref<string>, ms: number): (message: string) => Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return async (message) => {
    clearTimeout(timer);
    await say(target, message);
    timer = setTimeout(() => {
      target.value = '';
    }, ms);
  };
}
