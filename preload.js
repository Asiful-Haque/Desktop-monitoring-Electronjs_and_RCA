const { contextBridge, ipcRenderer } = require("electron");

console.log("✅ Preload script loaded!");

contextBridge.exposeInMainWorld("electronAPI", {
  // Existing
  getSources: () => ipcRenderer.invoke("get-sources"),
  saveImage: (buffer) => ipcRenderer.invoke("save-image", buffer),
  getIdleTime: () => ipcRenderer.invoke("get-idle-time"),
  getTokenCookie: () => ipcRenderer.invoke("get-token-cookie"),
  urgentShow: () => ipcRenderer.invoke("urgent:show"),
  urgentClear: () => ipcRenderer.invoke("urgent:clear"),
  // getActiveTimeLogs: () => ipcRenderer.invoke("get-active-time-logs"),
  trackBrowserActivity: () => ipcRenderer.invoke("track-browser-activity"),

  // NEW: Chrome profile + history
  listChromeProfiles: () => ipcRenderer.invoke("chrome:list-profiles"),
  fetchBrowserHistory: (args) => ipcRenderer.invoke("fetch-browser-history", args),
  //Tracker for the C# engine
  startTracking: () => ipcRenderer.send('start-tracking'),
  stopTracking: () => ipcRenderer.send('stop-tracking')
});
