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

let mainWindow = null;
let tray = null;
let paused = false;
let reminderIntervalMs = DEFAULT_INTERVAL_MS;
let reminderTimer = null;

function createTrayIcon() {
  const iconPath = path.join(__dirname, "..", "assets", "tray.png");
  const icon = nativeImage.createFromPath(iconPath);
  return icon.isEmpty() ? nativeImage.createEmpty() : icon;
}

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width,
    height,
    x: 0,
    y: 0,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    fullscreenable: false,
    hasShadow: false,
    focusable: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.setAlwaysOnTop(true, "screen-saver");
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  mainWindow.setIgnoreMouseEvents(true, { forward: true });
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
        app.quit();
      },
    },
  ];

  tray.setContextMenu(Menu.buildFromTemplate(template));
  tray.setToolTip(
    paused
      ? "Pink Neko (paused)"
      : `Pink Neko · water every ${intervalMinutes}m`
  );
}

function createTray() {
  tray = new Tray(createTrayIcon());
  buildTrayMenu();
}

app.setAppUserModelId("com.neko-window.pink-neko");

app.whenReady().then(() => {
  createWindow();
  createTray();
  scheduleReminders();

  ipcMain.on("neko:set-click-through", (_event, ignore) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setIgnoreMouseEvents(!!ignore, { forward: true });
    }
  });
});

app.on("window-all-closed", (e) => {
  e.preventDefault();
});

app.on("before-quit", () => {
  clearReminderTimer();
});
