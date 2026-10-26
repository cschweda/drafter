// "Reload anyway" (Phase 1 design §11): the writer has been asked, by Drafter, whether to leave
// with changes that aren't in a file, and said yes. The browser's own "leave this page?" question
// (`storage/script.ts`) would only repeat it. This has no imports on purpose: the service-worker
// plugin, which is in the first load, uses it, and must not pull the editor in with it.

let allowed = false;
let timer: ReturnType<typeof setTimeout> | undefined;

/** Lasts a few seconds, so a reload that doesn't happen leaves the protection on. */
export function allowLeaving(): void {
  allowed = true;
  clearTimeout(timer);
  timer = setTimeout(() => {
    allowed = false;
  }, 5000);
}

export function leaveAllowed(): boolean {
  return allowed;
}
