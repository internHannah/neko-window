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
  onInsets: (handler) => on("neko:insets", handler),
  onSpeed: (handler) => on("neko:speed", handler),
  onDrank: (handler) => on("neko:drank", handler),
  reportBounds: (bounds) => {
    ipcRenderer.send("neko:bounds", bounds);
  },
  setInteractive: (active) => {
    ipcRenderer.send("neko:interactive", active);
  },
  setClickThrough: (ignore) => {
    ipcRenderer.send("neko:set-click-through", ignore);
  },
  snooze: (minutes = 10) => {
    ipcRenderer.send("neko:snooze", minutes);
  },
  drankWater: () => {
    ipcRenderer.send("neko:drank");
  },
});
