const { contextBridge, ipcRenderer } = require("electron");

// Expose window control APIs to the renderer
contextBridge.exposeInMainWorld("appWindow", {
  minimize: () => ipcRenderer.invoke("window:minimize"),
  close: () => ipcRenderer.invoke("window:close"),
  maximize: () => ipcRenderer.invoke("window:maximize"),
  openDevTools: () => ipcRenderer.invoke("window:openDevTools"),
});
