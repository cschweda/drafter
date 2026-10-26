// Parses and paginates off the main thread, so typing never waits on layout.
import type { LayoutRequest } from '../editor/layout-client';
import { computeLayout } from './compute';

self.addEventListener('message', (event: MessageEvent<LayoutRequest>) => {
  self.postMessage(computeLayout(event.data));
});
