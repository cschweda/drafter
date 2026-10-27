// A packaged Drafter runs with Chromium's sandbox or not at all. Some launchers turn it off without
// being asked: electron-builder's AppImage `AppRun` adds `--no-sandbox` when the system won't let
// it make a user namespace (Ubuntu 24.04 and later restrict that by default). The app says so and
// stops, rather than run a renderer with the sandbox off in silence. Pure, so it is unit-tested.

/** The environment variable that lets a person run a packaged app without the sandbox, on purpose. */
export const ALLOW_NO_SANDBOX = 'DRAFTER_ALLOW_NO_SANDBOX';

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

/** True when `--no-sandbox` or `ELECTRON_DISABLE_SANDBOX` has turned Chromium's sandbox off. */
export function sandboxOff(facts: Pick<SandboxFacts, 'hasSwitch' | 'argv' | 'env'>): boolean {
  return (
    facts.hasSwitch('no-sandbox') ||
    facts.argv.slice(1).some((arg) => arg === '--no-sandbox' || arg.startsWith('--no-sandbox=')) ||
    !!facts.env.ELECTRON_DISABLE_SANDBOX
  );
}

/** What to tell the writer if a packaged app must not run (its sandbox is off), else null. */
export function sandboxRefusal(facts: SandboxFacts): string | null {
  if (!facts.packaged || !sandboxOff(facts)) return null;
  if (facts.env[ALLOW_NO_SANDBOX] === '1') return null;
  return [
    'Drafter won’t start without Chromium’s sandbox.',
    'Something started it with the sandbox off (--no-sandbox). The AppImage’s launcher does that when the system won’t let a program make a user namespace, which Ubuntu 24.04 and later do by default.',
    'To fix it, install the .deb (it adds an AppArmor profile that allows the sandbox), or allow user namespaces: sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0',
    `To run without the sandbox anyway, start Drafter with ${ALLOW_NO_SANDBOX}=1. A page that got past Drafter’s other protections could then reach your files.`,
  ].join('\n\n');
}
