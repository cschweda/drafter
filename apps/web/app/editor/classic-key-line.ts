import type { ClassicElement, ElementStructure } from '@drafter/cm-fountain';
import { classicKindName } from './element-names';

/**
 * What Enter and Tab do here, for the status bar and the chip's description (Classic Mode design
 * §9.3): "Enter: Character · Tab: Parenthetical". Empty with no element, or where no key acts.
 */
export function keyLine(element: ClassicElement | null, structure: ElementStructure): string {
  if (!element) return '';
  const { enter, tab } = element;
  const keys: string[] = [];
  if (enter) {
    const place = enter === 'chooser' ? 'Choose an element' : classicKindName(enter, structure);
    keys.push(`Enter: ${place}`);
  }
  if (tab) keys.push(`Tab: ${classicKindName(tab, structure)}`);
  return keys.join(' · ');
}
