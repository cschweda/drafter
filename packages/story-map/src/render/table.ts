import { el, escapeHtml } from '@drafter/render-html-file';

/**
 * The text twin every chart has (design §10.7): a closed "Show as a table" disclosure holding the
 * chart's figures. The first cell of each row is its row header. Everything is escaped.
 */
export function chartTable(
  caption: string,
  head: readonly string[],
  rows: ReadonlyArray<readonly (string | number)[]>,
): string {
  const cell = (value: string | number) => escapeHtml(String(value));
  const thead = el(
    'thead',
    {},
    el('tr', {}, head.map((h) => el('th', { scope: 'col' }, cell(h))).join('')),
  );
  const tbody = el(
    'tbody',
    {},
    rows
      .map((row) =>
        el(
          'tr',
          {},
          row
            .map((value, i) =>
              i === 0 ? el('th', { scope: 'row' }, cell(value)) : el('td', {}, cell(value)),
            )
            .join(''),
        ),
      )
      .join(''),
  );
  return el(
    'details',
    { class: 'tbl' },
    el('summary', {}, 'Show as a table') +
      el('table', {}, el('caption', {}, cell(caption)) + thead + tbody),
  );
}

/** The fixed rules for the tables, once per page (the shape section carries them). */
export const TABLE_RULES = `.tbl{margin-top:12px;font-size:14px}
.tbl summary{cursor:pointer;font-family:var(--mono);font-size:12.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--mute);padding:6px 0;width:max-content;max-width:100%}
.tbl summary:hover{color:var(--fg)}
.tbl table{width:100%;border-collapse:collapse;margin-top:8px;table-layout:fixed}
.tbl caption{text-align:left;color:var(--mute);font-size:13px;padding-bottom:6px}
.tbl th,.tbl td{padding:5px 6px;border-bottom:1px solid var(--line);text-align:right;overflow-wrap:anywhere;font-weight:400}
.tbl th[scope=row],.tbl thead th:first-child{text-align:left}
.tbl thead th{font-family:var(--mono);font-size:11.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--mute);vertical-align:bottom}
.tbl tbody th{color:var(--fg)}`;
