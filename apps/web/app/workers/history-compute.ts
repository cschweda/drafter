import {
  deletedScenes,
  type PastSnapshot,
  type ScenePrint,
  type SceneSlot,
  scenePrints,
  sceneVersions,
} from '@drafter/history';
import {
  type HistoryReply,
  type HistoryRequest,
  MAX_SNAPSHOTS,
  STREAM_MS,
} from '../history/protocol';
import { db } from '../storage/db';
import { canDecompress, gunzip } from '../storage/gzip';

// The history worker's logic (version-history design §3.4, Calls 9 and 10), kept apart from the
// worker so it runs in Node: snapshots are read newest first, and only on a miss in the cache is a
// row read, gunzipped, parsed, and printed. Results stream while it reads; a newer request of the
// same kind stops the older at its next snapshot.

/** A history snapshot as listed: its id and when it was taken. */
export interface SnapshotRef {
  id: string;
  at: number;
}

/** Where the snapshots come from: the `drafter` database in the app (`dexieSource`). */
export interface SnapshotSource {
  /** The script's history snapshots (never its saved row), newest first. */
  list(projectId: string): Promise<SnapshotRef[]>;
  /** The text; null when it can't be read (damaged, or gzip without `DecompressionStream`); undefined when it is gone. */
  read(id: string): Promise<string | null | undefined>;
}

/** The prints cache (`history/cache.ts`). Any of these may fail: the scan then goes on without it. */
export interface PrintStore {
  /** The script's cached snapshot scenes, by snapshot id. */
  scenes(projectId: string): Promise<Map<string, SceneSlot[]>>;
  /** The script's cached prints, by hash. */
  prints(projectId: string): Promise<Map<string, ScenePrint>>;
  put(
    projectId: string,
    snapshots: readonly { id: string; slots: SceneSlot[] }[],
    prints: readonly ScenePrint[],
  ): Promise<void>;
  sweep(projectId: string, liveIds: ReadonlySet<string>): Promise<void>;
}

const SAVED_PREFIX = 'saved:';

/** The snapshots in Drafter's database. Listing reads keys only, so no snapshot's text is loaded. */
export function dexieSource(): SnapshotSource {
  return {
    async list(projectId) {
      const mine = new Set(await db.snapshots.where('projectId').equals(projectId).primaryKeys());
      const out: SnapshotRef[] = [];
      // Newest first, and on a tie the larger id first, as History lists them.
      await db.snapshots
        .orderBy('createdAt')
        .reverse()
        .eachKey((at, cursor) => {
          const id = cursor.primaryKey as string;
          if (mine.has(id) && !id.startsWith(SAVED_PREFIX)) out.push({ id, at: at as number });
        });
      return out;
    },
    async read(id) {
      try {
        const row = await db.snapshots.get(id);
        if (!row) return undefined;
        if (row.gz) return canDecompress() ? await gunzip(row.gz) : null;
        return typeof row.source === 'string' ? row.source : null;
      } catch {
        return null;
      }
    },
  };
}

/** What a worker knows of one script's history: what it read or the cache had. */
interface Memory {
  projectId: string;
  loaded: Promise<void>;
  scenes: Map<string, SceneSlot[]>;
  prints: Map<string, ScenePrint>;
}

type Scan = Extract<HistoryRequest, { kind: 'deleted' | 'versions' }>;

export interface HistoryCompute {
  /** Runs `request`, posting its replies; resolves when it is done or stopped. */
  handle(request: HistoryRequest, post: (reply: HistoryReply) => void): Promise<void>;
}

/** `clock` is in milliseconds (a fake one in tests). `store` null: no cache, as where it can't open. */
export function createHistoryCompute(
  source: SnapshotSource,
  store: PrintStore | null,
  clock: () => number = () => performance.now(),
): HistoryCompute {
  let cache = store;
  /** The request running in each kind's lane. */
  const lanes = new Map<Scan['kind'], number>();
  /** One script's at a time: another script's request starts over. */
  let memory: Memory | null = null;
  /** What was read and isn't in the cache yet. */
  const pending: { projectId: string; id: string; slots: SceneSlot[]; prints: ScenePrint[] }[] = [];

  /** The cache failed: go on without it, as where it can't open. */
  const drop = () => {
    cache = null;
    pending.length = 0;
  };

  function memoryOf(projectId: string): Promise<Memory> {
    if (memory?.projectId === projectId) return memory.loaded.then(() => memory as Memory);
    const scenes = new Map<string, SceneSlot[]>();
    const prints = new Map<string, ScenePrint>();
    const from = cache;
    const loaded = (async () => {
      if (!from) return;
      try {
        const [cachedScenes, cachedPrints] = await Promise.all([
          from.scenes(projectId),
          from.prints(projectId),
        ]);
        for (const [id, slots] of cachedScenes) if (!scenes.has(id)) scenes.set(id, slots);
        for (const [hash, print] of cachedPrints) if (!prints.has(hash)) prints.set(hash, print);
      } catch {
        drop();
      }
    })();
    const made: Memory = { projectId, loaded, scenes, prints };
    memory = made;
    return loaded.then(() => made);
  }

  /** A snapshot's scenes: from memory or the cache, else read and printed. Null: unreadable; undefined: gone. */
  async function slotsOf(m: Memory, id: string): Promise<SceneSlot[] | null | undefined> {
    const hit = m.scenes.get(id);
    if (hit?.every((slot) => m.prints.has(slot.hash))) return hit;
    const text = await source.read(id);
    if (typeof text !== 'string') return text;
    let made: ReturnType<typeof scenePrints>;
    try {
      made = scenePrints(text, (hash) => m.prints.has(hash));
    } catch {
      return null;
    }
    for (const print of made.prints) m.prints.set(print.hash, print);
    m.scenes.set(id, made.slots);
    if (cache) pending.push({ projectId: m.projectId, id, slots: made.slots, prints: made.prints });
    return made.slots;
  }

  async function flush() {
    const batch = pending.splice(0);
    if (!cache || batch.length === 0) return;
    const byProject = new Map<string, typeof batch>();
    for (const item of batch) {
      const list = byProject.get(item.projectId);
      if (list) list.push(item);
      else byProject.set(item.projectId, [item]);
    }
    try {
      for (const [projectId, items] of byProject)
        await cache.put(
          projectId,
          items.map(({ id, slots }) => ({ id, slots })),
          items.flatMap((item) => item.prints),
        );
    } catch {
      drop();
    }
  }

  /** The print the scan follows, for a versions request; null when that scene isn't there. */
  async function startOf(
    request: Extract<Scan, { kind: 'versions' }>,
    m: Memory,
  ): Promise<ScenePrint | null> {
    const { scene } = request;
    if ('snapshot' in scene) {
      const slots = await slotsOf(m, scene.snapshot);
      const slot = slots?.[scene.slot];
      return (slot && m.prints.get(slot.hash)) ?? null;
    }
    const now = scenePrints(request.now);
    const slot =
      now.slots.find((s) => s.from === scene.from && s.to === scene.to) ??
      now.slots.find((s) => s.from <= scene.from && scene.from < s.to);
    return (slot && now.prints.find((p) => p.hash === slot.hash)) ?? null;
  }

  async function scan(request: Scan, post: (reply: HistoryReply) => void, live: () => boolean) {
    const { seq, projectId } = request;
    const refs = await source.list(projectId);
    if (!live()) return;
    const capped = refs.length > MAX_SNAPSHOTS;
    const reading = capped ? refs.slice(0, MAX_SNAPSHOTS) : refs;
    const m = await memoryOf(projectId);
    if (!live()) return;
    const now = request.kind === 'deleted' ? scenePrints(request.now).prints : [];
    const start = request.kind === 'versions' ? await startOf(request, m) : null;
    if (!live()) return;

    const past: PastSnapshot[] = [];
    let read = 0;
    let unreadable = 0;
    let lastPost = Number.NEGATIVE_INFINITY;
    const update = (done: boolean) => {
      post({ seq, kind: 'progress', read, total: reading.length, unreadable, capped });
      if (request.kind === 'deleted')
        post({ seq, kind: 'deleted', scenes: deletedScenes(past, m.prints, now), done });
      else
        post({
          seq,
          kind: 'versions',
          rows: start ? sceneVersions(start, past, m.prints) : [],
          done,
        });
      lastPost = clock();
    };

    for (const ref of reading) {
      const slots = await slotsOf(m, ref.id);
      if (!live()) return;
      read++;
      if (slots === null) unreadable++;
      else if (slots) past.push({ id: ref.id, at: ref.at, slots });
      if (clock() - lastPost >= STREAM_MS) {
        update(false);
        await flush();
        if (!live()) return;
      }
    }
    update(true);
    await flush();
    // A full scan: what's gone goes from the cache, and from memory.
    const liveIds = new Set(refs.map((ref) => ref.id));
    for (const id of m.scenes.keys()) if (!liveIds.has(id)) m.scenes.delete(id);
    if (cache) await cache.sweep(projectId, liveIds).catch(drop);
  }

  return {
    async handle(request, post) {
      if (request.kind === 'cancel') {
        for (const [kind, seq] of lanes) if (seq === request.seq) lanes.delete(kind);
        return;
      }
      const { kind, seq } = request;
      lanes.set(kind, seq);
      const live = () => lanes.get(kind) === seq;
      try {
        await scan(request, post, live);
      } catch (error) {
        if (live())
          post({
            seq,
            kind: 'error',
            message: error instanceof Error ? error.message : String(error),
          });
      } finally {
        if (live()) lanes.delete(kind);
      }
    },
  };
}
