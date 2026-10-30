// Renders a PDF, plain text, or a Final Draft file (and a Markdown document's PDF) off the main thread, so a long script never stops the editor.
import { createExporter, type ExportProgress, type ExportRequest } from './export-compute';

const exporter = createExporter();

self.addEventListener('message', async (event: MessageEvent<ExportRequest>) => {
  // How far it is, as it goes (some ten a second at most), then the reply.
  const reply = await exporter(event.data, (progress) => {
    self.postMessage({ progress } satisfies ExportProgress);
  });
  // The PDF's bytes move to the main thread rather than being copied.
  if ('data' in reply && typeof reply.data !== 'string') {
    self.postMessage(reply, { transfer: [reply.data.buffer as ArrayBuffer] });
  } else {
    self.postMessage(reply);
  }
});
