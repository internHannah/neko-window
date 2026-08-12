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
let nekoBounds = { x: 0, y: 0, w: 128, h: 128 };
let forceInteractive = false;
let ignoringMouse = true;
let lastCursor = { x: Number.NaN, y: Number.NaN };

function createTrayIcon() {
  const candidates = [
    path.join(__dirname, "..", "assets", "dora-sprites", "icon.png"),
    path.join(__dirname, "..", "assets", "tray.png"),
  ];

  for (const iconPath of candidates) {
    const icon = nativeImage.createFromPath(iconPath);
    if (!icon.isEmpty()) return icon.resize({ width: 16, height: 16 });
  }

  const size = 32;
  const buf = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    buf[i * 4] = 43;
    buf[i * 4 + 1] = 127;
    buf[i * 4 + 2] = 255;
    buf[i * 4 + 3] = 255;
  }
  return nativeImage
    .createFromBuffer(buf, { width: size, height: size })
    .resize({ width: 16, height: 16 });
}

function fitWindowToDisplay() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const { x, y, width, height } = screen.getPrimaryDisplay().bounds;
  mainWindow.setBounds({ x, y, width, height });
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
      sandbox: true,
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

  if (localX !== lastCursor.x || localY !== lastCursor.y) {
    lastCursor = { x: localX, y: localY };
    sendToNeko("neko:cursor", lastCursor);
  }

  setMouseIgnore(!(forceInteractive || pointInNeko(localX, localY)));
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
  new Notification({
    title: "Doraemon",
    body: "Time to drink water!",
    silent: false,
  }).show();
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
    { label: "Doraemon", enabled: false },
    { type: "separator" },
    {
      label: paused ? "Resume" : "Pause",
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
      click: () => app.quit(),
    },
  ];

  trayMenu = Menu.buildFromTemplate(template);
  tray.setContextMenu(trayMenu);
  tray.setToolTip(
    paused
      ? "Doraemon (paused) — click for menu"
      : `Doraemon · water every ${intervalMinutes}m — click for menu`
  );
}

function createTray() {
  tray = new Tray(createTrayIcon());
  buildTrayMenu();

  const popup = () => {
    if (trayMenu) tray.popUpContextMenu(trayMenu);
  };
  tray.on("click", popup);
  tray.on("right-click", popup);
  tray.on("double-click", () => triggerWaterReminder());
}

function registerIpc() {
  ipcMain.on("neko:bounds", (_event, bounds) => {
    if (
      bounds &&
      Number.isFinite(bounds.x) &&
      Number.isFinite(bounds.y) &&
      Number.isFinite(bounds.w) &&
      Number.isFinite(bounds.h)
    ) {
      nekoBounds = {
        x: bounds.x,
        y: bounds.y,
        w: Math.max(1, bounds.w),
        h: Math.max(1, bounds.h),
      };
    }
  });

  ipcMain.on("neko:interactive", (_event, active) => {
    forceInteractive = !!active;
    if (forceInteractive) setMouseIgnore(false);
  });

  ipcMain.on("neko:set-click-through", (_event, ignore) => {
    if (!forceInteractive) setMouseIgnore(!!ignore);
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
    }
  });

  app.setAppUserModelId("com.neko-window.doraemon");

  app.whenReady().then(() => {
    createWindow();
    createTray();
    scheduleReminders();
    startCursorPoll();
    registerIpc();

    screen.on("display-metrics-changed", fitWindowToDisplay);
    screen.on("display-added", fitWindowToDisplay);
    screen.on("display-removed", fitWindowToDisplay);
  });

  app.on("window-all-closed", (e) => {
    e.preventDefault();
  });

  app.on("before-quit", () => {
    clearReminderTimer();
    stopCursorPoll();
    if (tray) {
      tray.destroy();
      tray = null;
    }
  });
}
