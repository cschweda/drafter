// The only bridge between the page and the main process: a few named calls, no `ipcRenderer` itself.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('drafterDesktop', {
  shell: 'electron',
  pickToOpen: () => ipcRenderer.invoke('files:pickToOpen'),
  pickToSave: (name, kind) => ipcRenderer.invoke('files:pickToSave', name, kind),
  read: (ref) => ipcRenderer.invoke('files:read', ref),
  write: (ref, data) => ipcRenderer.invoke('files:write', ref, data),
  dialogInfo: () => ipcRenderer.invoke('spike:dialogInfo'),
});

