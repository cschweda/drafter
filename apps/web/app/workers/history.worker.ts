// Reads a script's snapshots for Deleted scenes and History of this scene (version-history design
// §3.4, Call 9), so the page never decompresses, parses, or matches one. Each message is handled at
// once, not queued, so a newer request can stop the one running.
import { cacheStore } from '../history/cache';
import type { HistoryReply, HistoryRequest } from '../history/protocol';
import { createHistoryCompute, dexieSource } from './history-compute';

const compute = createHistoryCompute(dexieSource(), cacheStore());
const post = (reply: HistoryReply) => self.postMessage(reply);

self.addEventListener('message', (event: MessageEvent<HistoryRequest>) => {
  void compute.handle(event.data, post);
});
