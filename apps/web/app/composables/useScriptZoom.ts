export type ScriptZoom = 'fit' | 'full';

/** How the Script pane scales its pages: to fill the pane's width, or at real size. */
export function useScriptZoom() {
  return useState<ScriptZoom>('script-zoom', () => 'fit');
}
