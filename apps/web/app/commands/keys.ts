/** Whether the keyboard is an Apple one, where `Mod` is Command rather than Control. */
export function isApple(): boolean {
  if (typeof navigator === 'undefined') return false;
  // `navigator.platform` is deprecated but every browser has it; `userAgentData` is the way forward.
  const platform =
    navigator.platform ||
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ||
    '';
  // `userAgentData.platform` says "macOS", `navigator.platform` says "MacIntel".
  return /mac|iphone|ipad|ipod/i.test(platform);
}

const MODIFIERS = ['Mod', 'Ctrl', 'Alt', 'Shift'] as const;
type Modifier = (typeof MODIFIERS)[number];

/** `Mod-Shift-s` in CodeMirror's notation, taken apart: the modifiers, then the key. */
function parse(keys: string): { modifiers: Modifier[]; key: string } {
  const modifiers: Modifier[] = [];
  let rest = keys;
  for (;;) {
    const dash = rest.indexOf('-');
    // The key is whatever is left, even when it is the minus sign itself (`Mod--`).
    if (dash <= 0) break;
    const name = MODIFIERS.find((m) => m === rest.slice(0, dash));
    if (!name) break;
    modifiers.push(name);
    rest = rest.slice(dash + 1);
  }
  return { modifiers, key: rest };
}

const APPLE_SYMBOL: Record<Modifier, string> = { Mod: '⌘', Ctrl: '⌃', Alt: '⌥', Shift: '⇧' };
const OTHER_NAME: Record<Modifier, string> = {
  Mod: 'Ctrl',
  Ctrl: 'Ctrl',
  Alt: 'Alt',
  Shift: 'Shift',
};

/** `Mod-Shift-s` → `⌘⇧S` on Apple platforms, `Ctrl+Shift+S` elsewhere. */
export function formatKeys(keys: string, apple: boolean): string {
  const { modifiers, key } = parse(keys);
  const shown = key.length === 1 ? key.toUpperCase() : key;
  if (apple) return modifiers.map((m) => APPLE_SYMBOL[m]).join('') + shown;
  return [...modifiers.map((m) => OTHER_NAME[m]), shown].join('+');
}

/**
 * Whether `event` is the key `keys` names: its modifiers are exactly those named, and its key is
 * the one named. With Alt held a letter or digit is read from the physical key (`code`), because
 * Option on a Mac types another character (Option+N is a dead key). Off a Mac, Ctrl+Alt is also
 * AltGr, so there the character it types must be the bound one (ó on a Polish layout, or } on a
 * Hungarian one, is left to type), unless it is a letter of a script other than Latin.
 */
export function matchesKey(event: KeyboardEvent, keys: string, apple: boolean): boolean {
  const { modifiers, key } = parse(keys);
  const has = (m: Modifier) => modifiers.includes(m);
  if (event.metaKey !== (apple && has('Mod'))) return false;
  if (event.ctrlKey !== (has('Ctrl') || (!apple && has('Mod')))) return false;
  if (event.altKey !== has('Alt')) return false;
  if (event.shiftKey !== has('Shift')) return false;
  if (event.altKey && /^[a-z0-9]$/i.test(key)) {
    if (!apple && event.ctrlKey) {
      // The key it types decides (Dvorak's o is on KeyS), even where the browser reports AltGr for
      // a plain Ctrl+Alt: no layout's AltGr types a plain letter. Only a letter of another script, as
      // on a Cyrillic or Greek layout, falls back to the physical key. Anything else is AltGr typing.
      if (event.key.toLowerCase() === key.toLowerCase()) return true;
      if (event.getModifierState?.('AltGraph')) return false;
      if (!/^(?!\p{Script=Latin})\p{L}$/u.test(event.key)) return false;
    }
    return event.code === (/^[0-9]$/.test(key) ? `Digit${key}` : `Key${key.toUpperCase()}`);
  }
  return event.key.toLowerCase() === key.toLowerCase();
}
