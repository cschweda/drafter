// Keeping a folder module's frame off WebRTC (docs/plans/2026-10-27-desktop-modules-folder.md;
// docs/DECISIONS.md). RTCPeerConnection isn't governed by the CSP or the webRequest backstop, and
// Drafter uses WebRTC nowhere, so a module could otherwise send the script out over ICE (STUN, or
// TURN over UDP or TCP) whatever the writer agreed to. It is closed in two layers, both in the main
// process, both proven by a non-loopback probe:
//   - UDP: `setWebRTCIPHandlingPolicy('disable_non_proxied_udp')` on every webContents (main.ts).
//   - TCP (TURN over TCP): a proxy on the renderer session that refuses every connection but the
//     hosts a module was granted. The updater runs on its own session, so updates are unaffected.
// This module is the proxy's rules; the policy and the wiring are in main.ts. Pure, so it is tested.

/** A proxy nothing listens on: every request routed to it is refused at once. */
export const REFUSE_PROXY = 'http://127.0.0.1:9';

/** The WebRTC IP policy set on every renderer: no peer connection that doesn't go through the proxy. */
export const WEBRTC_POLICY = 'disable_non_proxied_udp';

/** The host (`host` or `host:port`) of an origin, or null when it isn't one. */
function hostOf(origin: string): string | null {
  try {
    const url = new URL(origin);
    return url.origin === origin ? url.host : null;
  } catch {
    return null;
  }
}

/**
 * The renderer session's proxy: refuse everything, bypassing the hosts the writer granted to any
 * module that is on (`grants`: module id → its origins). A granted host goes direct, so a consented
 * fetch works and TURN to that host is possible (it is a consented destination); every other host,
 * TURN included, is refused. Chromium's own loopback bypass is left in place (the proxy is on
 * loopback), so these rules never name it.
 */
export function proxyForGrants(grants: ReadonlyMap<string, readonly string[]>): {
  proxyRules: string;
  proxyBypassRules: string;
} {
  const hosts = new Set<string>();
  for (const origins of grants.values()) {
    for (const origin of origins) {
      const host = hostOf(origin);
      if (host) hosts.add(host);
    }
  }
  return { proxyRules: REFUSE_PROXY, proxyBypassRules: [...hosts].join(';') };
}
