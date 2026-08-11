const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("nekoBridge", {
  onPause: (handler) => {
    ipcRenderer.on("neko:pause", (_event, payload) => handler(payload));
  },
  onWater: (handler) => {
    ipcRenderer.on("neko:water", () => handler());
  },
  onCursor: (handler) => {
    ipcRenderer.on("neko:cursor", (_event, payload) => handler(payload));
  },
  reportBounds: (bounds) => {
    ipcRenderer.send("neko:bounds", bounds);
  },
  setInteractive: (active) => {
    ipcRenderer.send("neko:interactive", active);
  },
  setClickThrough: (ignore) => {
    ipcRenderer.send("neko:set-click-through", ignore);
  },
});
