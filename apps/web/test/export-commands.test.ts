import { describe, expect, test } from 'vitest';
import type { When } from '../app/commands/behavior';
import { exportBehaviors } from '../app/commands/export-commands';
import { manuscriptOpen } from '../app/novel/manuscript';

function when(novel: boolean): When {
  return {
    hasScript: () => true,
    idle: () => true,
    canStart: () => true,
    isFountain: () => false,
    isMarkdown: () => true,
    isNovel: () => novel,
    exportsHere: () => true,
  };
}

describe('the manuscript’s export commands', () => {
  test('apply only to a novel', () => {
    for (const id of ['export-manuscript-pdf', 'export-manuscript-docx']) {
      expect(exportBehaviors(when(true))[id]?.enabled?.(), id).toBe(true);
      expect(exportBehaviors(when(false))[id]?.enabled?.(), id).toBe(false);
    }
  });

  test('open the manuscript dialog for their format', () => {
    const behaviors = exportBehaviors(when(true));
    manuscriptOpen.value = null;
    behaviors['export-manuscript-pdf']?.run();
    expect(manuscriptOpen.value).toBe('pdf');
    behaviors['export-manuscript-docx']?.run();
    expect(manuscriptOpen.value).toBe('docx');
    manuscriptOpen.value = null;
  });
});
