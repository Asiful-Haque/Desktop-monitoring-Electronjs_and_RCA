const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  startOAuth: () => ipcRenderer.invoke('start-oauth'),
  getSources: () => ipcRenderer.invoke('get-sources'),
  saveImage: (buffer) => ipcRenderer.invoke('save-image', buffer),
  getIdleTime: () => ipcRenderer.invoke('get-idle-time'),
});