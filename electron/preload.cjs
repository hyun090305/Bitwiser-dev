const { contextBridge, ipcRenderer } = require('electron');

// Do not expose ipcRenderer, filesystem paths or caller-selected channels.
contextBridge.exposeInMainWorld('bitwiserCircuitStore', {
  save: record => ipcRenderer.invoke('circuit-store:save', record),
  list: context => ipcRenderer.invoke('circuit-store:list', context),
  load: id => ipcRenderer.invoke('circuit-store:load', id),
  delete: id => ipcRenderer.invoke('circuit-store:delete', id),
  writePreview: (id, bytes) => ipcRenderer.invoke('circuit-store:writePreview', id, bytes),
  readPreview: id => ipcRenderer.invoke('circuit-store:readPreview', id)
});
