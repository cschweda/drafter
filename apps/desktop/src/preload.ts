// The preload: the only bridge between the page and the main process. It runs sandboxed and
// context-isolated, before the page's scripts, and puts one object on the page's window:
// `window.drafterDesktop`, typed by apps/web/app/desktop.ts (`DesktopBridge`), which is where the
// web app reads it. Plain data and named calls only; the page never gets `ipcRenderer` itself.
//
// Later tasks add calls here (files, the menu, closing, updates), each a named `ipcRenderer.invoke`
// or a listener that hands the page plain data, never Electron's event object.
import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopBridge } from '../../web/app/desktop';
import { CHANNELS, type RendererReport, VERSION_ARG } from './channels';

const version =
  process.argv.find((arg) => arg.startsWith(VERSION_ARG))?.slice(VERSION_ARG.length) ?? '';

const bridge: DesktopBridge = { version, platform: process.platform };

contextBridge.exposeInMainWorld('drafterDesktop', bridge);

const report: RendererReport = {
  sandboxed: process.sandboxed === true,
  contextIsolated: process.contextIsolated === true,
};
ipcRenderer.send(CHANNELS.rendererReport, report);
