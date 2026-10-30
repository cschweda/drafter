// Parses and paginates off the main thread, so typing never waits on layout; with a baseline, the
// Script pane's Show changes' marks follow each layout (`createLayoutCompute`).
import type { LayoutRequest } from '../editor/layout-client';
import { createLayoutCompute } from './compute';

const compute = createLayoutCompute();
self.addEventListener('message', (event: MessageEvent<LayoutRequest>) => {
  compute.handle(event.data, (reply) => self.postMessage(reply));
});
