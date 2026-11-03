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

/**
 * The phone's Next button (Classic Mode design §10): it does what Tab does, and says where that
 * goes, "Next: Character", as there's no key to learn. A plain "Next" where Tab goes nowhere.
 */
export function nextLabel(element: ClassicElement | null, structure: ElementStructure): string {
  return element?.tab ? `Next: ${classicKindName(element.tab, structure)}` : 'Next';
}

/**
 * Whether the element row shows over the Source: Settings has it on, outside focus mode, in a
 * script that can be changed. In Classic Mode on a phone with its keyboard up it shows whatever the
 * setting and in focus mode too, as it holds the Next button, and without it there is no Tab (§10).
 */
export function elementRowShown({
  setting,
  focus,
  readOnly,
  classicKeyboard,
}: {
  setting: boolean;
  focus: boolean;
  readOnly: boolean;
  /** Classic Mode, a script, and the on-screen keyboard up (below 1024px). */
  classicKeyboard: boolean;
}): boolean {
  if (readOnly) return false;
  return classicKeyboard || (setting && !focus);
}
