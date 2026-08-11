const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  Notification,
  ipcMain,
  screen,
} = require("electron");
const path = require("path");

const DEFAULT_INTERVAL_MS = 45 * 60 * 1000;
const CURSOR_POLL_MS = 32;

let mainWindow = null;
let tray = null;
let trayMenu = null;
let paused = false;
let reminderIntervalMs = DEFAULT_INTERVAL_MS;
let reminderTimer = null;
let cursorPollTimer = null;
let nekoBounds = { x: 0, y: 0, w: 64, h: 64 };
let forceInteractive = false;
let ignoringMouse = true;

function createTrayIcon() {
  const iconPath = path.join(__dirname, "..", "assets", "tray.png");
  let icon = nativeImage.createFromPath(iconPath);
  if (icon.isEmpty()) {
    // Fallback: solid pink square so the tray is never invisible
    const size = 32;
    const buf = Buffer.alloc(size * size * 4);
    for (let i = 0; i < size * size; i++) {
      buf[i * 4] = 255;
      buf[i * 4 + 1] = 105;
      buf[i * 4 + 2] = 180;
      buf[i * 4 + 3] = 255;
    }
    icon = nativeImage.createFromBuffer(buf, { width: size, height: size });
  }
  return icon.resize({ width: 16, height: 16 });
}

function createWindow() {
  const display = screen.getPrimaryDisplay();
  const { x, y, width, height } = display.bounds;

  mainWindow = new BrowserWindow({
    width,
    height,
    x,
    y,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    fullscreenable: false,
    hasShadow: false,
    focusable: true,
    show: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.setAlwaysOnTop(true, "screen-saver");
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  mainWindow.setIgnoreMouseEvents(true, { forward: true });
  ignoringMouse = true;
  mainWindow.loadFile(path.join(__dirname, "..", "src", "index.html"));

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function sendToNeko(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function setMouseIgnore(ignore) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (ignoringMouse === ignore) return;
  ignoringMouse = ignore;
  if (ignore) {
    mainWindow.setIgnoreMouseEvents(true, { forward: true });
  } else {
    // Fully capture mouse so pet/drag clicks register
    mainWindow.setIgnoreMouseEvents(false);
  }
}

function pointInNeko(localX, localY) {
  const pad = 8;
  return (
    localX >= nekoBounds.x - pad &&
    localX <= nekoBounds.x + nekoBounds.w + pad &&
    localY >= nekoBounds.y - pad &&
    localY <= nekoBounds.y + nekoBounds.h + pad
  );
}

function pollCursor() {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  const point = screen.getCursorScreenPoint();
  const [winX, winY] = mainWindow.getPosition();
  const localX = point.x - winX;
  const localY = point.y - winY;

  sendToNeko("neko:cursor", { x: localX, y: localY });

  const overNeko = pointInNeko(localX, localY);
  setMouseIgnore(!(forceInteractive || overNeko));
}

function startCursorPoll() {
  stopCursorPoll();
  cursorPollTimer = setInterval(pollCursor, CURSOR_POLL_MS);
}

function stopCursorPoll() {
  if (cursorPollTimer) {
    clearInterval(cursorPollTimer);
    cursorPollTimer = null;
  }
}

function showWaterNotification() {
  if (!Notification.isSupported()) return;
  const notification = new Notification({
    title: "Pink Neko",
    body: "Time to drink water!",
    silent: false,
  });
  notification.show();
}

function triggerWaterReminder() {
  if (paused) return;
  sendToNeko("neko:water");
  showWaterNotification();
}

function clearReminderTimer() {
  if (reminderTimer) {
    clearInterval(reminderTimer);
    reminderTimer = null;
  }
}

function scheduleReminders() {
  clearReminderTimer();
  reminderTimer = setInterval(triggerWaterReminder, reminderIntervalMs);
}

function setPaused(next) {
  paused = next;
  sendToNeko("neko:pause", { paused });
  buildTrayMenu();
}

function setReminderMinutes(minutes) {
  reminderIntervalMs = minutes * 60 * 1000;
  scheduleReminders();
  buildTrayMenu();
}

function buildTrayMenu() {
  if (!tray) return;

  const intervalMinutes = Math.round(reminderIntervalMs / 60000);
  const template = [
    { label: "Pink Neko", enabled: false },
    { type: "separator" },
    {
      label: paused ? "Resume neko" : "Pause neko",
      click: () => setPaused(!paused),
    },
    {
      label: "Drink now",
      click: () => triggerWaterReminder(),
    },
    { type: "separator" },
    {
      label: "Water every…",
      submenu: [30, 45, 60].map((mins) => ({
        label: `${mins} minutes`,
        type: "radio",
        checked: intervalMinutes === mins,
        click: () => setReminderMinutes(mins),
      })),
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        clearReminderTimer();
        stopCursorPoll();
        app.quit();
      },
    },
  ];

  trayMenu = Menu.buildFromTemplate(template);
  tray.setContextMenu(trayMenu);
  tray.setToolTip(
    paused
      ? "Pink Neko (paused) — click for menu"
      : `Pink Neko · water every ${intervalMinutes}m — click for menu`
  );
}

function createTray() {
  tray = new Tray(createTrayIcon());
  buildTrayMenu();

  // Windows: left-click often does nothing unless we open the menu ourselves
  const popup = () => {
    if (trayMenu) tray.popUpContextMenu(trayMenu);
  };
  tray.on("click", popup);
  tray.on("right-click", popup);
  tray.on("double-click", () => triggerWaterReminder());
}

app.setAppUserModelId("com.neko-window.pink-neko");

app.whenReady().then(() => {
  createWindow();
  createTray();
  scheduleReminders();
  startCursorPoll();

  ipcMain.on("neko:bounds", (_event, bounds) => {
    if (bounds && typeof bounds.x === "number") {
      nekoBounds = bounds;
    }
  });

  ipcMain.on("neko:interactive", (_event, active) => {
    forceInteractive = !!active;
    if (forceInteractive) setMouseIgnore(false);
  });

  ipcMain.on("neko:set-click-through", (_event, ignore) => {
    // Kept for compatibility; main poll owns click-through now
    if (!forceInteractive) setMouseIgnore(!!ignore);
  });
});

app.on("window-all-closed", (e) => {
  e.preventDefault();
});

app.on("before-quit", () => {
  clearReminderTimer();
  stopCursorPoll();
});
