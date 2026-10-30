import { type Ref, ref } from 'vue';
import type { DesktopUpdateCheck } from '../desktop';
import type { UpdateKind } from './state';

// Help → Check for updates: a check the writer asks for, now. On the web it asks the service
// worker's registration to look for a new version (`registration.update()`, the worker's own
// request for `/sw.js`, and nothing else: no new network call). In the desktop app it asks the
// main process's updater (electron-updater, or the Mac app's release check), which checks whether
// or not "Check for updates when Drafter starts" is on. What either finds goes to the update offer
// the app already has (`UpdatePrompt.vue`), which never reloads or restarts by itself.

export type DesktopCheckResult = DesktopUpdateCheck;

/** The part of a `ServiceWorkerRegistration` the check uses. */
export interface RegistrationLike {
  update(): Promise<unknown>;
  readonly waiting: unknown;
  readonly installing: (EventTarget & { readonly state: string }) | null;
}

export interface CheckDeps {
  /** The running version, `0.13.1`. */
  current: string;
  /** The desktop app's updater; null or absent in a browser. */
  desktop?: { check(): Promise<DesktopCheckResult> } | null;
  /** `navigator.serviceWorker`, or null where there is none. */
  serviceWorker?: { getRegistration(): Promise<RegistrationLike | undefined> } | null;
  /** The offer the app is holding already (a new version is waiting), or null. */
  offered(): { version: string; how: UpdateKind } | null;
  /** How long a new worker the check found may take to install before the check gives up. */
  installMs?: number;
}

/**
 * `ready`: a new version is waiting (`how`: Reload, Restart, or Get it). `downloading`: the
 * desktop app found one and is downloading it. `unavailable`: this copy can't check (no service
 * worker; an unpackaged desktop build).
 */
export type CheckStatus =
  | 'idle'
  | 'checking'
  | 'latest'
  | 'ready'
  | 'downloading'
  | 'unavailable'
  | 'error';

export interface CheckState {
  status: CheckStatus;
  version?: string;
  how?: UpdateKind;
}

/** How long a found web update may take to install: it is the app's few megabytes. */
export const INSTALL_MS = 60_000;

/** Resolves with the worker's state once it has installed, failed (`redundant`), or `timeout`. */
function settled(
  worker: EventTarget & { readonly state: string },
  ms: number,
): Promise<'installed' | 'redundant' | 'timeout'> {
  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const look = () => {
      if (
        worker.state === 'installed' ||
        worker.state === 'activating' ||
        worker.state === 'activated'
      ) {
        done('installed');
      } else if (worker.state === 'redundant') done('redundant');
    };
    const done = (result: 'installed' | 'redundant' | 'timeout') => {
      clearTimeout(timer);
      worker.removeEventListener('statechange', look);
      resolve(result);
    };
    worker.addEventListener('statechange', look);
    timer = setTimeout(() => done('timeout'), ms);
    look();
  });
}

const HOWS: readonly string[] = ['restart', 'get'];

/** A desktop answer, kept to the fields and values the check knows. */
function fromDesktop(result: unknown): CheckState {
  if (typeof result !== 'object' || result === null) return { status: 'error' };
  const { status, version, how } = result as Record<string, unknown>;
  if (status === 'latest') return { status: 'latest' };
  if (status === 'off') return { status: 'unavailable' };
  if (status === 'downloading' && typeof version === 'string') {
    return { status: 'downloading', version };
  }
  if (
    status === 'found' &&
    typeof version === 'string' &&
    typeof how === 'string' &&
    HOWS.includes(how)
  ) {
    return { status: 'ready', version, how: how as UpdateKind };
  }
  return { status: 'error' };
}

async function check(deps: CheckDeps): Promise<CheckState> {
  const offer = deps.offered();
  if (offer) {
    return { status: 'ready', ...(offer.version && { version: offer.version }), how: offer.how };
  }
  if (deps.desktop) {
    try {
      return fromDesktop(await deps.desktop.check());
    } catch {
      return { status: 'error' };
    }
  }
  if (!deps.serviceWorker) return { status: 'unavailable' };
  let registration: RegistrationLike | undefined;
  try {
    registration = await deps.serviceWorker.getRegistration();
  } catch {
    registration = undefined;
  }
  if (!registration) return { status: 'unavailable' };
  try {
    await registration.update();
  } catch {
    // Offline, or drafter.dev didn't answer.
    return { status: 'error' };
  }
  if (registration.waiting) return { status: 'ready', how: 'reload' };
  const installing = registration.installing;
  if (installing) {
    const result = await settled(installing, deps.installMs ?? INSTALL_MS);
    if (result === 'installed') return { status: 'ready', how: 'reload' };
    if (result === 'timeout') return { status: 'error' };
  }
  return { status: 'latest' };
}

/** A check and what it has said. A run while one is under way is that one. */
export function createUpdateCheck(deps: CheckDeps): {
  state: Ref<CheckState>;
  run(): Promise<CheckState>;
} {
  const state = ref<CheckState>({ status: 'idle' });
  let running: Promise<CheckState> | null = null;
  function run(): Promise<CheckState> {
    if (running) return running;
    state.value = { status: 'checking' };
    running = check(deps).then((result) => {
      state.value = result;
      running = null;
      return result;
    });
    return running;
  }
  return { state, run };
}

/** What the check says, in the app it is (`web` or `desktop`). */
export function checkMessage(state: CheckState, current: string, app: 'web' | 'desktop'): string {
  const v = (version: string | undefined) => (version ? `v${version}` : 'A new version');
  switch (state.status) {
    case 'idle':
    case 'checking':
      return 'Checking for updates…';
    case 'latest':
      return app === 'desktop'
        ? `Drafter ${v(current)} is up to date.`
        : `You’re on the latest version (${v(current)}).`;
    case 'ready':
      if (state.how === 'restart')
        return `Drafter ${v(state.version)} is ready. Restart to use it.`;
      if (state.how === 'get') {
        return `Drafter ${v(state.version)} is available. Get it from the release page.`;
      }
      return 'A new version of Drafter is ready. Reload to use it.';
    case 'downloading':
      return `Drafter ${v(state.version)} is downloading. Drafter will offer to restart when it’s ready.`;
    case 'unavailable':
      return app === 'desktop'
        ? 'This copy of Drafter can’t check for updates: it isn’t an installed build.'
        : 'This copy of Drafter has no service worker, so it can’t check for updates here. Reloading the page loads the newest version.';
    case 'error':
      return 'Drafter couldn’t check for updates. You may be offline; try again later.';
  }
}
