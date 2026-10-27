// A hostile module for the e2e suite (e2e/modules.spec.ts): its button tries everything a folder
// module must not be able to do, and keeps what happened in its own storage, where the test reads
// it. `config.json` (written by the test, beside this file) names the addresses it tries.

/** 'refused' when `attempt` throws or rejects, else what it gave. */
async function tryIt(attempt) {
  try {
    return await attempt();
  } catch {
    return 'refused';
  }
}

function openAppDatabase() {
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open('drafter');
      request.onsuccess = () => resolve('reached');
      request.onerror = () => resolve('refused');
    } catch {
      resolve('refused');
    }
  });
}

export default {
  id: 'probe',
  action: {
    label: 'Probe',
    async run(ctx) {
      const config = await (await fetch('/config.json')).json();
      const results = {
        parentDocument: await tryIt(() => (window.parent.document ? 'reached' : 'absent')),
        parentBridge: await tryIt(() => (window.parent.drafterDesktop ? 'reached' : 'absent')),
        ownBridge: typeof window.drafterDesktop === 'undefined' ? 'absent' : 'reached',
        topBridge: await tryIt(() => (window.top.drafterDesktop ? 'reached' : 'absent')),
        appDatabase: await openAppDatabase(),
        localStorage: await tryIt(() => (window.localStorage ? 'reached' : 'absent')),
        otherModuleFile: await tryIt(async () => {
          await fetch('drafter-module://tidy/index.js');
          return 'reached';
        }),
        otherModuleImport: await tryIt(async () => {
          await import('drafter-module://tidy/index.js');
          return 'reached';
        }),
        otherFrames: await tryIt(() => {
          let reached = 0;
          for (let i = 0; i < window.parent.frames.length; i++) {
            const frame = window.parent.frames[i];
            if (frame === window) continue;
            try {
              if (frame.document) reached++;
            } catch {
              // Cross-origin: refused, as it should be.
            }
          }
          return reached === 0 ? 'refused' : 'reached';
        }),
        network: {},
        popup: await tryIt(() => (window.open('https://example.com/') ? 'reached' : 'refused')),
      };
      for (const [name, url] of Object.entries(config.urls)) {
        results.network[name] = await tryIt(async () => {
          const response = await fetch(url);
          return response.ok ? 'reached' : `status ${response.status}`;
        });
      }
      // Pretend to be Drafter to the other modules' frames: their runtimes must ignore it.
      for (let i = 0; i < window.parent.frames.length; i++) {
        const frame = window.parent.frames[i];
        if (frame === window) continue;
        frame.postMessage(
          { drafter: 1, kind: 'run', run: 1, what: 'command', command: 'trim' },
          '*',
        );
        frame.postMessage({ drafter: 1, kind: 'run', run: 1, what: 'action' }, '*');
      }
      await ctx.storage.set('results', results);
      // Last: leave the app. The sandbox refuses it (no allow-top-navigation).
      results.topNavigation = await tryIt(() => {
        window.top.location.href = 'https://example.com/';
        return 'tried';
      });
      await ctx.storage.set('results', results);
      await ctx.notify('Probe done.');
    },
  },
};
