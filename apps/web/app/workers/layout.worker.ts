// Parses and paginates off the main thread, so typing never waits on layout; with a baseline, the
// Script pane's Show changes' marks follow each layout, and with a locked script, its revision
// marks (`createLayoutCompute`).
import type { LayoutRequest } from '../editor/layout-client';
import { createLayoutCompute } from './compute';

const compute = createLayoutCompute();
self.addEventListener('message', (event: MessageEvent<LayoutRequest>) => {
  void compute.handle(event.data, (reply) => self.postMessage(reply));
});
