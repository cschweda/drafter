import type { DropdownMenuItem } from '@nuxt/ui';
import { computed } from 'vue';
import { useEditor } from './session';
import { DOCUMENT_TYPES, typeNameOf, unknownTemplateNote, unknownTemplateOf } from './template';
import { useTemplate } from './use-template';

/**
 * The template choice as a menu: the toolbar's chip and the app menu's Template section (the way a
 * phone chooses, where the chip is hidden) both show this list, so they agree. One checked item for
 * the template (or the Markdown document) the script is, in `DOCUMENT_TYPES` order; an item is off
 * when `canChooseType` says so (a tab that only shows the script, an unclosed `/*`); Markdown asks
 * first, and on a sample a type of the other kind opens that type's sample. A script whose template Drafter doesn't have is shown as a
 * screenplay: that item reads "(fallback)", and the list begins with a note saying what was asked for.
 *
 * `onPick` runs when an item is chosen, before it takes effect, so the menu can say where focus goes.
 */
export function useTemplateMenu(onPick: () => void) {
  const template = useTemplate();
  const { doc } = useEditor();
  /** The template the script asks for that Drafter doesn't have. */
  const unknown = computed(() =>
    template.kind.value === 'fountain' ? unknownTemplateOf(doc.value) : undefined,
  );
  /** The current type's name, "(fallback)" included: the chip's text and the status bar's. */
  const name = computed(() => typeNameOf(template.kind.value, template.id.value, !!unknown.value));
  const note = computed(() =>
    unknown.value === undefined ? '' : unknownTemplateNote(unknown.value),
  );

  const items = computed<DropdownMenuItem[]>(() =>
    DOCUMENT_TYPES.map((type) => {
      // While the template is unknown no item is checked: the chip says "(fallback)", and Screenplay is
      // an ordinary choice that replaces the name Drafter doesn't have.
      const checked = template.isCurrent(type);
      return {
        label: type.name,
        type: 'checkbox' as const,
        checked,
        disabled: !template.canChooseType(type),
        onSelect: () => {
          onPick();
          void template.chooseType(type);
        },
      };
    }),
  );

  /** The note as a menu item, or none: a label that wraps, since the sentence is long and a phone is narrow. */
  const noteItems = computed<DropdownMenuItem[]>(() =>
    note.value
      ? [
          {
            type: 'label',
            label: note.value,
            // Its width is the other items', so a long sentence wraps to the menu and does not widen it.
            class: 'w-0 min-w-full font-normal',
            ui: {
              itemLabel: 'whitespace-normal overflow-visible text-clip [overflow-wrap:anywhere]',
            },
          },
        ]
      : [],
  );

  return { template, name, noteItems, items };
}
