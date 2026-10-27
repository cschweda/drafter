// Runs at document start in both shells (Electron: from the preload; Tauri: an initialization
// script), before the app's own scripts. It notes CSP violations and the moment the app is ready
// (pages drawn, status bar naming a page) as attributes on <html>, which any later script can read.
(() => {
  const violations = [];
  const put = (name, value) => document.documentElement?.setAttribute(name, value);
  document.addEventListener('securitypolicyviolation', (e) => {
    violations.push(`${e.violatedDirective} ${e.blockedURI || 'inline'} ${e.sourceFile || ''}:${e.lineNumber || ''}`);
    put('data-spike-csp', JSON.stringify(violations.slice(0, 40)));
    put('data-spike-csp-count', String(violations.length));
  });
  const check = () => {
    const pages = document.querySelectorAll('section.drafter-script .drafter-page').length;
    const status = document.querySelector('[data-tour="status"]')?.textContent ?? '';
    if (pages > 0 && /Page \d+ of|Title page/.test(status)) {
      put('data-spike-ready', String(Math.round(performance.now())));
      put('data-spike-origin', String(Math.round(performance.timeOrigin)));
      // Also tell the shell's own process, so startup can be timed with no driver attached.
      // Electron's preload passes `report`; in Tauri the app's own command is invoked.
      const epochMs = performance.timeOrigin + performance.now();
      try {
        if (typeof report === 'function') report(epochMs);
        else window.__TAURI__?.core?.invoke('spike_ready', { epochMs });
      } catch {}
      return;
    }
    setTimeout(check, 10);
  };
  setTimeout(check, 0);
})();
