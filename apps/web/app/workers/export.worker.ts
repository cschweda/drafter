// Renders a PDF, plain text, or a Final Draft file off the main thread, so a long script never stops the editor.
import { createExporter, type ExportRequest } from './export-compute';

const exporter = createExporter();

self.addEventListener('message', async (event: MessageEvent<ExportRequest>) => {
  const reply = await exporter(event.data);
  // The PDF's bytes move to the main thread rather than being copied.
  if ('data' in reply && typeof reply.data !== 'string') {
    self.postMessage(reply, { transfer: [reply.data.buffer as ArrayBuffer] });
  } else {
    self.postMessage(reply);
  }
});
