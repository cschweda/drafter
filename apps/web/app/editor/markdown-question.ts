import { ref } from 'vue';

/**
 * The question "make this a Markdown document?" while it waits for an answer; the dialog shows it
 * and calls `answer`. Null when nothing is being asked. Turning a Fountain script into Markdown
 * stops Fountain's formatting, keys, and checks, and undo does not bring them back, so it asks.
 */
export const markdownQuestion = ref<{ answer(ok: boolean): void } | null>(null);

/** Asks, and resolves true if the writer agrees. A second ask while one is open joins it. */
export function askToUseMarkdown(): Promise<boolean> {
  return new Promise((resolve) => {
    const earlier = markdownQuestion.value;
    markdownQuestion.value = {
      answer(ok) {
        markdownQuestion.value = null;
        earlier?.answer(ok);
        resolve(ok);
      },
    };
  });
}
