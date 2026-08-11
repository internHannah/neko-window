const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("nekoBridge", {
  onPause: (handler) => {
    ipcRenderer.on("neko:pause", (_event, payload) => handler(payload));
  },
  onWater: (handler) => {
    ipcRenderer.on("neko:water", () => handler());
  },
  setClickThrough: (ignore) => {
    ipcRenderer.send("neko:set-click-through", ignore);
  },
});
