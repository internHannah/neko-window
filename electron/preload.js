const { contextBridge, ipcRenderer } = require("electron");

function on(channel, handler) {
  const listener = (_event, payload) => handler(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld("nekoBridge", {
  onPause: (handler) => on("neko:pause", handler),
  onWater: (handler) => on("neko:water", () => handler()),
  onCursor: (handler) => on("neko:cursor", handler),
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
