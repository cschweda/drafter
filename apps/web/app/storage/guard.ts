import { type Ref, ref } from 'vue';

/**
 * One tab edits a script at a time (technical design §8.2). The tab that opens a script holds the
 * Web Lock `drafter:project:<id>` until the script closes or the tab goes; a second tab finds the
 * lock taken and shows the script read-only, so two tabs never write one recovery copy.
 *
 * Web Locks and `BroadcastChannel` are both feature-detected. Without them there is no guard, and
 * every tab edits (and writes) as it did before; DECISIONS records it.
 */
export interface Guard {
  /** Another tab holds this script: editing is off here. */
  readOnly: Readonly<Ref<boolean>>;
  /** Asks the other tab to let go, then takes over editing with the latest recovery copy. */
  editHere(): Promise<void>;
  /** The last `editHere` didn't get the script: the other tab didn't let go in time, or the copy couldn't be loaded. */
  failed: Readonly<Ref<boolean>>;
}

/** What the script session does at a handover. */
export interface GuardHooks {
  /** The holder: writes the recovery copy. Resolves false if it can't, so the holder keeps the script. */
  giveUp(): Promise<boolean>;
  /** The taker, holding the lock: loads the script afresh from storage into the editor. */
  takeOver(): Promise<void>;
  /** The taker, once the editor is editable again. */
  taken(): void;
}

/** How long a tab waits for the other to let go. */
export const TAKE_OVER_MS = 10_000;

const lockName = (id: string) => `drafter:project:${id}`;

const readOnly = ref(false);
const failed = ref(false);
let hooks: GuardHooks | undefined;
let channel: BroadcastChannel | undefined;
/** The script this tab shows, and the one whose lock it holds (none, while read-only). */
let currentId: string | null = null;
let heldId: string | null = null;
let releaseHeld: (() => void) | null = null;
/** The lock a `claim` replaced, let go by `finish`. */
let stale: (() => void) | null = null;
let handingOver = false;
let taking = false;

function supported(): boolean {
  return (
    typeof navigator !== 'undefined' && !!navigator.locks && typeof BroadcastChannel !== 'undefined'
  );
}

/** Resolves with a function that releases the lock once it is granted, or null if it never is. */
function request(
  id: string,
  options: { ifAvailable?: boolean; signal?: AbortSignal },
): Promise<(() => void) | null> {
  return new Promise((resolve) => {
    navigator.locks
      .request(lockName(id), options, (lock) => {
        if (!lock) {
          resolve(null);
          return;
        }
        return new Promise<void>((done) => resolve(() => done()));
      })
      .catch(() => resolve(null));
  });
}

/** The holder's side of a handover. Read-only first, so nothing is typed after the flush. */
async function handOver() {
  // The lock this handover is about: a switch may take another while the flush runs.
  const id = heldId;
  const release = releaseHeld;
  handingOver = true;
  readOnly.value = true;
  let written = false;
  try {
    written = (await hooks?.giveUp()) ?? false;
  } catch {
    // The recovery copy couldn't be written: the text stays here.
  }
  if (written) {
    release?.();
    if (heldId === id) {
      releaseHeld = null;
      heldId = null;
    }
  } else if (heldId === id) {
    readOnly.value = false;
  }
  handingOver = false;
}

function listen() {
  if (channel) return;
  channel = new BroadcastChannel('drafter');
  channel.onmessage = (event: MessageEvent<{ type?: string; id?: string }>) => {
    const { type, id } = event.data ?? {};
    if (type === 'release' && id === heldId && !handingOver) void handOver();
  };
}

/** For the script session. Connects the handover and says which script it is about to show. */
export const guardControl = {
  bind(next: GuardHooks) {
    hooks = next;
  },

  /**
   * Takes the lock for script `id`, or finds it taken. Sets `readOnly` to match, and resolves to
   * whether this tab may edit. The lock held before is kept until `finish`: the caller makes the
   * editor read-only for the whole switch, shows the new script, and only then lets the old one
   * go, so the old script is never editable here without its lock, and no other tab can take it
   * in between and write the same copy.
   */
  async claim(id: string): Promise<boolean> {
    currentId = id;
    failed.value = false;
    if (!supported()) {
      readOnly.value = false;
      return true;
    }
    listen();
    if (heldId === id) {
      readOnly.value = false;
      return true;
    }
    const release = await request(id, { ifAvailable: true });
    // A handover may have let the old lock go meanwhile; then there is nothing to keep.
    stale = releaseHeld;
    releaseHeld = release;
    heldId = release ? id : null;
    readOnly.value = release === null;
    return release !== null;
  },

  /** Lets go of the lock the last `claim` replaced. Call it once the new script is shown. */
  finish() {
    const old = stale;
    stale = null;
    old?.();
  },

  /** Runs `write` only if no other tab holds script `id`; resolves to whether it ran. */
  async whileFree(id: string, write: () => Promise<void>): Promise<boolean> {
    if (!supported() || heldId === id) {
      await write();
      return true;
    }
    return navigator.locks.request(lockName(id), { ifAvailable: true }, async (lock) => {
      if (!lock) return false;
      await write();
      return true;
    });
  },
};

async function editHere(): Promise<void> {
  const id = currentId;
  if (!id || !supported() || !readOnly.value || taking) return;
  taking = true;
  failed.value = false;
  try {
    listen();
    channel?.postMessage({ type: 'release', id });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TAKE_OVER_MS);
    const release = await request(id, { signal: controller.signal });
    clearTimeout(timer);
    if (!release) {
      failed.value = true;
      return;
    }
    try {
      await hooks?.takeOver();
    } catch {
      release();
      failed.value = true;
      return;
    }
    heldId = id;
    releaseHeld = release;
    readOnly.value = false;
    hooks?.taken();
  } finally {
    taking = false;
  }
}

export function useGuard(): Guard {
  return { readOnly, editHere, failed };
}
