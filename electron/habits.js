/** Daily study/career habit reminders — loaded from habits.json. */
const fs = require("fs");
const path = require("path");

const DEFAULT_HABITS = [
  {
    id: "grind75",
    label: "Grind 75",
    hour: 10,
    minute: 0,
    url: "https://www.techinterviewhandbook.org/grind75",
    message: "Grind 75 — opened your practice site!",
  },
  {
    id: "jobs",
    label: "Apply for jobs",
    hour: 13,
    minute: 0,
    url: "https://www.linkedin.com/jobs/",
    message: "Job apps — opened LinkedIn Jobs!",
  },
  {
    id: "hsk3",
    label: "HSK 3 study",
    hour: 17,
    minute: 0,
    url: "https://www.dong-chinese.com/",
    message: "HSK 3 — opened your Chinese study site!",
  },
  {
    id: "aws",
    label: "AWS SAA study",
    hour: 20,
    minute: 0,
    url: "https://learn.cantrill.io/",
    message: "AWS SAA — opened your study site!",
  },
];

/** @type {typeof DEFAULT_HABITS} */
let HABITS = DEFAULT_HABITS.map((h) => ({ ...h }));
let openBrowser = true;
let systemNotifications = false;

function isHttpUrl(value) {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    const u = new URL(value.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeHabitEntry(raw, fallback) {
  const base = fallback ? { ...fallback } : {};
  const id = typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : base.id;
  if (!id) return null;
  const hour = Number.isFinite(raw.hour) ? Math.min(23, Math.max(0, Math.floor(raw.hour))) : base.hour ?? 9;
  const minute = Number.isFinite(raw.minute)
    ? Math.min(59, Math.max(0, Math.floor(raw.minute)))
    : base.minute ?? 0;
  const url = isHttpUrl(raw.url) ? raw.url.trim() : base.url || null;
  return {
    id,
    label: typeof raw.label === "string" && raw.label.trim() ? raw.label.trim() : base.label || id,
    hour,
    minute,
    url,
    message:
      typeof raw.message === "string" && raw.message.trim()
        ? raw.message.trim()
        : base.message || `${base.label || id} time!`,
  };
}

function applyConfig(raw) {
  openBrowser = raw.openBrowser !== false;
  systemNotifications = !!raw.systemNotifications;

  if (!Array.isArray(raw.habits) || raw.habits.length === 0) {
    HABITS = DEFAULT_HABITS.map((h) => ({ ...h }));
    return;
  }

  const byId = new Map(DEFAULT_HABITS.map((h) => [h.id, h]));
  const seen = new Set();
  const next = [];
  for (const item of raw.habits) {
    if (!item || typeof item !== "object") continue;
    const normalized = normalizeHabitEntry(item, byId.get(item.id));
    if (!normalized || seen.has(normalized.id)) continue;
    seen.add(normalized.id);
    next.push(normalized);
  }
  HABITS = next.length ? next : DEFAULT_HABITS.map((h) => ({ ...h }));
}

function loadHabitsConfig(extraPaths = []) {
  const candidates = [
    ...extraPaths,
    path.join(__dirname, "..", "habits.json"),
  ].filter(Boolean);

  for (const file of candidates) {
    try {
      if (!fs.existsSync(file)) continue;
      const raw = JSON.parse(fs.readFileSync(file, "utf8"));
      applyConfig(raw && typeof raw === "object" ? raw : {});
      return file;
    } catch (err) {
      console.error("[doraemon] Failed to load habits config:", file, err.message);
    }
  }

  HABITS = DEFAULT_HABITS.map((h) => ({ ...h }));
  openBrowser = true;
  systemNotifications = false;
  return null;
}

// Load project habits.json on require
loadHabitsConfig();

function getHabits() {
  return HABITS;
}

function getHabitOptions() {
  return { openBrowser, systemNotifications };
}

function defaultHabitState() {
  const done = {};
  const enabled = {};
  const reminded = {};
  for (const h of HABITS) {
    done[h.id] = null;
    enabled[h.id] = true;
    reminded[h.id] = null;
  }
  return { done, enabled, reminded };
}

function normalizeHabitState(raw) {
  const base = defaultHabitState();
  if (!raw || typeof raw !== "object") return base;
  for (const h of HABITS) {
    if (typeof raw.done?.[h.id] === "string") base.done[h.id] = raw.done[h.id];
    if (typeof raw.enabled?.[h.id] === "boolean") base.enabled[h.id] = raw.enabled[h.id];
    if (typeof raw.reminded?.[h.id] === "string") base.reminded[h.id] = raw.reminded[h.id];
  }
  return base;
}

function todayAt(hour, minute, day = new Date()) {
  const d = new Date(day);
  d.setHours(hour, minute, 0, 0);
  return d.getTime();
}

/**
 * Next habit that still needs its once-daily remind (not done, not yet reminded today).
 * Overdue habits fire once soon after launch, then wait until tomorrow unless done via tray.
 */
function nextHabitDue(state, dayKey, now = Date.now()) {
  const today = dayKey(now);
  let soonest = null;
  let habit = null;
  let overdue = false;

  HABITS.forEach((h, index) => {
    if (!state.enabled[h.id]) return;
    if (state.done[h.id] === today) return;
    if (state.reminded[h.id] === today) return;

    let at = todayAt(h.hour, h.minute, new Date(now));
    let isOverdue = false;
    if (at <= now) {
      at = now + 15_000 + index * 20_000;
      isOverdue = true;
    }

    if (soonest == null || at < soonest) {
      soonest = at;
      habit = h;
      overdue = isOverdue;
    }
  });

  if (!habit) {
    overdue = false;
    HABITS.forEach((h) => {
      if (!state.enabled[h.id]) return;
      const at = todayAt(h.hour, h.minute, new Date(now)) + 24 * 60 * 60 * 1000;
      if (soonest == null || at < soonest) {
        soonest = at;
        habit = h;
      }
    });
  }

  return habit && soonest != null ? { habit, at: soonest, overdue } : null;
}

function habitsDoneCount(state, dayKey, now = Date.now()) {
  const today = dayKey(now);
  let done = 0;
  let total = 0;
  for (const h of HABITS) {
    if (!state.enabled[h.id]) continue;
    total += 1;
    if (state.done[h.id] === today) done += 1;
  }
  return { done, total };
}

module.exports = {
  get HABITS() {
    return HABITS;
  },
  getHabits,
  getHabitOptions,
  loadHabitsConfig,
  defaultHabitState,
  normalizeHabitState,
  nextHabitDue,
  habitsDoneCount,
  todayAt,
};
