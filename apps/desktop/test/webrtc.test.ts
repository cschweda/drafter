import { describe, expect, test } from 'vitest';
import { proxyForGrants, REFUSE_PROXY } from '../src/webrtc';

// WebRTC can't be governed by CSP or the webRequest backstop, and Drafter uses it nowhere, so a
// module's frame is kept off it: UDP by the WebRTC IP policy (set in main.ts on every webContents),
// and TCP (TURN over TCP) by a proxy that refuses every connection but the origins a module was
// granted (docs/DECISIONS.md). This is the proxy's rules.

describe('proxyForGrants', () => {
  test('refuses every host but the ones a module was granted', () => {
    expect(proxyForGrants(new Map())).toEqual({ proxyRules: REFUSE_PROXY, proxyBypassRules: '' });
    const grants = new Map([
      ['tidy', ['https://api.example.com', 'https://a.example:8443']],
      ['helper', ['http://localhost:11434', 'https://api.example.com']],
    ]);
    const { proxyRules, proxyBypassRules } = proxyForGrants(grants);
    expect(proxyRules).toBe(REFUSE_PROXY);
    // Each granted host once, loopback (the proxy itself) always bypassed so the refusal is prompt.
    // Each granted host, once; loopback keeps Chromium's own bypass (the proxy is on loopback).
    expect(proxyBypassRules.split(';').sort()).toEqual([
      'a.example:8443',
      'api.example.com',
      'localhost:11434',
    ]);
  });

  test('ignores an entry that isn’t a valid origin', () => {
    const grants = new Map([['x', ['not a url', 'https://ok.example']]]);
    expect(proxyForGrants(grants).proxyBypassRules).toBe('ok.example');
  });
});
