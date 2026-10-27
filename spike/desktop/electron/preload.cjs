// The only bridge between the page and the main process: a few named calls, no `ipcRenderer` itself.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('drafterDesktop', {
  shell: 'electron',
  pickToOpen: () => ipcRenderer.invoke('files:pickToOpen'),
  pickToSave: (name, kind) => ipcRenderer.invoke('files:pickToSave', name, kind),
  read: (ref) => ipcRenderer.invoke('files:read', ref),
  write: (ref, data) => ipcRenderer.invoke('files:write', ref, data),
  dialogInfo: () => ipcRenderer.invoke('spike:dialogInfo'),
  startedAt: () => ipcRenderer.invoke('spike:startedAt'),
});


// Spike only: the document-start script (bench/startup.js). It runs in the preload's isolated world,
// which shares the DOM with the page, and writes what it sees as attributes on <html>.
try {
  const text = ipcRenderer.sendSync('spike:startupScript');
  if (text) new Function(text)();
} catch (e) {
  console.error('spike startup script', e);
}
