const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  Notification,
  ipcMain,
  screen,
  globalShortcut,
  powerMonitor,
  shell,
} = require("electron");
const fs = require("fs");
const path = require("path");
const {
  getHabits,
  getHabitOptions,
  loadHabitsConfig,
  defaultHabitState,
  normalizeHabitState,
  nextHabitDue,
  habitsDoneCount,
} = require("./habits");

const DEFAULT_INTERVAL_MS = 45 * 60 * 1000;
const CURSOR_POLL_MS = 32;
const TOOLTIP_REFRESH_MS = 30_000;
const DISPLAY_SWITCH_MS = 350;
const USER_IDLE_MS = 2 * 60 * 1000;

let mainWindow = null;
let tray = null;
let trayMenu = null;
let paused = false;
let hidden = false;
let muted = false;
let quietHours = false;
let openAtLogin = false;
let animSpeed = "normal"; // slow | normal | fast
let sizeMode = "normal"; // small | normal | large
let followMode = false;
let bestStreak = 0;
let lastDrinkAt = 0;
let drinkStreak = 0;
let lastDrinkDay = null;
let drinksToday = 0;
let drinksDay = null;
let reminderIntervalMs = DEFAULT_INTERVAL_MS;
let reminderTimer = null;
let tooltipTimer = null;
let nextReminderAt = 0;
let lastWaterNudgeAt = 0;
let cursorPollTimer = null;
let nekoBounds = { x: 0, y: 0, w: 128, h: 128 };
let savedSpawn = null;
let hasBounds = false;
let lastDisplayId = null;
let pendingDisplayId = null;
let displaySwitchAt = 0;
let lastCursorMoveAt = 0;
let userIdle = false;
let forceInteractive = false;
let ignoringMouse = true;
let lastCursor = { x: Number.NaN, y: Number.NaN };
let settingsPath = null;
let suspended = false;
let habitState = defaultHabitState();
let habitTimer = null;
let nextHabitAt = 0;
let pendingHabitId = null;

function defaultSettings() {
  return {
    reminderMinutes: 45,
    muted: false,
    quietHours: false,
    openAtLogin: false,
    hidden: false,
    paused: false,
    animSpeed: "normal",
    lastDrinkAt: 0,
    drinkStreak: 0,
    lastDrinkDay: null,
    drinksToday: 0,
    drinksDay: null,
    bestStreak: 0,
    sizeMode: "normal",
    followMode: false,
    lastX: null,
    lastY: null,
    lastDisplayId: null,
    habits: defaultHabitState(),
  };
}

function loadSettings() {
  const defaults = defaultSettings();
  try {
    if (!settingsPath || !fs.existsSync(settingsPath)) return defaults;
    const raw = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    const speed = ["slow", "normal", "fast"].includes(raw.animSpeed)
      ? raw.animSpeed
      : defaults.animSpeed;
    return {
      reminderMinutes: [30, 45, 60].includes(raw.reminderMinutes)
        ? raw.reminderMinutes
        : defaults.reminderMinutes,
      muted: !!raw.muted,
      quietHours: !!raw.quietHours,
      openAtLogin: !!raw.openAtLogin,
      hidden: !!raw.hidden,
      paused: !!raw.paused,
      animSpeed: speed,
      lastDrinkAt: Number.isFinite(raw.lastDrinkAt) ? raw.lastDrinkAt : 0,
      drinkStreak: Number.isFinite(raw.drinkStreak) ? raw.drinkStreak : 0,
      lastDrinkDay: typeof raw.lastDrinkDay === "string" ? raw.lastDrinkDay : null,
      drinksToday: Number.isFinite(raw.drinksToday) ? raw.drinksToday : 0,
      drinksDay: typeof raw.drinksDay === "string" ? raw.drinksDay : null,
      bestStreak: Number.isFinite(raw.bestStreak) ? raw.bestStreak : 0,
      sizeMode: ["small", "normal", "large"].includes(raw.sizeMode)
        ? raw.sizeMode
        : defaults.sizeMode,
      followMode: !!raw.followMode,
      lastX: Number.isFinite(raw.lastX) ? raw.lastX : null,
      lastY: Number.isFinite(raw.lastY) ? raw.lastY : null,
      lastDisplayId: Number.isFinite(raw.lastDisplayId) ? raw.lastDisplayId : null,
      habits: normalizeHabitState(raw.habits),
    };
  } catch {
    return defaults;
  }
}

function saveSettings() {
  if (!settingsPath) return;
  try {
    const payload = JSON.stringify(
      {
        reminderMinutes: Math.round(reminderIntervalMs / 60000),
        muted,
        quietHours,
        openAtLogin,
        hidden,
        paused,
        animSpeed,
        lastDrinkAt,
        drinkStreak,
        lastDrinkDay,
        drinksToday,
        drinksDay,
        bestStreak,
        sizeMode,
        followMode,
        lastX: hasBounds ? Math.round(nekoBounds.x) : null,
        lastY: hasBounds ? Math.round(nekoBounds.y) : null,
        lastDisplayId: lastDisplayId,
        habits: habitState,
      },
      null,
      2
    );
    const tmp = `${settingsPath}.tmp`;
    fs.writeFileSync(tmp, payload, "utf8");
    fs.copyFileSync(tmp, settingsPath);
    fs.unlinkSync(tmp);
  } catch (err) {
    console.error("[doraemon] Failed to save settings:", err.message);
  }
}

function applyOpenAtLogin(enabled) {
  openAtLogin = enabled;
  try {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      openAsHidden: false,
      path: process.execPath,
      args: [],
    });
  } catch (err) {
    console.error("[doraemon] Login item failed:", err.message);
  }
}

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

function resolveDisplay() {
  if (lastDisplayId != null) {
    const found = screen.getAllDisplays().find((d) => d.id === lastDisplayId);
    if (found) return found;
  }
  return screen.getPrimaryDisplay();
}

function getWorkInsets(display = resolveDisplay()) {
  const b = display.bounds;
  const w = display.workArea;
  return {
    top: Math.max(0, w.y - b.y),
    left: Math.max(0, w.x - b.x),
    right: Math.max(0, b.x + b.width - (w.x + w.width)),
    bottom: Math.max(0, b.y + b.height - (w.y + w.height)),
  };
}

function sendWorkInsets(display) {
  sendToNeko("neko:insets", getWorkInsets(display || resolveDisplay()));
}

function fitWindowToDisplay(display) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const target = display || resolveDisplay();
  const { x, y, width, height } = target.bounds;
  lastDisplayId = target.id;
  mainWindow.setBounds({ x, y, width, height });
  sendWorkInsets(target);
}

function adoptDisplay(display) {
  if (!display) return;
  const changed = lastDisplayId !== display.id;
  lastDisplayId = display.id;
  pendingDisplayId = null;
  fitWindowToDisplay(display);
  if (changed) saveSettings();
}

function createWindow() {
  const display = resolveDisplay();
  const { x, y, width, height } = display.bounds;
  lastDisplayId = display.id;

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
    focusable: false,
    show: false,
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
  mainWindow.webContents.setBackgroundThrottling(false);
  mainWindow.loadFile(path.join(__dirname, "..", "src", "index.html"));

  mainWindow.webContents.on("did-finish-load", () => {
    sendWorkInsets();
    sendToNeko("neko:pause", { paused });
    sendAnimSpeed();
    sendSizeMode();
    sendFollowMode();
    sendThirst();
    sendToNeko("neko:spawn", savedSpawn);
    if (!hidden) mainWindow.showInactive();
  });

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    console.error("[doraemon] Renderer gone:", details.reason);
    if (details.reason === "clean-exit") return;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.reload();
    }
  });

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
  if (!mainWindow || mainWindow.isDestroyed() || hidden) return;

  const point = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(point);
  if (display.id !== lastDisplayId) {
    if (pendingDisplayId !== display.id) {
      pendingDisplayId = display.id;
      displaySwitchAt = Date.now();
    } else if (Date.now() - displaySwitchAt >= DISPLAY_SWITCH_MS) {
      adoptDisplay(display);
    }
  } else {
    pendingDisplayId = null;
  }

  const [winX, winY] = mainWindow.getPosition();
  const localX = point.x - winX;
  const localY = point.y - winY;

  if (localX !== lastCursor.x || localY !== lastCursor.y) {
    lastCursor = { x: localX, y: localY };
    lastCursorMoveAt = Date.now();
    sendToNeko("neko:cursor", lastCursor);
    if (userIdle) {
      userIdle = false;
      sendToNeko("neko:idle", { idle: false });
    }
  } else if (!userIdle && lastCursorMoveAt && Date.now() - lastCursorMoveAt >= USER_IDLE_MS) {
    userIdle = true;
    sendToNeko("neko:idle", { idle: true });
  }

  setMouseIgnore(!(forceInteractive || pointInNeko(localX, localY)));
}

function startCursorPoll() {
  stopCursorPoll();
  const ms = paused ? CURSOR_POLL_MS * 4 : CURSOR_POLL_MS;
  cursorPollTimer = setInterval(pollCursor, ms);
}

function stopCursorPoll() {
  if (cursorPollTimer) {
    clearInterval(cursorPollTimer);
    cursorPollTimer = null;
  }
}

function formatCountdown(ms) {
  if (ms <= 0) return "now";
  const totalMin = Math.ceil(ms / 60000);
  if (totalMin < 60) return `${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function isQuietHourNow() {
  if (!quietHours) return false;
  const hour = new Date().getHours();
  return hour >= 22 || hour < 8;
}

function updateTrayTooltip() {
  if (!tray) return;
  const intervalMinutes = Math.round(reminderIntervalMs / 60000);
  if (paused) {
    tray.setToolTip("Doraemon (paused) · Ctrl+Shift+P");
    return;
  }
  if (hidden) {
    tray.setToolTip("Doraemon (hidden) — click for menu");
    return;
  }
  const remaining = nextReminderAt - Date.now();
  const { done, total } = habitsDoneCount(habitState, dayKey);
  const goals = total ? `goals ${done}/${total}` : null;
  const flags = [
    muted ? "muted" : null,
    isQuietHourNow() ? "quiet hours" : null,
    followMode ? "follow" : null,
    goals,
  ]
    .filter(Boolean)
    .join(", ");
  tray.setToolTip(
    flags
      ? `Doraemon · drink in ${formatCountdown(remaining)} (${flags})`
      : `Doraemon · drink in ${formatCountdown(remaining)} · every ${intervalMinutes}m`
  );
}

function showWaterNotification() {
  if (muted || isQuietHourNow() || !Notification.isSupported()) return;
  const iconPath = path.join(__dirname, "..", "assets", "dora-sprites", "icon.png");
  const notification = new Notification({
    title: "Doraemon",
    body: "Time to drink water! (Click to show me)",
    silent: false,
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
  });
  notification.on("click", () => {
    setHidden(false);
  });
  notification.show();
}

function triggerWaterReminder({ fromTray = false, silent = false } = {}) {
  if (suspended) return;
  if (paused && !fromTray) return;
  if (hidden) setHidden(false);
  lastWaterNudgeAt = Date.now();
  sendToNeko("neko:water");
  if (!silent) showWaterNotification();
  scheduleReminders(reminderIntervalMs);
}

function maybeNudgeWater() {
  if (paused || suspended || hidden) return;
  const level = thirstLevel();
  if (level < 1) return;
  const gap = level >= 2 ? 90_000 : 180_000;
  if (Date.now() - lastWaterNudgeAt < gap) return;
  lastWaterNudgeAt = Date.now();
  sendToNeko("neko:water");
}

function clearReminderTimer() {
  if (reminderTimer) {
    clearTimeout(reminderTimer);
    reminderTimer = null;
  }
}

function scheduleReminders(delayMs = reminderIntervalMs) {
  clearReminderTimer();
  const delay = Math.max(5_000, delayMs);
  nextReminderAt = Date.now() + delay;
  reminderTimer = setTimeout(() => {
    triggerWaterReminder();
  }, delay);
  updateTrayTooltip();
  sendThirst();
  buildTrayMenu();
}

function dayKey(ts = Date.now()) {
  const d = new Date(ts);
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function yesterdayKey() {
  return dayKey(Date.now() - 24 * 60 * 60 * 1000);
}

function formatLastDrink() {
  if (!lastDrinkAt) return "never";
  const mins = Math.round((Date.now() - lastDrinkAt) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function ensureDrinksToday() {
  const today = dayKey();
  if (drinksDay !== today) {
    drinksDay = today;
    drinksToday = 0;
  }
}

function thirstLevel() {
  if (paused || muted) return 0;
  if (!lastDrinkAt) {
    if (!nextReminderAt || Date.now() < nextReminderAt) return 0;
    return 1;
  }
  const since = Date.now() - lastDrinkAt;
  if (since >= reminderIntervalMs * 1.5) return 2;
  if (since >= reminderIntervalMs) return 1;
  return 0;
}

function sendThirst() {
  sendToNeko("neko:thirst", { level: thirstLevel() });
}

function markDrankWater() {
  lastDrinkAt = Date.now();
  const today = dayKey();
  ensureDrinksToday();
  drinksToday += 1;
  let milestone = false;
  if (lastDrinkDay !== today) {
    drinkStreak = lastDrinkDay === yesterdayKey() ? drinkStreak + 1 : 1;
    lastDrinkDay = today;
    milestone = [3, 7, 14, 30].includes(drinkStreak);
  }
  if (drinkStreak > bestStreak) bestStreak = drinkStreak;
  scheduleReminders();
  saveSettings();
  sendToNeko("neko:drank", {
    at: lastDrinkAt,
    streak: drinkStreak,
    today: drinksToday,
    best: bestStreak,
    milestone,
  });
  sendThirst();
  buildTrayMenu();
}

function snoozeReminders(minutes = 10) {
  scheduleReminders(minutes * 60 * 1000);
}

function sendAnimSpeed() {
  const map = { slow: 0.7, normal: 1, fast: 1.45 };
  sendToNeko("neko:speed", { multiplier: map[animSpeed] || 1, mode: animSpeed });
}

function sendSizeMode() {
  sendToNeko("neko:size", { mode: sizeMode });
}

function sendFollowMode() {
  sendToNeko("neko:follow", { enabled: followMode });
}

function setAnimSpeed(mode) {
  if (!["slow", "normal", "fast"].includes(mode)) return;
  animSpeed = mode;
  sendAnimSpeed();
  buildTrayMenu();
  saveSettings();
}

function setSizeMode(mode) {
  if (!["small", "normal", "large"].includes(mode)) return;
  sizeMode = mode;
  sendSizeMode();
  buildTrayMenu();
  saveSettings();
}

function setFollowMode(next) {
  followMode = !!next;
  sendFollowMode();
  buildTrayMenu();
  saveSettings();
  updateTrayTooltip();
}

function recallCompanion() {
  if (hidden) setHidden(false);
  sendToNeko("neko:recall");
}

function setPaused(next) {
  paused = next;
  sendToNeko("neko:pause", { paused });
  if (!paused) {
    scheduleReminders();
    scheduleHabits();
  } else updateTrayTooltip();
  if (!hidden) startCursorPoll();
  buildTrayMenu();
  saveSettings();
}

function setHidden(next) {
  hidden = next;
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (hidden) {
    mainWindow.hide();
    setMouseIgnore(true);
    stopCursorPoll();
    mainWindow.webContents.setBackgroundThrottling(true);
  } else {
    mainWindow.webContents.setBackgroundThrottling(false);
    mainWindow.showInactive();
    fitWindowToDisplay();
    startCursorPoll();
  }
  buildTrayMenu();
  updateTrayTooltip();
  saveSettings();
}

function setMuted(next) {
  muted = next;
  buildTrayMenu();
  updateTrayTooltip();
  saveSettings();
}

function setQuietHours(next) {
  quietHours = next;
  buildTrayMenu();
  updateTrayTooltip();
  saveSettings();
}

function setReminderMinutes(minutes) {
  reminderIntervalMs = minutes * 60 * 1000;
  scheduleReminders();
  saveSettings();
}

function clearHabitTimer() {
  if (habitTimer) {
    clearTimeout(habitTimer);
    habitTimer = null;
  }
}

function showHabitNotification(habit) {
  const opts = getHabitOptions();
  if (!opts.systemNotifications) return;
  if (muted || isQuietHourNow() || !Notification.isSupported()) return;
  const iconPath = path.join(__dirname, "..", "assets", "dora-sprites", "icon.png");
  const notification = new Notification({
    title: "Doraemon · Daily goal",
    body: habit.message || habit.label,
    silent: false,
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
  });
  notification.on("click", () => setHidden(false));
  notification.show();
}

async function openHabitSite(habit) {
  const opts = getHabitOptions();
  if (!opts.openBrowser || !habit?.url) return false;
  try {
    await shell.openExternal(habit.url);
    return true;
  } catch (err) {
    console.error("[doraemon] Failed to open habit URL:", habit.url, err.message);
    return false;
  }
}

function triggerHabitReminder(habit, { fromTray = false, reopen = false, openSite = true } = {}) {
  if (!habit) return;
  if (suspended) return;
  if (paused && !fromTray) return;
  if (hidden) setHidden(false);

  const today = dayKey();
  if (!reopen && habitState.reminded[habit.id] === today && !fromTray) {
    scheduleHabits();
    return;
  }

  habitState.reminded[habit.id] = today;
  pendingHabitId = habit.id;
  saveSettings();

  const shouldOpen = reopen || fromTray || openSite;
  const opener = shouldOpen ? openHabitSite(habit) : Promise.resolve(false);
  opener.then((opened) => {
    sendToNeko("neko:habit", {
      id: habit.id,
      label: habit.label,
      message: opened
        ? habit.message || `${habit.label} — site opened!`
        : `${habit.label} — click me when done`,
      url: habit.url || null,
      opened,
    });
  });

  showHabitNotification(habit);
  scheduleHabits();
  buildTrayMenu();
}

function markHabitDone(id) {
  const habit = getHabits().find((h) => h.id === id);
  if (!habit) return;
  habitState.done[id] = dayKey();
  habitState.reminded[id] = dayKey();
  if (pendingHabitId === id) pendingHabitId = null;
  saveSettings();
  sendToNeko("neko:habit-done", { id, label: habit.label });
  scheduleHabits();
  buildTrayMenu();
  updateTrayTooltip();
}

function setHabitEnabled(id, enabled) {
  if (!Object.prototype.hasOwnProperty.call(habitState.enabled, id)) return;
  habitState.enabled[id] = !!enabled;
  saveSettings();
  scheduleHabits();
  buildTrayMenu();
}

function scheduleHabits() {
  clearHabitTimer();
  const next = nextHabitDue(habitState, dayKey);
  if (!next) {
    nextHabitAt = 0;
    return;
  }
  nextHabitAt = next.at;
  const delay = Math.max(2_000, next.at - Date.now());
  habitTimer = setTimeout(() => {
    const today = dayKey();
    if (habitState.done[next.habit.id] === today) {
      scheduleHabits();
      return;
    }
    triggerHabitReminder(next.habit, { openSite: !next.overdue });
  }, delay);
  updateTrayTooltip();
}

function buildTrayMenu() {
  if (!tray) return;

  const intervalMinutes = Math.round(reminderIntervalMs / 60000);
  const template = [
    { label: "Doraemon", enabled: false },
    {
      label: paused
        ? "Paused"
        : `Next drink in ${formatCountdown(nextReminderAt - Date.now())}`,
      enabled: false,
    },
    {
      label: `Last drink: ${formatLastDrink()}`,
      enabled: false,
    },
    {
      label: drinkStreak > 0 ? `Streak: ${drinkStreak} day${drinkStreak === 1 ? "" : "s"}` : "Streak: start today!",
      enabled: false,
    },
    {
      label: bestStreak > 0 ? `Best streak: ${bestStreak} day${bestStreak === 1 ? "" : "s"}` : "Best streak: —",
      enabled: false,
    },
    {
      label: `Today: ${drinksToday} drink${drinksToday === 1 ? "" : "s"}`,
      enabled: false,
    },
    { type: "separator" },
    {
      label: paused ? "Resume" : "Pause",
      accelerator: "CmdOrCtrl+Shift+P",
      click: () => setPaused(!paused),
    },
    {
      label: hidden ? "Show companion" : "Hide companion",
      click: () => setHidden(!hidden),
    },
    {
      label: "Come here",
      accelerator: "CmdOrCtrl+Shift+H",
      click: () => recallCompanion(),
    },
    {
      label: "Follow cursor",
      type: "checkbox",
      checked: followMode,
      accelerator: "CmdOrCtrl+Shift+F",
      click: (item) => setFollowMode(item.checked),
    },
    {
      label: "Drink now",
      accelerator: "CmdOrCtrl+Shift+D",
      click: () => triggerWaterReminder({ fromTray: true }),
    },
    {
      label: "I drank water ✓",
      click: () => markDrankWater(),
    },
    {
      label: "Snooze 10 minutes",
      accelerator: "CmdOrCtrl+Shift+S",
      click: () => snoozeReminders(10),
    },
    {
      label: (() => {
        const { done, total } = habitsDoneCount(habitState, dayKey);
        return `Daily goals (${done}/${total})`;
      })(),
      submenu: [
        ...getHabits().map((h) => {
          const today = dayKey();
          const done = habitState.done[h.id] === today;
          return {
            label: done ? `✓ ${h.label}` : h.label,
            type: "checkbox",
            checked: done,
            enabled: habitState.enabled[h.id],
            click: () => {
              if (habitState.done[h.id] === dayKey()) {
                habitState.done[h.id] = null;
                habitState.reminded[h.id] = null;
                saveSettings();
                scheduleHabits();
                buildTrayMenu();
              } else {
                markHabitDone(h.id);
              }
            },
          };
        }),
        { type: "separator" },
        ...getHabits().map((h) => ({
          label: `Open: ${h.label}`,
          click: () => triggerHabitReminder(h, { fromTray: true, reopen: true }),
        })),
        { type: "separator" },
        ...getHabits().map((h) => ({
          label: `Enable ${h.label}`,
          type: "checkbox",
          checked: habitState.enabled[h.id],
          click: (item) => setHabitEnabled(h.id, item.checked),
        })),
      ],
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
    {
      label: "Animation speed",
      submenu: [
        { id: "slow", label: "Slow" },
        { id: "normal", label: "Normal" },
        { id: "fast", label: "Fast" },
      ].map((item) => ({
        label: item.label,
        type: "radio",
        checked: animSpeed === item.id,
        click: () => setAnimSpeed(item.id),
      })),
    },
    {
      label: "Size",
      submenu: [
        { id: "small", label: "Small" },
        { id: "normal", label: "Normal" },
        { id: "large", label: "Large" },
      ].map((item) => ({
        label: item.label,
        type: "radio",
        checked: sizeMode === item.id,
        click: () => setSizeMode(item.id),
      })),
    },
    {
      label: "Mute toast notifications",
      type: "checkbox",
      checked: muted,
      click: (item) => setMuted(item.checked),
    },
    {
      label: "Quiet hours (10pm–8am)",
      type: "checkbox",
      checked: quietHours,
      click: (item) => setQuietHours(item.checked),
    },
    {
      label: "Start with Windows",
      type: "checkbox",
      checked: openAtLogin,
      click: (item) => {
        applyOpenAtLogin(item.checked);
        saveSettings();
        buildTrayMenu();
      },
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => app.quit(),
    },
  ];

  trayMenu = Menu.buildFromTemplate(template);
  tray.setContextMenu(trayMenu);
  updateTrayTooltip();
}

function createTray() {
  tray = new Tray(createTrayIcon());
  buildTrayMenu();

  const popup = () => {
    buildTrayMenu();
    if (trayMenu) tray.popUpContextMenu(trayMenu);
  };
  tray.on("click", popup);
  tray.on("right-click", popup);
  tray.on("double-click", () => triggerWaterReminder({ fromTray: true }));
}

function startTooltipRefresh() {
  if (tooltipTimer) clearInterval(tooltipTimer);
  tooltipTimer = setInterval(() => {
    updateTrayTooltip();
    sendThirst();
    ensureDrinksToday();
    maybeNudgeWater();
  }, TOOLTIP_REFRESH_MS);
}

function registerShortcuts() {
  try {
    globalShortcut.register("CommandOrControl+Shift+D", () => {
      triggerWaterReminder({ fromTray: true });
    });
    globalShortcut.register("CommandOrControl+Shift+P", () => {
      setPaused(!paused);
    });
    globalShortcut.register("CommandOrControl+Shift+H", () => {
      recallCompanion();
    });
    globalShortcut.register("CommandOrControl+Shift+F", () => {
      setFollowMode(!followMode);
    });
    globalShortcut.register("CommandOrControl+Shift+S", () => {
      snoozeReminders(10);
    });
  } catch (err) {
    console.error("[doraemon] Shortcut registration failed:", err.message);
  }
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
      hasBounds = true;
    }
  });

  ipcMain.on("neko:interactive", (_event, active) => {
    forceInteractive = !!active;
    if (forceInteractive) setMouseIgnore(false);
  });

  ipcMain.on("neko:set-click-through", (_event, ignore) => {
    if (!forceInteractive) setMouseIgnore(!!ignore);
  });

  ipcMain.on("neko:snooze", (_event, minutes) => {
    const mins = Number.isFinite(minutes) ? minutes : 10;
    snoozeReminders(Math.max(1, Math.min(120, mins)));
  });

  ipcMain.on("neko:drank", () => {
    markDrankWater();
  });

  ipcMain.on("neko:habit-done", (_event, id) => {
    if (typeof id === "string") markHabitDone(id);
  });

  ipcMain.on("neko:menu", () => {
    buildTrayMenu();
    if (!tray || !trayMenu) return;
    tray.popUpContextMenu(trayMenu, screen.getCursorScreenPoint());
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    setHidden(false);
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.showInactive();
    }
  });

  app.setAppUserModelId("com.neko-window.doraemon");

  app.whenReady().then(() => {
    settingsPath = path.join(app.getPath("userData"), "settings.json");
    loadHabitsConfig([
      path.join(app.getPath("userData"), "habits.json"),
      path.join(__dirname, "..", "habits.json"),
    ]);
    const settings = loadSettings();
    reminderIntervalMs = settings.reminderMinutes * 60 * 1000;
    muted = settings.muted;
    quietHours = settings.quietHours;
    hidden = settings.hidden;
    paused = settings.paused;
    animSpeed = settings.animSpeed;
    lastDrinkAt = settings.lastDrinkAt;
    drinkStreak = settings.drinkStreak || 0;
    lastDrinkDay = settings.lastDrinkDay;
    drinksToday = settings.drinksToday || 0;
    drinksDay = settings.drinksDay;
    bestStreak = settings.bestStreak || 0;
    sizeMode = settings.sizeMode || "normal";
    followMode = !!settings.followMode;
    habitState = normalizeHabitState(settings.habits);
    if (lastDrinkDay && lastDrinkDay !== dayKey() && lastDrinkDay !== yesterdayKey()) {
      drinkStreak = 0;
    }
    if (drinkStreak > bestStreak) bestStreak = drinkStreak;
    ensureDrinksToday();
    if (Number.isFinite(settings.lastX) && Number.isFinite(settings.lastY)) {
      savedSpawn = { x: settings.lastX, y: settings.lastY };
      nekoBounds = { ...nekoBounds, x: settings.lastX, y: settings.lastY };
      hasBounds = true;
    }
    if (Number.isFinite(settings.lastDisplayId)) {
      lastDisplayId = settings.lastDisplayId;
    }
    applyOpenAtLogin(settings.openAtLogin);

    createWindow();
    createTray();
    if (paused) updateTrayTooltip();
    else scheduleReminders();
    scheduleHabits();
    startCursorPoll();
    startTooltipRefresh();
    registerIpc();
    registerShortcuts();
    lastCursorMoveAt = Date.now();

    powerMonitor.on("suspend", () => {
      suspended = true;
      clearReminderTimer();
    clearHabitTimer();
    });
    powerMonitor.on("resume", () => {
      suspended = false;
      if (!paused) {
      scheduleReminders(Math.min(reminderIntervalMs, 60_000));
      scheduleHabits();
    }
    });
    powerMonitor.on("lock-screen", () => {
      suspended = true;
      clearReminderTimer();
    clearHabitTimer();
    });
    powerMonitor.on("unlock-screen", () => {
      suspended = false;
      if (!paused) {
      scheduleReminders(Math.min(reminderIntervalMs, 60_000));
      scheduleHabits();
    }
    });

    screen.on("display-metrics-changed", fitWindowToDisplay);
    screen.on("display-added", fitWindowToDisplay);
    screen.on("display-removed", fitWindowToDisplay);
  });

  app.on("window-all-closed", (e) => {
    e.preventDefault();
  });

  app.on("will-quit", () => {
    globalShortcut.unregisterAll();
  });

  app.on("before-quit", () => {
    saveSettings();
    clearReminderTimer();
    clearHabitTimer();
    stopCursorPoll();
    if (tooltipTimer) {
      clearInterval(tooltipTimer);
      tooltipTimer = null;
    }
    if (tray) {
      tray.destroy();
      tray = null;
    }
  });
}
