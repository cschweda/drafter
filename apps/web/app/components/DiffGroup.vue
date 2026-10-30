<script setup lang="ts">
import { type DiffRow, type Piece, pairRows, type RowGroup, type WordPart } from '@drafter/compare';
import { groupTitle } from '~/compare/rows';
import type { DocumentKind } from '~/markdown/kind';

// One group of the Changes view (version-history design §5.2): a scene's rows (a Markdown
// document's heading's), under a header with its heading (an `h3`, so heading navigation moves
// group to group), its tag (New scene, Deleted scene, Renamed), its counts, Go to scene, and a
// toggle that hides and shows its rows. Its rows are drawn only while it is open; a large group,
// or one past the view's row budget, starts closed and says so. Unchanged stretches fold behind "Show 40 unchanged lines". Unified,
// or side by side as a table with Before and After columns (§5.5).

const props = defineProps<{
  group: RowGroup;
  /** Its place among the shown groups, for ids. */
  index: number;
  /** The view's own prefix for ids, so two views on one page never share one. */
  idPrefix: string;
  rows: readonly DiffRow[];
  pieces: readonly Piece[];
  open: boolean;
  /**
   * Why it started closed, which its body says while it is: more changed lines than `LARGE_GROUP`,
   * or past the view's row budget (`openGroups`). Null: it started open.
   */
  closedWhy: 'large' | 'waiting' | null;
  layout: 'unified' | 'split';
  labels: { before: string; after: string };
  kind: DocumentKind;
  /** Each change's first row. */
  firstRows: ReadonlySet<number>;
  wordsOf: (row: number) => WordPart[] | null;
}>();

const emit = defineEmits<{ toggle: []; openFold: [piece: number]; go: [] }>();

const TAGS = { new: 'New scene', deleted: 'Deleted scene', renamed: 'Renamed' } as const;
const tag = computed(() => {
  const t = props.group.tag;
  if (t !== 'new' && t !== 'deleted' && t !== 'renamed') return null;
  // A Markdown document's groups are its sections.
  return props.kind === 'markdown' ? TAGS[t].replace('scene', 'section') : TAGS[t];
});
const title = computed(() => groupTitle(props.group, props.kind));
const changed = computed(() => props.group.added + props.group.removed);
const titleId = computed(() => `${props.idPrefix}-group-${props.index}`);
const bodyId = computed(() => `${titleId.value}-rows`);
const counts = computed(() => {
  const { added, removed } = props.group;
  const parts = [];
  const lines = (n: number) => `${n} ${n === 1 ? 'line' : 'lines'}`;
  if (added > 0) parts.push(`${lines(added)} added`);
  if (removed > 0) parts.push(added > 0 ? `${removed} removed` : `${lines(removed)} removed`);
  return parts.join(', ');
});

/** A fold's button: "Show 40 unchanged lines". */
const foldName = (piece: Piece) => {
  const n = piece.to - piece.from;
  return `Show ${n.toLocaleString('en-US')} unchanged ${n === 1 ? 'line' : 'lines'}`;
};

/** The pieces' rows side by side, a list per piece (folds stay folds). */
const split = computed(() =>
  props.layout === 'split' && props.open
    ? props.pieces.map((piece) =>
        piece.kind === 'rows' ? pairRows(props.rows, piece.from, piece.to) : null,
      )
    : [],
);
</script>

<template>
  <section class="diff-group" :aria-labelledby="titleId">
    <header class="diff-group-header">
      <!-- Named "EXT. ROOF - NIGHT, Deleted scene": a hidden comma would be read with a space before it. -->
      <h3
        :id="titleId"
        class="diff-group-title"
        tabindex="-1"
        :aria-label="tag ? `${title}, ${tag}` : undefined"
      >
        <span class="diff-heading">{{ title }}</span>
        <span v-if="tag" class="diff-tag">{{ tag }}</span>
      </h3>
      <span class="diff-counts">
        <span class="drafter-sr-only">{{ counts }}</span>
        <span v-if="group.added > 0" class="diff-count-add" aria-hidden="true"
          >+{{ group.added }}</span
        >
        <span v-if="group.removed > 0" class="diff-count-del" aria-hidden="true"
          >−{{ group.removed }}</span
        >
      </span>
      <button
        type="button"
        class="diff-button"
        :aria-describedby="titleId"
        @click="emit('go')"
      >
        {{ kind === 'markdown' ? 'Go to heading' : 'Go to scene' }}
      </button>
      <button
        type="button"
        class="diff-button"
        :aria-expanded="open ? 'true' : 'false'"
        :aria-controls="bodyId"
        :aria-describedby="titleId"
        @click="emit('toggle')"
      >
        {{ open ? 'Hide lines' : 'Show lines' }}
      </button>
    </header>
    <div :id="bodyId" class="diff-group-body">
      <p v-if="!open && closedWhy" class="diff-large">
        {{
          closedWhy === 'large'
            ? `Large change: ${changed.toLocaleString('en-US')} lines.`
            : `${changed.toLocaleString('en-US')} ${changed === 1 ? 'line' : 'lines'} changed, closed so the view opens quickly.`
        }}
        <button type="button" class="diff-button" :aria-describedby="titleId" @click="emit('toggle')">Show</button>
      </p>
      <template v-else-if="open && layout === 'unified'">
        <template v-for="(piece, p) in pieces" :key="`${piece.kind}-${piece.from}`">
          <button
            v-if="piece.kind === 'fold'"
            type="button"
            class="diff-fold"
            @click="emit('openFold', p)"
          >
            {{ foldName(piece) }}
          </button>
          <template v-else>
            <DiffRow
              v-for="r in piece.to - piece.from"
              :key="piece.from + r - 1"
              :row="rows[piece.from + r - 1] as DiffRow"
              :index="piece.from + r - 1"
              :words="wordsOf(piece.from + r - 1)"
              :first="firstRows.has(piece.from + r - 1)"
            />
          </template>
        </template>
      </template>
      <table v-else-if="open" class="diff-split">
        <thead>
          <tr>
            <th scope="col">Before <span class="diff-version">{{ labels.before }}</span></th>
            <th scope="col">After <span class="diff-version">{{ labels.after }}</span></th>
          </tr>
        </thead>
        <tbody>
          <template v-for="(piece, p) in pieces" :key="`${piece.kind}-${piece.from}`">
            <tr v-if="piece.kind === 'fold'">
              <td colspan="2" class="diff-fold-cell">
                <button type="button" class="diff-fold" @click="emit('openFold', p)">
                  {{ foldName(piece) }}
                </button>
              </td>
            </tr>
            <template v-else>
              <tr v-for="(pair, k) in split[p] ?? []" :key="k">
                <template v-for="side in (['left', 'right'] as const)" :key="side">
                  <td v-if="pair[side] === null" class="diff-cell empty" />
                  <DiffRow
                    v-else
                    :row="rows[pair[side] as number] as DiffRow"
                    :index="pair[side] as number"
                    :words="wordsOf(pair[side] as number)"
                    :first="firstRows.has(pair[side] as number)"
                    :side="side === 'left' ? 'old' : 'new'"
                  />
                </template>
              </tr>
            </template>
          </template>
        </tbody>
      </table>
    </div>
  </section>
</template>
