// The Outline's keys (Phase 2 design §6.1): the ARIA tree pattern, as pure functions of the rows
// that are showing, in order. Up and Down move; Right opens a closed section, then goes to its
// first child; Left closes an open section, then goes to the parent; Home and End; and typing
// goes to the next row whose label starts with what was typed.

export interface TreeRow {
  id: string;
  /** 1 at the top. */
  level: number;
  parent: string | null;
  /** A section, which opens and closes. */
  expandable: boolean;
  open: boolean;
  /** What type-ahead matches: the heading or the section's title. */
  label: string;
}

export type TreeAction = { focus: string } | { toggle: string };

/** What `key` does on the row `focused`, or null when it does nothing there. */
export function treeKey(rows: readonly TreeRow[], focused: string, key: string): TreeAction | null {
  const at = rows.findIndex((row) => row.id === focused);
  const row = rows[at];
  if (!row) return rows[0] ? { focus: rows[0].id } : null;
  const to = (other: TreeRow | undefined): TreeAction | null =>
    other && other.id !== focused ? { focus: other.id } : null;
  switch (key) {
    case 'ArrowDown':
      return to(rows[at + 1]);
    case 'ArrowUp':
      return to(rows[at - 1]);
    case 'Home':
      return to(rows[0]);
    case 'End':
      return to(rows[rows.length - 1]);
    case 'ArrowRight': {
      if (!row.expandable) return null;
      if (!row.open) return { toggle: row.id };
      const child = rows[at + 1];
      return child?.parent === row.id ? { focus: child.id } : null;
    }
    case 'ArrowLeft':
      if (row.expandable && row.open) return { toggle: row.id };
      return row.parent ? { focus: row.parent } : null;
    default:
      return null;
  }
}

/** The next row after `focused`, going round, whose label starts with `typed` (any case). */
export function typeAhead(rows: readonly TreeRow[], focused: string, typed: string): string | null {
  const wanted = typed.toLowerCase();
  const at = rows.findIndex((row) => row.id === focused);
  for (let step = 1; step <= rows.length; step++) {
    const row = rows[(at + step) % rows.length];
    if (row?.label.toLowerCase().startsWith(wanted)) return row.id;
  }
  return null;
}
