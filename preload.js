const { contextBridge, ipcRenderer } = require('electron');

console.log("✅ Preload script loaded!");

contextBridge.exposeInMainWorld('electronAPI', {
  // startOAuth: () => ipcRenderer.invoke('start-oauth'),
  getSources: () => ipcRenderer.invoke('get-sources'),
  saveImage: (buffer) => ipcRenderer.invoke('save-image', buffer),
  getIdleTime: () => ipcRenderer.invoke('get-idle-time'),
  getTokenCookie: () => ipcRenderer.invoke('get-token-cookie')
});

