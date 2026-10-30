import { describe, expect, test } from 'vitest';
import { nextTick, ref } from 'vue';
import { noticeWhileOpen, outlineNotice, sayOutline } from '../app/outline/notice';

// A dialog's status line (History, History of this scene) shows what was said while it is open,
// never a message said before it opened, such as "Took a snapshot labeled …".

describe('noticeWhileOpen', () => {
  test('shows only what is said after the dialog opens', async () => {
    const open = ref(false);
    const shown = noticeWhileOpen(() => open.value);
    await sayOutline('Took a snapshot labeled Draft two.');
    await nextTick();
    expect(outlineNotice.value).toBe('Took a snapshot labeled Draft two.');
    expect(shown.value).toBe('');

    open.value = true;
    await nextTick();
    expect(shown.value).toBe('');

    await sayOutline('Copied the text of INT. HALL - DAY from 10:42 AM.');
    await nextTick();
    expect(shown.value).toBe('Copied the text of INT. HALL - DAY from 10:42 AM.');

    // Closed and opened again: what was said last time isn't shown.
    open.value = false;
    await nextTick();
    open.value = true;
    await nextTick();
    expect(shown.value).toBe('');
  });
});
