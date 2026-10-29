/**
 * How far a render is, for a caller that shows it (the app's export toast): a stage, and how much
 * of it is done (`done` of `total`, counting from 0 at its start to `total` at its end). A
 * document's PDF reports `layout` (by blocks), `draw` (by pages), and `save`; a script's PDF,
 * laid out before it comes here, reports `draw` and `save`. `save` is pdf-lib writing the file,
 * which says nothing until it ends, so it reports only its start (0 of 1) and its end (1 of 1).
 */
export interface RenderProgress {
  stage: 'layout' | 'draw' | 'save';
  done: number;
  total: number;
}
