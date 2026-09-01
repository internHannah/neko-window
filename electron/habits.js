/** Daily study/career habit reminders for Doraemon. */
const HABITS = [
  {
    id: "grind75",
    label: "Grind 75",
    hour: 10,
    minute: 0,
    message: "Grind 75 time! 💻",
    toast: "Time for Grind 75 (LeetCode).",
  },
  {
    id: "jobs",
    label: "Apply for jobs",
    hour: 13,
    minute: 0,
    message: "Job apps today! 📄",
    toast: "Send a few job applications.",
  },
  {
    id: "hsk3",
    label: "HSK 3 study",
    hour: 17,
    minute: 0,
    message: "HSK 3 study! 中文",
    toast: "Study HSK 3 Chinese.",
  },
  {
    id: "aws",
    label: "AWS SAA study",
    hour: 20,
    minute: 0,
    message: "AWS SAA study! ☁️",
    toast: "Study Ultimate AWS SAA Associate 2026.",
  },
];

function defaultHabitState() {
  const done = {};
  const enabled = {};
  for (const h of HABITS) {
    done[h.id] = null;
    enabled[h.id] = true;
  }
  return { done, enabled };
}

function normalizeHabitState(raw) {
  const base = defaultHabitState();
  if (!raw || typeof raw !== "object") return base;
  for (const h of HABITS) {
    if (typeof raw.done?.[h.id] === "string") base.done[h.id] = raw.done[h.id];
    if (typeof raw.enabled?.[h.id] === "boolean") base.enabled[h.id] = raw.enabled[h.id];
  }
  return base;
}

function todayAt(hour, minute, day = new Date()) {
  const d = new Date(day);
  d.setHours(hour, minute, 0, 0);
  return d.getTime();
}

/**
 * @param {{ done: Record<string, string|null>, enabled: Record<string, boolean> }} state
 * @param {(ts?: number) => string} dayKey
 */
function nextHabitDue(state, dayKey, now = Date.now()) {
  const today = dayKey(now);
  let soonest = null;
  let habit = null;

  HABITS.forEach((h, index) => {
    if (!state.enabled[h.id]) return;
    if (state.done[h.id] === today) return;

    let at = todayAt(h.hour, h.minute, new Date(now));
    if (at <= now) {
      // Overdue today — nudge soon, staggered so they don't stack
      at = now + 8_000 + index * 45_000;
    }

    if (soonest == null || at < soonest) {
      soonest = at;
      habit = h;
    }
  });

  // If everything done (or disabled), schedule tomorrow's earliest enabled habit
  if (!habit) {
    HABITS.forEach((h) => {
      if (!state.enabled[h.id]) return;
      const at = todayAt(h.hour, h.minute, new Date(now)) + 24 * 60 * 60 * 1000;
      if (soonest == null || at < soonest) {
        soonest = at;
        habit = h;
      }
    });
  }

  return habit && soonest != null ? { habit, at: soonest } : null;
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
  HABITS,
  defaultHabitState,
  normalizeHabitState,
  nextHabitDue,
  habitsDoneCount,
  todayAt,
};
