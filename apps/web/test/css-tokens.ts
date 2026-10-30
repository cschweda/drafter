import { readFileSync } from 'node:fs';

// The design tokens of a theme, read straight from the stylesheet the app uses, with every alias
// (`--chrome: var(--surface)`) followed to its color, as the browser does. A theme is the blocks on
// `:root` (or `.dark`) and then, for the light theme, the `.light` block over them.

const css = readFileSync(new URL('../app/assets/css/tokens.css', import.meta.url), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);

/** A token's value as written: a color, a `var()`, or anything else (a radius, a curve). */
function declared(name: 'dark' | 'light'): Record<string, string> {
  const own = (selector: string) =>
    [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)]
      .filter(([, list]) => (list as string).split(',').some((part) => part.trim() === selector))
      .flatMap(([, , body]) =>
        [...(body as string).matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(
          ([, token, value]) => [token as string, (value as string).trim()] as const,
        ),
      );
  const blocks = name === 'dark' ? [':root', '.dark'] : [':root', '.light'];
  return Object.fromEntries(blocks.flatMap(own));
}

/** The theme's tokens, each alias followed to the value it names. */
export function themeTokens(name: 'dark' | 'light'): Record<string, string> {
  const raw = declared(name);
  const resolve = (value: string, seen: string[]): string => {
    const alias = /^var\((--[\w-]+)\)$/.exec(value);
    if (!alias) return value;
    const target = alias[1] as string;
    if (seen.includes(target)) throw new Error(`${seen.join(' → ')} → ${target} is a loop`);
    const next = raw[target];
    if (next === undefined) throw new Error(`${seen.at(-1)} names ${target}, which isn't defined`);
    return resolve(next, [...seen, target]);
  };
  return Object.fromEntries(
    Object.entries(raw).map(([token, value]) => [token, resolve(value, [token])]),
  );
}

/** The token another token is an alias of, or undefined when it holds a value of its own. */
export function aliasOf(name: 'dark' | 'light', token: string): string | undefined {
  return /^var\((--[\w-]+)\)$/.exec(declared(name)[token] ?? '')?.[1];
}
