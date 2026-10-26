// Parses a long Markdown document off the main thread, so typing never waits on the preview.
import { computeMarkdown, type MarkdownRequest } from '../markdown/compute';

self.addEventListener('message', (event: MessageEvent<MarkdownRequest>) => {
  self.postMessage(computeMarkdown(event.data));
});
