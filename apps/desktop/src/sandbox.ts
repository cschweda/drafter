// A packaged Drafter is meant to run with Chromium's sandbox. Some launchers turn it off without
// being asked: electron-builder's AppImage `AppRun` adds `--no-sandbox` when the system won't let
// it make a user namespace (Ubuntu 24.04 and later restrict that by default). The app does not run
// that way in silence: it explains, recommends the .deb, and asks once whether to continue. Pure,
// so it is unit-tested; main.ts shows the question and keeps the answer.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** The environment variable that lets a person run a packaged app without the sandbox, and skips the question. */
export const ALLOW_NO_SANDBOX = 'DRAFTER_ALLOW_NO_SANDBOX';

/** The button that carries on without the sandbox. */
export const CONTINUE = 'Continue without the sandbox';
/** The button that quits. */
export const QUIT = 'Quit';

/** Why the sandbox is off; the answer is remembered per reason. */
export type SandboxReason = 'no-sandbox-switch' | 'disable-sandbox-env';

export interface SandboxFacts {
  /** `app.isPackaged`. */
  packaged: boolean;
  /** `app.commandLine.hasSwitch`. */
  hasSwitch(name: string): boolean;
  /** `process.argv`: `app.commandLine` can miss a `--no-sandbox` that Chromium still honours. */
  argv: readonly string[];
  /** `process.env`. */
  env: Record<string, string | undefined>;
}

/** What the writer is told, and the name of the file in userData that records "continue". */
export interface SandboxNotice {
  reason: SandboxReason;
  message: string;
  detail: string;
  /** The file whose presence means the question was answered Continue (in userData). */
  marker: string;
}

/** Why the sandbox is off (`--no-sandbox`, or `ELECTRON_DISABLE_SANDBOX` set to anything, even empty), if it is. */
export function sandboxOffReason(
  facts: Pick<SandboxFacts, 'hasSwitch' | 'argv' | 'env'>,
): SandboxReason | null {
  if (
    facts.hasSwitch('no-sandbox') ||
    facts.argv.slice(1).some((arg) => arg === '--no-sandbox' || arg.startsWith('--no-sandbox='))
  ) {
    return 'no-sandbox-switch';
  }
  if (facts.env.ELECTRON_DISABLE_SANDBOX !== undefined) return 'disable-sandbox-env';
  return null;
}

/** The name of the file that remembers "continue" for a reason. */
export const markerFor = (reason: SandboxReason) => `sandbox-continue-${reason}`;

/** What to ask before a packaged app runs with its sandbox off, else null (nothing to ask). */
export function sandboxNotice(facts: SandboxFacts, userData: string): SandboxNotice | null {
  if (!facts.packaged) return null;
  const reason = sandboxOffReason(facts);
  if (!reason) return null;
  if (facts.env[ALLOW_NO_SANDBOX] === '1') return null;
  const marker = join(userData, markerFor(reason));
  return {
    reason,
    marker,
    message: 'Drafter is about to start without Chromium’s sandbox.',
    detail: [
      'The sandbox keeps a page that went wrong away from your files. Something started Drafter with it off: the AppImage’s launcher does that when the system won’t let a program make a user namespace, as Ubuntu 24.04 and later do by default.',
      'The .deb runs with the sandbox on these systems, because it adds an AppArmor profile that allows it. Installing the .deb is the best fix. docs/desktop-install-linux.md in the Drafter repository (github.com/cschweda/drafter) has the details and the other choices.',
      `Continue only if you accept running without the sandbox. Your answer is remembered in ${marker}; delete that file to be asked again. To skip the question, start Drafter with ${ALLOW_NO_SANDBOX}=1.`,
    ].join('\n\n'),
  };
}

/** Writes the "Continue" answer. Returns false, and does not throw, if it can't be kept (the app still carries on). */
export function rememberAnswer(marker: string): boolean {
  try {
    mkdirSync(dirname(marker), { recursive: true });
    writeFileSync(marker, `${new Date().toISOString()}\n`);
    return true;
  } catch {
    return false;
  }
}
