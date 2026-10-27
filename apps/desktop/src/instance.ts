// One Drafter at a time, and the moment that rule meets an update's restart. electron-updater's
// Restart (AppImageUpdater) moves the new AppImage into place, starts it with
// APPIMAGE_SILENT_INSTALL=true, and only then quits the old one. The new one can ask for the
// single-instance lock while the old one still holds it: without care it would hand its arguments
// to the old one and exit (no Drafter left), and the old one, bringing its window forward, would
// open it again and stop its own quit. So the old one ignores second launches once it is quitting,
// and the new one, knowing it was started by an update, waits a few seconds for the lock.

/** How long a Drafter just started by an update waits for the old one to let go of the lock. */
export const RESTART_LOCK_WAIT_MS = 10_000;
/** How often it asks again meanwhile. */
export const RESTART_LOCK_RETRY_MS = 200;

export interface LockDeps {
  /** `app.requestSingleInstanceLock()`. */
  request(): boolean;
  /** `process.env`: APPIMAGE_SILENT_INSTALL is read, then removed. */
  env: Record<string, string | undefined>;
  wait(ms: number): Promise<void>;
  now(): number;
}

/**
 * Takes the single-instance lock and calls `got`, or `lost` when another Drafter has it. The first
 * request is made at once (synchronously). A Drafter started by an update's Restart keeps asking
 * for up to RESTART_LOCK_WAIT_MS before it gives up.
 */
export function takeInstanceLock(deps: LockDeps, then: { got(): void; lost(): void }): void {
  const updated = deps.env.APPIMAGE_SILENT_INSTALL === 'true';
  // Only this start was the update's; programs Drafter starts later (a browser) don't inherit it.
  delete deps.env.APPIMAGE_SILENT_INSTALL;
  if (deps.request()) {
    then.got();
    return;
  }
  if (!updated) {
    then.lost();
    return;
  }
  const deadline = deps.now() + RESTART_LOCK_WAIT_MS;
  void (async () => {
    while (deps.now() < deadline) {
      await deps.wait(RESTART_LOCK_RETRY_MS);
      if (deps.request()) {
        then.got();
        return;
      }
    }
    then.lost();
  })();
}

export interface SecondInstanceDeps {
  /** True once the app is quitting (closing.ts's Closing.quitting). */
  quitting(): boolean;
  bringForward(): void;
  /** Opens what the second launch named: its arguments after the program, from its folder. */
  open(args: string[], cwd: string): void;
}

/** The `second-instance` handler: forward and open, unless this Drafter is on its way out. */
export function onSecondInstance(deps: SecondInstanceDeps) {
  return (_event: unknown, argv: string[], workingDirectory: string) => {
    if (deps.quitting()) return;
    deps.bringForward();
    deps.open(argv.slice(1), workingDirectory);
  };
}
