/**
 * "My classes": the user's own timetable, stored only in this browser
 * (localStorage). Pure helpers here; the UI is in src/ui/myClasses.js.
 *
 * A class: { id, name, room, day, start, end }
 *   room  — a room code as written on the timetable, e.g. "2남 212호"
 *   day   — 1 = Monday … 6 = Saturday, 0 = Sunday (like Date#getDay)
 *   start, end — "HH:MM" (24-hour)
 */

const STORAGE_KEY = 'icn.myClasses';

/** "09:30" → 570 (minutes after midnight); null if invalid. */
export function toMinutes(time) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(time ?? '').trim());
  if (!match) return null;
  const [h, m] = [Number(match[1]), Number(match[2])];
  return h < 24 && m < 60 ? h * 60 + m : null;
}

/**
 * Checks a class from the form. Returns a list of problems (empty = valid).
 * @param {object} item
 * @returns {string[]} i18n keys
 */
export function validateClass(item) {
  const problems = [];
  if (!String(item.name ?? '').trim()) problems.push('classes.errorName');
  if (!String(item.room ?? '').trim()) problems.push('classes.errorRoom');
  if (!(item.day >= 0 && item.day <= 6)) problems.push('classes.errorDay');
  const start = toMinutes(item.start);
  const end = toMinutes(item.end);
  if (start === null || end === null || end <= start) problems.push('classes.errorTime');
  return problems;
}

/**
 * The class that is on now, or the next one this week.
 * @param {object[]} classes
 * @param {Date} now
 * @returns {{item: object, ongoing: boolean, daysAhead: number, minutesUntil: number}|null}
 */
export function nextClass(classes, now = new Date()) {
  const today = now.getDay();
  const minute = now.getHours() * 60 + now.getMinutes();
  let best = null;
  for (const item of classes) {
    const start = toMinutes(item.start);
    const end = toMinutes(item.end);
    if (start === null || end === null) continue;
    let daysAhead = (item.day - today + 7) % 7;
    if (daysAhead === 0 && end <= minute) daysAhead = 7; // already over today
    const minutesUntil = daysAhead * 1440 + start - minute;
    const ongoing = daysAhead === 0 && start <= minute && minute < end;
    const rank = ongoing ? -1 : minutesUntil;
    if (!best || rank < best.rank) best = { item, ongoing, daysAhead, minutesUntil, rank };
  }
  if (!best) return null;
  const { rank, ...result } = best;
  return result;
}

/** Classes sorted by day (Monday first) and start time. */
export function sortClasses(classes) {
  const order = (day) => (day === 0 ? 7 : day);
  return [...classes].sort(
    (a, b) => order(a.day) - order(b.day) || toMinutes(a.start) - toMinutes(b.start),
  );
}

/** Reads the saved classes (an empty list if storage is unavailable). */
export function loadClasses() {
  try {
    const list = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(list) ? list.filter((c) => validateClass(c).length === 0) : [];
  } catch {
    return [];
  }
}

/** Saves the classes; returns false if the browser refused (private mode…). */
export function saveClasses(classes) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(classes));
    return true;
  } catch {
    return false;
  }
}
