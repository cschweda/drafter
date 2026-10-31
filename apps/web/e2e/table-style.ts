import { expect, type Locator } from '@playwright/test';

// The one table style (fresh-look design §5): 36px rows on --surface with hairline dividers, a
// sticky header, numbers right-aligned in tabular figures, and links underlined on hover only.

/**
 * Expects `table` to be drawn in the table style. A row is 36px, or taller where a narrow screen
 * wraps its words (`wraps`).
 */
export async function expectTableStyle(table: Locator, { wraps = false } = {}) {
  const drawn = await table.evaluate((el) => {
    const first = (selector: string) => el.querySelector(selector) as HTMLElement | null;
    const row = first('tbody tr');
    const head = first('thead th');
    const num = first('tbody .num');
    const link = first('tbody a');
    const cell = first('tbody td, tbody th');
    return {
      table: el.classList.contains('d-table'),
      row: row ? Math.round(row.getBoundingClientRect().height) : 0,
      sticky: head ? getComputedStyle(head).position : '',
      numbers: num ? getComputedStyle(num).fontVariantNumeric : '',
      align: num ? getComputedStyle(num).textAlign : '',
      link: link ? getComputedStyle(link).textDecorationLine : 'none',
      divider: cell ? getComputedStyle(cell).borderBottomWidth : '',
    };
  });
  const { row, ...rest } = drawn;
  if (wraps) expect(row).toBeGreaterThanOrEqual(36);
  else expect(row).toBe(36);
  expect(rest).toEqual({
    table: true,
    sticky: 'sticky',
    numbers: 'tabular-nums',
    align: 'right',
    link: 'none',
    divider: '1px',
  });
}
