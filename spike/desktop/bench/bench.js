// In-page measurement harness, shared by the Electron and Tauri drivers. It is plain script
// (no imports) so it can be injected with Playwright's evaluate or WebDriver's executeScript, and it
// uses only what both Chromium and WebKitGTK have. Everything hangs off `window.__spike`.
(() => {
  if (window.__spike) return;
  const now = () => performance.now();
  const nextPaint = () =>
    new Promise((resolve) =>
      requestAnimationFrame(() => {
        // After the frame's rendering steps: a message task runs once the frame is done.
        const ch = new MessageChannel();
        ch.port1.onmessage = () => resolve(now());
        ch.port2.postMessage(0);
      }),
    );
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const stats = (xs) => {
    const s = [...xs].sort((a, b) => a - b);
    const q = (p) => (s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null);
    const r = (x) => (x == null ? null : Math.round(x * 10) / 10);
    return {
      n: s.length,
      p50: r(q(0.5)),
      p95: r(q(0.95)),
      max: r(s[s.length - 1]),
      mean: r(s.reduce((a, b) => a + b, 0) / (s.length || 1)),
    };
  };

  const state = {
    longTasks: [],
    stalls: [],
    frames: [],
    keys: [],
    recording: false,
    errors: [],
  };
  window.addEventListener('error', (e) => state.errors.push(String(e.message)));
  window.addEventListener('unhandledrejection', (e) => state.errors.push(String(e.reason)));

  // Long tasks: a Chromium API. WebKit has no 'longtask' entry type.
  let longTaskApi = false;
  try {
    if (PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
      new PerformanceObserver((list) => {
        if (!state.recording) return;
        for (const e of list.getEntries()) state.longTasks.push(e.duration);
      }).observe({ type: 'longtask', buffered: false });
      longTaskApi = true;
    }
  } catch {}

  // Engine-neutral stand-in: a 10 ms timer; a gap over 60 ms means the main thread was busy for
  // more than about 50 ms. Counted the same way in both shells.
  let last = now();
  setInterval(() => {
    const t = now();
    if (state.recording && t - last > 60) state.stalls.push(t - last - 10);
    last = t;
  }, 10);
  // Frame gaps while recording.
  let lastFrame = now();
  const frame = (t) => {
    if (state.recording) state.frames.push(t - lastFrame);
    lastFrame = t;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  // Real keystrokes (sent by the driver): keydown to the next frame being done.
  document.addEventListener(
    'keydown',
    (e) => {
      if (!state.recording || e.key.length !== 1) return;
      const t0 = now();
      // event.timeStamp is the time the event was created; use it when it is on the same clock.
      const ts = e.timeStamp > 0 && e.timeStamp <= t0 && t0 - e.timeStamp < 1000 ? e.timeStamp : t0;
      nextPaint().then((t1) => state.keys.push({ fromEvent: t1 - ts, fromHandler: t1 - t0 }));
    },
    true,
  );

  const q = (sel) => document.querySelector(sel);
  const pages = () => document.querySelectorAll('section.drafter-script .drafter-page').length;
  const slim = () =>
    [...document.querySelectorAll('.slim')].find((el) =>
      el.querySelector('[role="group"][aria-label="Zoom"]'),
    );
  const updating = () => /Updating/.test(slim()?.textContent ?? '');
  const content = () => q('.cm-content');

  const api = {
    info() {
      return {
        ua: navigator.userAgent,
        origin: location.origin,
        href: location.href,
        longTaskApi,
        serviceWorker: 'serviceWorker' in navigator,
        swController: !!navigator.serviceWorker?.controller,
        indexedDB: typeof indexedDB !== 'undefined',
        showOpenFilePicker: typeof window.showOpenFilePicker === 'function',
        showSaveFilePicker: typeof window.showSaveFilePicker === 'function',
        moduleWorker: (() => {
          try {
            const w = new Worker(URL.createObjectURL(new Blob([''], { type: 'text/javascript' })), {
              type: 'module',
            });
            w.terminate();
            return true;
          } catch (e) {
            return String(e);
          }
        })(),
        crossOriginIsolated: self.crossOriginIsolated,
        isSecureContext: self.isSecureContext,
        devicePixelRatio,
        inner: [innerWidth, innerHeight],
        fonts: [...document.fonts].map((f) => `${f.family}:${f.weight}:${f.status}`),
        pages: pages(),
        errors: state.errors,
      };
    },
    async swStatus() {
      if (!('serviceWorker' in navigator)) return { supported: false };
      try {
        const regs = await navigator.serviceWorker.getRegistrations();
        return {
          supported: true,
          registrations: regs.map((r) => ({
            scope: r.scope,
            active: r.active?.state ?? null,
            installing: r.installing?.state ?? null,
            waiting: r.waiting?.state ?? null,
          })),
          controller: !!navigator.serviceWorker.controller,
        };
      } catch (e) {
        return { supported: true, error: String(e) };
      }
    },
    /** Tries to register the app's service worker itself, and reports what happened. */
    async swTry() {
      if (!('serviceWorker' in navigator)) return { supported: false };
      try {
        const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        const log = [];
        const w = reg.installing ?? reg.waiting ?? reg.active;
        if (w) {
          log.push(w.state);
          w.addEventListener('statechange', () => log.push(w.state));
        }
        await new Promise((r) => setTimeout(r, 6000));
        return {
          supported: true,
          registered: true,
          scope: reg.scope,
          states: log,
          active: reg.active?.state ?? null,
          waiting: reg.waiting?.state ?? null,
          installing: reg.installing?.state ?? null,
          controller: !!navigator.serviceWorker.controller,
          caches: typeof caches !== 'undefined' ? await caches.keys().catch((e) => String(e)) : 'none',
        };
      } catch (e) {
        return { supported: true, registered: false, error: `${e.name}: ${e.message}` };
      }
    },
    /** Ready: the sample's pages are drawn and the status bar names a page. */
    ready() {
      const status = q('[data-tour="status"]');
      return pages() > 0 && /Page \d+ of|Title page/.test(status?.textContent ?? '') && !updating();
    },
    state() {
      return { pages: pages(), updating: updating(), firstLine: q('.cm-line')?.textContent ?? '' };
    },
    /**
     * Replaces the script with `text` as a paste (CodeMirror reads clipboardData), and times how
     * long until the Script pane has at least `minPages` pages and nothing says Updating.
     */
    async loadLong(text, minPages) {
      const el = content();
      el.focus();
      document.execCommand('selectAll');
      await sleep(50);
      const t0 = now();
      const dt = new DataTransfer();
      dt.setData('text/plain', text);
      const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
      el.dispatchEvent(ev);
      let how = 'paste';
      if (!ev.defaultPrevented) {
        how = 'execCommand';
        document.execCommand('insertText', false, text);
      }
      const tInserted = now();
      let tPages = null;
      const deadline = t0 + 120_000;
      while (now() < deadline) {
        if (pages() >= minPages && !updating()) {
          tPages = now();
          break;
        }
        await sleep(20);
      }
      return {
        how,
        insertMs: Math.round(tInserted - t0),
        pagesDrawnMs: tPages == null ? null : Math.round(tPages - t0),
        pages: pages(),
      };
    },
    /** Puts the cursor at the start of the script, as Ctrl+Home does (CodeMirror's keymap). */
    toStart() {
      const el = content();
      el.focus();
      for (const type of ['keydown', 'keyup']) {
        el.dispatchEvent(
          new KeyboardEvent(type, {
            key: 'Home',
            code: 'Home',
            keyCode: 36,
            ctrlKey: true,
            bubbles: true,
            cancelable: true,
          }),
        );
      }
    },
    startRecording() {
      state.longTasks.length = 0;
      state.stalls.length = 0;
      state.frames.length = 0;
      state.keys.length = 0;
      state.recording = true;
    },
    async stopRecording() {
      await sleep(500);
      state.recording = false;
      return {
        keys: {
          fromEvent: stats(state.keys.map((k) => k.fromEvent)),
          fromHandler: stats(state.keys.map((k) => k.fromHandler)),
        },
        longTasks: { api: longTaskApi, count: state.longTasks.length, ...stats(state.longTasks) },
        stalls: { count: state.stalls.length, ...stats(state.stalls) },
        frames: {
          over50: state.frames.filter((f) => f > 50).length,
          ...stats(state.frames),
        },
      };
    },
    /**
     * Types `phrase` with document.execCommand('insertText'), one character every `gap` ms: the
     * same path in both engines, no driver involved. Times each character to the next frame.
     */
    async typeJS(phrase, gap = 60) {
      content().focus();
      api.startRecording();
      const per = [];
      for (const ch of phrase) {
        const t0 = now();
        document.execCommand('insertText', false, ch);
        const t1 = await nextPaint();
        per.push(t1 - t0);
        const left = gap - (now() - t0);
        if (left > 0) await sleep(left);
      }
      const rec = await api.stopRecording();
      return { perChar: stats(per), ...rec };
    },
    /** Waits for the layout to settle, then says whether the first page shows `text`. */
    async firstPageShows(text, timeout = 30_000) {
      const end = now() + timeout;
      while (now() < end) {
        const first = document.querySelector('section.drafter-script .drafter-page');
        if (!updating() && first?.textContent.includes(text)) return true;
        await sleep(50);
      }
      return false;
    },
    /** Exports a PDF through the app's own menu; the blob it hands to the download is checked. */
    async exportPdf(timeout = 60_000) {
      const blobs = [];
      const orig = URL.createObjectURL;
      // Electron's Chromium has the File System Access API, so the app would show a native save
      // picker (which CI can't answer). Hidden here, as e2e/fs-stub.ts's removePickers does, so
      // the export takes the download path and its blob can be checked.
      const pickers = { save: window.showSaveFilePicker, open: window.showOpenFilePicker };
      window.showSaveFilePicker = undefined;
      window.showOpenFilePicker = undefined;
      URL.createObjectURL = (b) => {
        blobs.push(b);
        return orig.call(URL, b);
      };
      try {
        const t0 = now();
        const exp = document.querySelector('button[data-tour="export"]');
        if (!exp) return { ok: false, error: 'no Export button' };
        exp.click();
        await sleep(300);
        const group = document.querySelector('[role="group"][aria-label="Export"]');
        const pdf = group && [...group.querySelectorAll('button')].find((b) => /PDF/.test(b.textContent));
        if (!pdf) return { ok: false, error: 'no PDF item' };
        pdf.click();
        const end = now() + timeout;
        let toast = '';
        while (now() < end) {
          toast = [...document.querySelectorAll('.toast [role="status"]')]
            .map((t) => t.textContent)
            .join(' | ');
          if (/Exported|failed|could not|Couldn/i.test(toast) && blobs.length) break;
          if (/failed|could not|Couldn/i.test(toast)) break;
          await sleep(50);
        }
        const ms = Math.round(now() - t0);
        const blob = blobs.find((b) => b.type === 'application/pdf') ?? blobs[0];
        if (!blob) return { ok: false, ms, toast, error: 'no blob' };
        const head = new Uint8Array(await blob.slice(0, 5).arrayBuffer());
        const magic = String.fromCharCode(...head);
        return {
          ok: magic === '%PDF-',
          ms,
          toast,
          bytes: blob.size,
          magic,
        };
      } finally {
        URL.createObjectURL = orig;
        window.showSaveFilePicker = pickers.save;
        window.showOpenFilePicker = pickers.open;
      }
    },
  };
  window.__spike = api;
})();
