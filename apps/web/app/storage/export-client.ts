import type { ExportReply, ExportRequest } from '../workers/export-compute';

export type { ExportRequest } from '../workers/export-compute';

let worker: Worker | undefined;

/** One worker for the visit, made on the first export: it keeps the fonts it fetched. */
function workerOf(): Worker {
  worker ??= new Worker(new URL('../workers/export.worker.ts', import.meta.url), {
    type: 'module',
  });
  return worker;
}

/**
 * Renders `request` in the worker: the file, and the characters its fonts lack (only a Markdown
 * PDF names any). Rejects with the worker's message if the export failed, or if the worker could
 * not be made or died (it is made again next time).
 */
export function renderExport(
  request: ExportRequest,
): Promise<{ data: Uint8Array | string; missing: string[] }> {
  return new Promise((resolve, reject) => {
    let own: Worker;
    try {
      own = workerOf();
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
      return;
    }
    const finish = () => {
      own.removeEventListener('message', onMessage);
      own.removeEventListener('error', onFailure);
      own.removeEventListener('messageerror', onFailure);
    };
    const onMessage = (event: MessageEvent<ExportReply>) => {
      finish();
      if ('error' in event.data) reject(new Error(event.data.error));
      else resolve({ data: event.data.data, missing: event.data.missing ?? [] });
    };
    const onFailure = () => {
      finish();
      own.terminate();
      if (worker === own) worker = undefined;
      reject(new Error('The export worker failed.'));
    };
    own.addEventListener('message', onMessage);
    own.addEventListener('error', onFailure);
    own.addEventListener('messageerror', onFailure);
    own.postMessage(request);
  });
}
