import type { ExportProgress, ExportReply, ExportRequest } from '../workers/export-compute';
import { ExportRefusal } from '../workers/export-refusal';

export type { ExportRequest } from '../workers/export-compute';

let worker: Worker | undefined;

/** One worker for the visit, made on the first export: it keeps the fonts it fetched. */
function workerOf(): Worker {
  worker ??= new Worker(new URL('../workers/export.worker.ts', import.meta.url), {
    type: 'module',
  });
  return worker;
}

/** The request the worker is on, until it answers: the next one waits its turn. */
let inFlight: Promise<unknown> | undefined;

/**
 * Renders `request` in the worker: the file, and the characters its fonts lack (only a Markdown
 * PDF names any). Rejects with the worker's message if the export failed, or if the worker could
 * not be made or died (it is made again next time). `onProgress` hears how far it is as it goes
 * (0 to 1, or null while the worker can't say), before the reply. One request at a time: the worker
 * answers in order but every listener hears every reply, so a second request (the story map
 * dialog's picks while an export runs) waits for the first one's answer; a lone one goes at once.
 */
export function renderExport(
  request: ExportRequest,
  onProgress?: (fraction: number | null) => void,
): Promise<{ data: Uint8Array | string; missing: string[] }> {
  const before = inFlight;
  const mine = before
    ? before.then(
        () => send(request, onProgress),
        () => send(request, onProgress),
      )
    : send(request, onProgress);
  const settled = mine.then(
    () => {},
    () => {},
  );
  inFlight = settled;
  void settled.then(() => {
    if (inFlight === settled) inFlight = undefined;
  });
  return mine;
}

function send(
  request: ExportRequest,
  onProgress?: (fraction: number | null) => void,
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
    const onMessage = (event: MessageEvent<ExportReply | ExportProgress>) => {
      if ('progress' in event.data) {
        onProgress?.(event.data.progress);
        return;
      }
      finish();
      if ('error' in event.data) {
        const { error, refused } = event.data;
        // Nothing to make (no revised pages): said as it is, never as a failure.
        reject(refused ? new ExportRefusal(error) : new Error(error));
      } else resolve({ data: event.data.data, missing: event.data.missing ?? [] });
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
